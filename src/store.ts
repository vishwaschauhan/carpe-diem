import { useSyncExternalStore } from 'react'
import { MIN, addDays, dayKey, fromMin, nowMin, stampAt, toMin } from './time'

// ---------- Domain model ----------

export type Area = 'work' | 'learning' | 'health' | 'family' | 'home'
export const AREAS: { id: Area; label: string }[] = [
  { id: 'work', label: 'Work' },
  { id: 'learning', label: 'Career & Learning' },
  { id: 'health', label: 'Health' },
  { id: 'family', label: 'Family' },
  { id: 'home', label: 'Personal & Home' },
]
export const areaLabel = (a: Area) => AREAS.find(x => x.id === a)?.label ?? a

export interface Goal {
  id: string
  title: string
  area: Area
  why: string
  milestone: string
  successCriteria: string
  targetDate: string
  weeklyTargetMin: number
  status: 'active' | 'paused' | 'done'
  createdAt: number
}

export type TaskStatus = 'inbox' | 'ready' | 'done' | 'dropped'
export interface Task {
  id: string
  title: string
  goalId: string | null
  area: Area
  next: string
  doneWhen: string
  estimateMin: number
  priority: 'gold' | 'silver'
  frog: boolean
  plannedDate: string | null
  status: TaskStatus
  resume: string
  postponed: number
  focusMs: number
  sessions: number
  doneAt: number | null
  createdAt: number
}

export type BlockKind = 'focus' | 'fixed' | 'family' | 'health' | 'break' | 'routine'
export const BLOCK_KINDS: { id: BlockKind; label: string; hint: string }[] = [
  { id: 'focus', label: 'Focus', hint: 'Deep work on an outcome' },
  { id: 'fixed', label: 'Meeting', hint: 'Fixed commitment' },
  { id: 'family', label: 'Family', hint: 'Protected, no nudges' },
  { id: 'health', label: 'Health', hint: 'Workout, recovery' },
  { id: 'routine', label: 'Routine', hint: 'Chores, errands, admin' },
  { id: 'break', label: 'Break', hint: 'Rest on purpose' },
]

export interface Block {
  id: string
  date: string
  start: string
  end: string
  kind: BlockKind
  label: string
  taskId: string | null
  decision: null | 'rescheduled' | 'dropped'
}

export interface RoutineBlock {
  id: string
  start: string
  end: string
  kind: BlockKind
  label: string
  days: number[] // 0 = Sunday
}

export interface Session {
  id: string
  taskId: string
  date: string
  start: number
  end: number
  ms: number
  outcome: 'done' | 'progress' | 'stuck' | 'switched' | null
}

export interface Parked {
  id: string
  text: string
  at: number
  date: string
}

export type StuckReason = 'unclear' | 'big' | 'boring' | 'anxious' | 'tired' | 'unimportant'

export interface DayLog {
  date: string
  committedAt: number | null
  intention: string
  reflection: string
  mattered: '' | 'yes' | 'partly' | 'no'
  takeaway: string
  shutdownAt: number | null
  redirects: number
  interruptions: number
  recovered: number
  switches: number
  unplanned: { id: string; at: number; text: string }[]
  stuck: { taskId: string; reason: StuckReason; at: number }[]
  events: { at: number; text: string }[]
}

export type TimerMode = 'idle' | 'focus' | 'paused' | 'break' | 'transition'
export interface Timer {
  mode: TimerMode
  taskId: string | null
  plannedMs: number
  accMs: number
  runStart: number | null
  sessionStart: number | null
  breakEnd: number | null
  breakMs: number
  transition: null | 'session' | 'break' | 'task'
  pausedAt: number | null
}

export interface Settings {
  dayStart: string
  dayEnd: string
  eveningAt: string
  theme: 'system' | 'light' | 'dark'
  notifications: boolean
  quietStart: string
  quietEnd: string
  defaultFocusMin: number
  weights: { outcomes: number; blocks: number; recovery: number; goals: number }
  routine: RoutineBlock[]
}

export interface State {
  version: 2
  goals: Goal[]
  tasks: Task[]
  blocks: Block[]
  sessions: Session[]
  parked: Parked[]
  days: Record<string, DayLog>
  timer: Timer
  settings: Settings
  coach: Record<string, number>
  onboarded: boolean
}

// ---------- Helpers ----------

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

const idleTimer = (): Timer => ({
  mode: 'idle', taskId: null, plannedMs: 0, accMs: 0, runStart: null, sessionStart: null,
  breakEnd: null, breakMs: 0, transition: null, pausedAt: null,
})

export function emptyDay(date: string): DayLog {
  return {
    date, committedAt: null, intention: '', reflection: '', mattered: '', takeaway: '', shutdownAt: null,
    redirects: 0, interruptions: 0, recovered: 0, switches: 0, unplanned: [], stuck: [], events: [],
  }
}

export function newTask(p: Partial<Task> & { title: string }): Task {
  return {
    id: uid(), goalId: null, area: 'work', next: '', doneWhen: '', estimateMin: 50, priority: 'gold',
    frog: false, plannedDate: null, status: 'inbox', resume: '', postponed: 0, focusMs: 0, sessions: 0,
    doneAt: null, createdAt: Date.now(), ...p,
  }
}

export function newGoal(p: Partial<Goal> & { title: string }): Goal {
  return {
    id: uid(), area: 'work', why: '', milestone: '', successCriteria: '', targetDate: '', weeklyTargetMin: 180,
    status: 'active', createdAt: Date.now(), ...p,
  }
}

function seed(): State {
  const today = dayKey()
  const g1 = newGoal({ title: 'Contribute to GC AI agents', area: 'work', why: 'Become a go-to engineer for agentic systems at work.', milestone: 'Land a first meaningful contribution', weeklyTargetMin: 300 })
  const g2 = newGoal({ title: 'Interview-ready: LeetCode + system design', area: 'learning', why: 'Keep career options open and skills sharp.', milestone: 'One problem a day, one design chapter a week', weeklyTargetMin: 240 })
  const g3 = newGoal({ title: 'Train consistently', area: 'health', why: 'Energy for work and family.', milestone: '4 workouts a week', weeklyTargetMin: 180 })
  const g4 = newGoal({ title: 'Be fully present with family', area: 'family', why: 'This is what it is all for.', milestone: 'Protected evening time, phone away', weeklyTargetMin: 0 })
  return {
    version: 2,
    goals: [g1, g2, g3, g4],
    tasks: [
      newTask({ title: 'Sobha payment to SBI', area: 'home', priority: 'silver', estimateMin: 15, next: 'Open the SBI app and find the payee' }),
      newTask({ title: 'Patent write-up on Graph RAG', area: 'work', goalId: g1.id, priority: 'gold', estimateMin: 60, next: 'Open a doc and list the three claims' }),
      newTask({ title: 'Start reading a system design book', area: 'learning', goalId: g2.id, priority: 'silver', estimateMin: 30, next: 'Pick the book and read the first chapter intro' }),
    ],
    blocks: [],
    sessions: [],
    parked: [],
    days: { [today]: emptyDay(today) },
    timer: idleTimer(),
    settings: {
      dayStart: '04:00', dayEnd: '23:00', eveningAt: '20:30', theme: 'system', notifications: false,
      quietStart: '21:30', quietEnd: '05:30', defaultFocusMin: 50,
      weights: { outcomes: 50, blocks: 20, recovery: 15, goals: 15 },
      routine: [
        { id: uid(), start: '05:45', end: '06:00', kind: 'routine', label: 'Plan check: review today’s commitments', days: [0, 1, 2, 3, 4, 5, 6] },
        { id: uid(), start: '06:00', end: '07:00', kind: 'health', label: 'Workout', days: [1, 2, 3, 4, 5] },
        { id: uid(), start: '18:00', end: '20:00', kind: 'family', label: 'Family time', days: [0, 1, 2, 3, 4, 5, 6] },
        { id: uid(), start: '20:30', end: '20:45', kind: 'routine', label: 'Shutdown + plan tomorrow', days: [0, 1, 2, 3, 4, 5, 6] },
      ],
    },
    coach: {},
    onboarded: false,
  }
}

// ---------- Persistence ----------

const KEY = 'carpe-diem-v2'
const V1_KEY = 'carpe-diem-focus-guard-v1'

function migrateV1(s: State) {
  try {
    const raw = localStorage.getItem(V1_KEY)
    if (!raw) return
    const v1 = JSON.parse(raw)
    const today = dayKey()
    for (const t of (v1.tasks || []).filter((t: any) => !t.doneAt).slice(0, 3)) {
      s.tasks.push(newTask({ title: t.title, next: t.next || '', doneWhen: t.done || '', resume: t.resume || '', status: 'ready', plannedDate: today }))
    }
    for (const p of v1.parked || []) s.parked.push({ id: uid(), text: p.text, at: p.at || Date.now(), date: today })
  } catch { /* ignore a broken v1 blob */ }
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as State
      if (s && s.version === 2) return s
    }
  } catch { /* fall through to a fresh state */ }
  const s = seed()
  migrateV1(s)
  return s
}

/** A timer left running, paused or mid-transition from an earlier day is closed out, not resumed. */
function settleStaleTimer(s: State) {
  const t = s.timer
  if (t.mode === 'idle') return
  const ref = t.runStart ?? t.pausedAt ?? t.sessionStart ?? t.breakEnd
  if (ref && dayKey(new Date(ref)) === dayKey()) return
  if ((t.mode === 'focus' || t.mode === 'paused') && t.taskId && t.sessionStart) {
    const ms = Math.min(timerElapsed({ ...t, runStart: t.runStart ? Math.min(Date.now(), t.runStart + t.plannedMs) : null }, Date.now()), t.plannedMs)
    if (ms >= 30_000) {
      s.sessions.push({ id: uid(), taskId: t.taskId, date: dayKey(new Date(t.sessionStart)), start: t.sessionStart, end: t.sessionStart + ms, ms, outcome: 'progress' })
      const task = s.tasks.find(x => x.id === t.taskId)
      if (task) { task.focusMs += ms; task.sessions++ }
    }
  }
  s.timer = { ...idleTimer(), taskId: null }
}

let state: State = load()
settleStaleTimer(state)
const listeners = new Set<() => void>()
let saveError = false

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    saveError = false
  } catch {
    saveError = true
  }
}

export function hasSaveError() { return saveError }

export function getState() { return state }

/** Apply a mutation to a copy of the state, persist it, and re-render. */
export function update(fn: (s: State) => void) {
  const next = structuredClone(state)
  fn(next)
  state = next
  persist()
  listeners.forEach(l => l())
}

export function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export function useStore(): State {
  return useSyncExternalStore(subscribe, getState)
}

// Re-render every few seconds so time-based views stay current.
let tickCount = 0
const tickListeners = new Set<() => void>()
setInterval(() => { tickCount++; tickListeners.forEach(l => l()) }, 1000)
let lastDay = dayKey()
setInterval(() => {
  if (dayKey() !== lastDay) { lastDay = dayKey(); update(s => settleStaleTimer(s)) }
}, 30_000)

export function useTick(): number {
  return useSyncExternalStore(l => { tickListeners.add(l); return () => { tickListeners.delete(l) } }, () => tickCount)
}

if (navigator.storage?.persist) navigator.storage.persist().catch(() => {})

export function exportJSON(): string {
  return JSON.stringify(state, null, 2)
}

export function importJSON(text: string): string | null {
  try {
    const s = JSON.parse(text)
    if (!s || s.version !== 2 || !Array.isArray(s.tasks) || !Array.isArray(s.goals) || !s.settings || !s.timer) {
      return 'That file is not a Carpe Diem v2 backup.'
    }
    update(d => Object.assign(d, s))
    return null
  } catch {
    return 'Could not read that file. Is it valid JSON?'
  }
}

export function resetAll() {
  localStorage.removeItem(KEY)
  state = seed()
  persist()
  listeners.forEach(l => l())
}

// ---------- Selectors ----------

export function day(s: State, date: string): DayLog {
  return s.days[date] ?? emptyDay(date)
}

export function ensureDay(s: State, date: string): DayLog {
  if (!s.days[date]) s.days[date] = emptyDay(date)
  return s.days[date]
}

export function log(s: State, text: string, date = dayKey()) {
  const d = ensureDay(s, date)
  d.events.unshift({ at: Date.now(), text })
  d.events = d.events.slice(0, 150)
}

export function outcomesFor(s: State, date: string): Task[] {
  return s.tasks
    .filter(t => t.plannedDate === date && t.status !== 'dropped')
    .sort((a, b) => Number(b.frog) - Number(a.frog) || a.createdAt - b.createdAt)
}

export function blocksFor(s: State, date: string): Block[] {
  return s.blocks.filter(b => b.date === date).sort((a, b) => toMin(a.start) - toMin(b.start))
}

export function backlog(s: State): Task[] {
  return s.tasks
    .filter(t => t.plannedDate === null && (t.status === 'inbox' || t.status === 'ready'))
    .sort((a, b) => (a.priority === b.priority ? b.createdAt - a.createdAt : a.priority === 'gold' ? -1 : 1))
}

/** Unfinished outcomes planned for a day before `date`. These never roll forward silently. */
export function overdue(s: State, date = dayKey()): Task[] {
  return s.tasks.filter(t => t.plannedDate !== null && t.plannedDate < date && t.status === 'ready')
}

export function goalOf(s: State, t: Task | null | undefined): Goal | undefined {
  return t?.goalId ? s.goals.find(g => g.id === t.goalId) : undefined
}

export function currentBlock(s: State, date = dayKey(), at = nowMin()): Block | undefined {
  return blocksFor(s, date).find(b => toMin(b.start) <= at && at < toMin(b.end))
}

export function nextBlock(s: State, date = dayKey(), at = nowMin()): Block | undefined {
  return blocksFor(s, date).find(b => toMin(b.start) > at)
}

export function timerElapsed(t: Timer, now = Date.now()): number {
  return t.accMs + (t.runStart ? now - t.runStart : 0)
}

/** Whether any focus session on the block's task overlapped the block window (with 10 min of grace). */
export function blockHonored(s: State, b: Block): boolean {
  const start = stampAt(b.date, b.start) - 10 * MIN
  const end = stampAt(b.date, b.end)
  const matches = (taskId: string) => !b.taskId || b.taskId === taskId
  if (s.sessions.some(x => matches(x.taskId) && x.end > start && x.start < end)) return true
  const t = s.timer
  if (t.sessionStart && t.taskId && matches(t.taskId) && (t.mode === 'focus' || t.mode === 'paused')) {
    return t.sessionStart < end && Date.now() > start
  }
  return false
}

export function focusMsForTaskOnDay(s: State, taskId: string, date: string): number {
  return s.sessions.filter(x => x.taskId === taskId && x.date === date).reduce((a, x) => a + x.ms, 0)
}

/** Free gaps (in minutes since midnight) within the working day, ignoring breaks. */
export function freeGaps(s: State, date: string, from: number): { start: number; end: number }[] {
  const dayStart = Math.max(toMin(s.settings.dayStart), from)
  const dayEnd = toMin(s.settings.dayEnd)
  const busy = blocksFor(s, date).filter(b => !b.decision).map(b => [toMin(b.start), toMin(b.end)] as const)
  const gaps: { start: number; end: number }[] = []
  let cursor = dayStart
  for (const [a, b] of busy) {
    if (a > cursor) gaps.push({ start: cursor, end: Math.min(a, dayEnd) })
    cursor = Math.max(cursor, b)
  }
  if (cursor < dayEnd) gaps.push({ start: cursor, end: dayEnd })
  return gaps.filter(g => g.end - g.start >= 15)
}

export function plannedFocusMin(s: State, date: string): number {
  return blocksFor(s, date).filter(b => b.kind === 'focus' && !b.decision).reduce((a, b) => a + toMin(b.end) - toMin(b.start), 0)
}

// ---------- Actions: planning ----------

export function addOutcome(date: string, p: Partial<Task> & { title: string }) {
  update(s => {
    const t = newTask({ status: 'ready', plannedDate: date, ...p })
    if (t.frog) s.tasks.forEach(x => { if (x.plannedDate === date) x.frog = false })
    s.tasks.push(t)
    log(s, `Planned outcome: ${t.title}`, date)
  })
}

export function saveTask(id: string, patch: Partial<Task>) {
  update(s => {
    const t = s.tasks.find(x => x.id === id)
    if (!t) return
    if (patch.frog && t.plannedDate) s.tasks.forEach(x => { if (x.plannedDate === t.plannedDate) x.frog = false })
    Object.assign(t, patch)
  })
}

export function setFrog(id: string) {
  update(s => {
    const t = s.tasks.find(x => x.id === id)
    if (!t) return
    const was = t.frog
    s.tasks.forEach(x => { if (x.plannedDate === t.plannedDate) x.frog = false })
    t.frog = !was
  })
}

/** Move a task onto a day's outcomes. Counts as a postponement if it was planned for an earlier day. */
export function planTask(id: string, date: string) {
  update(s => {
    const t = s.tasks.find(x => x.id === id)
    if (!t) return
    if (t.plannedDate && t.plannedDate < date) {
      t.postponed++
      log(s, `Carried forward (${t.postponed}×): ${t.title}`, date)
    }
    t.plannedDate = date
    t.status = 'ready'
    t.frog = false
  })
}

export function unplanTask(id: string) {
  update(s => {
    const t = s.tasks.find(x => x.id === id)
    if (!t) return
    if (t.plannedDate && t.plannedDate < dayKey()) t.postponed++
    t.plannedDate = null
    t.status = 'ready'
    t.frog = false
    s.blocks.forEach(b => { if (b.taskId === id && b.date >= dayKey()) b.taskId = null })
  })
}

export function dropTask(id: string, why = '') {
  update(s => {
    const t = s.tasks.find(x => x.id === id)
    if (!t) return
    t.status = 'dropped'
    s.blocks.forEach(b => { if (b.taskId === id && b.date >= dayKey()) b.taskId = null })
    if (s.timer.taskId === id) s.timer = idleTimer()
    log(s, `Dropped deliberately: ${t.title}${why ? ` (${why})` : ''}`)
  })
}

export function deleteTask(id: string) {
  update(s => {
    s.tasks = s.tasks.filter(t => t.id !== id)
    s.blocks.forEach(b => { if (b.taskId === id) b.taskId = null })
    if (s.timer.taskId === id) s.timer = idleTimer()
  })
}

export function addTask(p: Partial<Task> & { title: string }) {
  update(s => { s.tasks.push(newTask(p)) })
}

export function addInbox(title: string, priority: 'gold' | 'silver' = 'silver') {
  update(s => { s.tasks.push(newTask({ title, priority, estimateMin: 25 })) })
}

export function addBlock(b: Omit<Block, 'id' | 'decision'>) {
  update(s => { s.blocks.push({ ...b, id: uid(), decision: null }) })
}

export function saveBlock(id: string, patch: Partial<Block>) {
  update(s => {
    const b = s.blocks.find(x => x.id === id)
    if (b) Object.assign(b, patch)
  })
}

export function deleteBlock(id: string) {
  update(s => { s.blocks = s.blocks.filter(b => b.id !== id) })
}

export function applyRoutine(date: string) {
  update(s => {
    const dow = new Date(stampAt(date, '12:00')).getDay()
    for (const r of s.settings.routine.filter(r => r.days.includes(dow))) {
      const exists = s.blocks.some(b => b.date === date && b.start === r.start && b.label === r.label)
      if (!exists) s.blocks.push({ id: uid(), date, start: r.start, end: r.end, kind: r.kind, label: r.label, taskId: null, decision: null })
    }
  })
}

/** Place each unscheduled outcome into the earliest free gap, frog first, with a 10 minute buffer. */
export function autoPlace(date: string): string[] {
  const placed: string[] = []
  update(s => {
    const from = date === dayKey() ? Math.ceil(nowMin() / 5) * 5 : 0
    const scheduled = new Set(s.blocks.filter(b => b.date === date && b.taskId).map(b => b.taskId))
    for (const t of outcomesFor(s, date).filter(t => t.status === 'ready' && !scheduled.has(t.id))) {
      const gaps = freeGaps(s, date, from)
      const len = Math.max(15, Math.min(t.estimateMin, 120))
      const gap = gaps.find(g => g.end - g.start >= len + 10) ?? gaps.find(g => g.end - g.start >= 25)
      if (!gap) continue
      const start = gap.start === from ? gap.start : gap.start + 5
      const end = Math.min(start + len, gap.end - 5)
      s.blocks.push({ id: uid(), date, start: fromMin(start), end: fromMin(end), kind: 'focus', label: t.title, taskId: t.id, decision: null })
      placed.push(t.title)
    }
  })
  return placed
}

export function commitPlan(date: string, intention: string) {
  update(s => {
    const d = ensureDay(s, date)
    d.committedAt = Date.now()
    d.intention = intention
    log(s, 'Committed to the plan', date)
  })
}

/** Move a missed focus block to the next free gap today, keeping its length. */
export function rescheduleBlock(id: string): string | null {
  let result: string | null = null
  update(s => {
    const b = s.blocks.find(x => x.id === id)
    if (!b) return
    const len = toMin(b.end) - toMin(b.start)
    const from = Math.ceil(nowMin() / 5) * 5
    const gap = freeGaps(s, b.date, from).find(g => g.end - g.start >= Math.min(len, 25))
    b.decision = 'rescheduled'
    if (gap) {
      const end = Math.min(gap.start + len, gap.end)
      s.blocks.push({ ...b, id: uid(), start: fromMin(gap.start), end: fromMin(end), decision: null })
      result = fromMin(gap.start)
      log(s, `Rescheduled block to ${result}: ${b.label}`)
    } else {
      log(s, `No room left today for: ${b.label}`)
    }
  })
  return result
}

export function dropBlock(id: string) {
  update(s => {
    const b = s.blocks.find(x => x.id === id)
    if (b) { b.decision = 'dropped'; log(s, `Released block deliberately: ${b.label}`) }
  })
}

// ---------- Actions: execution ----------

function endSession(s: State, outcome: Session['outcome']) {
  const t = s.timer
  if (!t.taskId || !t.sessionStart) return
  const now = Date.now()
  const ms = Math.min(timerElapsed(t, now), t.plannedMs || Infinity)
  if (ms >= 30_000) {
    s.sessions.push({ id: uid(), taskId: t.taskId, date: dayKey(new Date(t.sessionStart)), start: t.sessionStart, end: now, ms, outcome })
    const task = s.tasks.find(x => x.id === t.taskId)
    if (task) { task.focusMs += ms; task.sessions++ }
  }
}

export function startFocus(taskId: string, minutes: number) {
  update(s => {
    const t = s.timer
    if ((t.mode === 'focus' || t.mode === 'paused') && t.taskId && t.taskId !== taskId) endSession(s, 'switched')
    const task = s.tasks.find(x => x.id === taskId)
    if (!task) return
    if (t.mode === 'paused' && t.taskId === taskId) {
      // resume the same session
      s.timer = { ...t, mode: 'focus', runStart: Date.now(), pausedAt: null }
      ensureDay(s, dayKey()).recovered++
      log(s, `Resumed: ${task.title}`)
      return
    }
    s.timer = {
      ...idleTimer(), mode: 'focus', taskId, plannedMs: minutes * MIN, runStart: Date.now(), sessionStart: Date.now(),
    }
    if (task.status === 'inbox') task.status = 'ready'
    log(s, `Started ${minutes}m focus: ${task.title}`)
  })
}

export function pauseFocus(resumeNote: string) {
  update(s => {
    const t = s.timer
    if (t.mode !== 'focus') return
    const task = s.tasks.find(x => x.id === t.taskId)
    if (task) task.resume = resumeNote
    s.timer = { ...t, mode: 'paused', accMs: timerElapsed(t), runStart: null, pausedAt: Date.now() }
    ensureDay(s, dayKey()).interruptions++
    log(s, `Paused (interrupted): ${task?.title ?? ''}`)
  })
}

export function finishSession(outcome: 'done' | 'progress' | 'stuck', nextAction?: string) {
  update(s => {
    const t = s.timer
    const task = s.tasks.find(x => x.id === t.taskId)
    endSession(s, outcome)
    if (task) {
      if (nextAction !== undefined && nextAction.trim()) { task.next = nextAction.trim(); task.resume = '' }
      if (outcome === 'done') { task.status = 'done'; task.doneAt = Date.now(); log(s, `Completed: ${task.title}`) }
      else log(s, `Session ended (${outcome}): ${task.title}`)
    }
    s.timer = { ...idleTimer(), taskId: t.taskId, mode: outcome === 'done' ? 'transition' : 'idle', transition: outcome === 'done' ? 'task' : null }
  })
}

/** Called by the clock when a focus block runs out. The task is never auto-completed. */
export function sessionTimeUp() {
  update(s => {
    const t = s.timer
    if (t.mode !== 'focus') return
    s.timer = { ...t, mode: 'transition', transition: 'session', accMs: t.plannedMs, runStart: null }
    log(s, 'Focus block finished')
  })
}

export function completeTask(id: string) {
  update(s => {
    const task = s.tasks.find(x => x.id === id)
    if (!task) return
    if (s.timer.taskId === id && (s.timer.mode === 'focus' || s.timer.mode === 'paused' || s.timer.mode === 'transition')) {
      endSession(s, 'done')
      s.timer = { ...idleTimer(), taskId: id, mode: 'transition', transition: 'task' }
    }
    task.status = 'done'
    task.doneAt = Date.now()
    log(s, `Completed: ${task.title}`)
  })
}

export function reopenTask(id: string) {
  update(s => {
    const task = s.tasks.find(x => x.id === id)
    if (task) { task.status = 'ready'; task.doneAt = null }
  })
}

export function switchTo(targetId: string, reason: string, breadcrumb: string) {
  update(s => {
    const t = s.timer
    const prev = s.tasks.find(x => x.id === t.taskId)
    if (prev) prev.resume = breadcrumb
    if (t.mode === 'focus' || t.mode === 'paused' || t.mode === 'transition') endSession(s, 'switched')
    const d = ensureDay(s, dayKey())
    d.switches++
    if (t.mode === 'paused') d.recovered++
    s.timer = { ...idleTimer(), taskId: targetId }
    const target = s.tasks.find(x => x.id === targetId)
    log(s, `Switched intentionally to ${target?.title ?? 'another task'} (${reason})`)
  })
}

export function selectTask(id: string) {
  update(s => {
    if (s.timer.mode === 'focus' || s.timer.mode === 'paused') return
    s.timer = { ...idleTimer(), taskId: id }
  })
}

export function startBreak(minutes: number) {
  update(s => {
    const t = s.timer
    if (t.mode === 'focus' || t.mode === 'paused') endSession(s, 'progress')
    s.timer = { ...idleTimer(), taskId: t.taskId, mode: 'break', breakEnd: Date.now() + minutes * MIN, breakMs: minutes * MIN }
    log(s, `Took a ${minutes}m break`)
  })
}

export function breakOver() {
  update(s => {
    if (s.timer.mode !== 'break') return
    s.timer = { ...s.timer, mode: 'transition', transition: 'break', breakEnd: null }
  })
}

export function clearTransition() {
  update(s => { s.timer = { ...idleTimer(), taskId: s.timer.taskId } })
}

export function park(text: string, redirected = true) {
  update(s => {
    s.parked.unshift({ id: uid(), text, at: Date.now(), date: dayKey() })
    if (redirected) ensureDay(s, dayKey()).redirects++
    log(s, `Parked: ${text.slice(0, 80)}`)
  })
}

export function noteReturn() {
  update(s => { ensureDay(s, dayKey()).redirects++; log(s, 'Noticed a drift and returned') })
}

export function unpark(id: string, toInbox: boolean) {
  update(s => {
    const p = s.parked.find(x => x.id === id)
    s.parked = s.parked.filter(x => x.id !== id)
    if (p && toInbox) s.tasks.push(newTask({ title: p.text, priority: 'silver', estimateMin: 25 }))
  })
}

export function logUnplanned(text: string) {
  update(s => {
    ensureDay(s, dayKey()).unplanned.unshift({ id: uid(), at: Date.now(), text })
    log(s, `Unplanned: ${text}`)
  })
}

export function recordStuck(taskId: string, reason: StuckReason) {
  update(s => { ensureDay(s, dayKey()).stuck.push({ taskId, reason, at: Date.now() }) })
}

export function patchDay(date: string, patch: Partial<DayLog>) {
  update(s => { Object.assign(ensureDay(s, date), patch) })
}

export function snoozeCoach(id: string, minutes: number | 'day') {
  update(s => {
    s.coach[id] = minutes === 'day' ? stampAt(dayKey(), '23:59') : Date.now() + minutes * MIN
  })
}

export function patchSettings(patch: Partial<Settings>) {
  update(s => { Object.assign(s.settings, patch) })
}

export function saveGoal(g: Goal) {
  update(s => {
    const i = s.goals.findIndex(x => x.id === g.id)
    if (i >= 0) s.goals[i] = g
    else s.goals.push(g)
  })
}

export function deleteGoal(id: string) {
  update(s => {
    s.goals = s.goals.filter(g => g.id !== id)
    s.tasks.forEach(t => { if (t.goalId === id) t.goalId = null })
  })
}

export function finishOnboarding() {
  update(s => { s.onboarded = true })
}

export const tomorrow = () => addDays(dayKey(), 1)
