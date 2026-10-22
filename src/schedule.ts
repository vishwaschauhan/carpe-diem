// Scheduling rules in one place. Every way a block gets a time (drag, resize, quick
// schedule, the block editor, suggestions, routine) asks these functions first, so the
// calendar is the single source of truth for what is free.
//
// Times are minutes since local midnight on a calendar day. Blocks store local "HH:MM"
// wall-clock times, so a 9am meeting stays at 9am across time zone and DST changes.
import type { Block, State, Task } from './store'
import { dayKey, duration, clock, fromMin, nowMin, toMin } from './time'

export const SNAP = 5
export const MIN_LEN = 10
export const DAY_END = 24 * 60

export interface Span { start: number; end: number }

export const isActive = (b: Block) => !b.decision
/** Blocks are exclusive by default; `shared` is the explicit exception. */
export const isExclusive = (b: Block) => isActive(b) && !b.shared
export const spanOf = (b: Block): Span => ({ start: toMin(b.start), end: b.end === '23:59' ? DAY_END : toMin(b.end) })
export const len = (sp: Span) => sp.end - sp.start
export const snap = (m: number, step = SNAP) => Math.round(m / step) * step
const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end

export function activeBlocks(s: State, date: string): Block[] {
  return s.blocks.filter(b => b.date === date && isActive(b)).sort((a, b) => toMin(a.start) - toMin(b.start))
}

/** Exclusive blocks a span would overlap. Back-to-back is fine (10:00–10:30 then 10:30–11:00). */
export function conflictsFor(s: State, date: string, span: Span, exceptId?: string | null): Block[] {
  return activeBlocks(s, date).filter(b => b.id !== exceptId && isExclusive(b) && overlaps(spanOf(b), span))
}

/** Free spans between exclusive blocks within [from, to). */
export function gapsBetween(s: State, date: string, from: number, to: number, exceptId?: string | null): Span[] {
  const busy = activeBlocks(s, date).filter(b => b.id !== exceptId && isExclusive(b)).map(spanOf)
  const out: Span[] = []
  let cursor = from
  for (const b of busy) {
    if (b.end <= cursor) continue
    if (b.start >= to) break
    if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, to) })
    cursor = Math.max(cursor, b.end)
  }
  if (cursor < to) out.push({ start: cursor, end: to })
  return out.filter(g => g.end > g.start)
}

/** The planning window: the configured day, and from now on if it's today. */
export function planningWindow(s: State, date: string): Span {
  const start = toMin(s.settings.dayStart)
  const end = Math.max(start + 60, toMin(s.settings.dayEnd))
  if (date === dayKey()) {
    const now = Math.ceil(nowMin() / SNAP) * SNAP
    return { start: Math.min(Math.max(start, now), end), end }
  }
  return { start, end }
}

/**
 * The start time nearest to `near` where a block of `length` minutes fits without
 * touching an exclusive block. Searches the whole day, but never before `notBefore`.
 */
export function nearestFree(s: State, date: string, length: number, near: number, exceptId?: string | null, notBefore = 0): number | null {
  let best: number | null = null
  for (const g of gapsBetween(s, date, notBefore, DAY_END, exceptId)) {
    if (len(g) < length) continue
    const at = Math.min(Math.max(near, g.start), g.end - length)
    if (best === null || Math.abs(at - near) < Math.abs(best - near) || (Math.abs(at - near) === Math.abs(best - near) && at > best)) best = at
  }
  return best
}

/** Earliest start inside the planning window that fits `length`, leaving 5 minutes to breathe after the previous block. */
export function firstFit(s: State, date: string, length: number): number | null {
  const w = planningWindow(s, date)
  for (const g of gapsBetween(s, date, w.start, w.end)) {
    const start = g.start === w.start ? g.start : g.start + 5
    if (g.end - start >= length) return start
  }
  return null
}

export function sessionsOf(s: State, taskId: string): Block[] {
  return s.blocks.filter(b => b.taskId === taskId && isActive(b)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
}

export interface Effort { estimate: number; scheduled: number; remaining: number; spent: number; sessions: Block[] }
/** A task's effort: what it needs, what has a time, what is left to place, and what was actually worked. */
export function effortOf(s: State, t: Task): Effort {
  const sessions = sessionsOf(s, t.id)
  const scheduled = sessions.reduce((a, b) => a + len(spanOf(b)), 0)
  return { estimate: t.estimateMin, scheduled, remaining: Math.max(0, t.estimateMin - scheduled), spent: Math.round(t.focusMs / 60000), sessions }
}

/** The length a new session for this task should get: what's left, within 15–90 minutes. */
export const sessionLength = (e: Effort) => e.remaining > 0 ? Math.min(90, Math.max(15, e.remaining)) : 30

export interface Capacity { window: Span; scheduled: number; free: number; unscheduled: number }
export function capacity(s: State, date: string, priorities: Task[]): Capacity {
  const w = planningWindow(s, date)
  const free = gapsBetween(s, date, w.start, w.end).reduce((a, g) => a + len(g), 0)
  const unscheduled = priorities.filter(t => t.status === 'ready').reduce((a, t) => a + effortOf(s, t).remaining, 0)
  return { window: w, scheduled: len(w) - free, free, unscheduled }
}

/** Split a remaining effort into sessions that fit the free gaps, earliest first, at most 90 minutes each. */
export function splitPlan(s: State, date: string, remaining: number, chunk = 90): Span[] {
  const w = planningWindow(s, date)
  const out: Span[] = []
  let left = remaining
  for (const g of gapsBetween(s, date, w.start, w.end)) {
    let cursor = g.start === w.start ? g.start : g.start + 5
    while (left >= 15 && g.end - cursor >= 25) {
      const l = Math.min(chunk, left, g.end - cursor)
      if (l < 25 && left >= 25) break
      out.push({ start: cursor, end: cursor + l })
      left -= l
      cursor += l + 10
    }
    if (left < 15) break
  }
  return out
}

export function describeConflict(b: Block) {
  return `“${b.label}” (${clock(b.start)}–${clock(b.end)})`
}

export function hhmm(m: number) { return m >= DAY_END ? '23:59' : fromMin(m) }

export { duration }
