import {
  State, Task, blockHonored, blocksFor, currentBlock, day, focusMsForTaskOnDay, freeGaps, nextBlock, outcomesFor, overdue, tomorrow,
} from './store'
import { clock, dayKey, duration, nowMin, toMin } from './time'

export type CoachActionKind =
  | 'plan-today' | 'plan-tomorrow' | 'start' | 'unstick' | 'reschedule' | 'drop-block'
  | 'review' | 'drop-task' | 'move-rest' | 'snooze'

export interface CoachAction {
  label: string
  kind: CoachActionKind
  taskId?: string
  blockId?: string
  minutes?: number
  primary?: boolean
}

export interface Insight {
  id: string
  tone: 'nudge' | 'warn' | 'good' | 'info' | 'protect'
  title: string
  body: string
  actions: CoachAction[]
  notify?: boolean
}

const MINUTE = 60_000

function isFocusingOn(s: State, taskId: string | null) {
  const t = s.timer
  return (t.mode === 'focus' || t.mode === 'paused') && (!taskId || t.taskId === taskId)
}

function topUnfinished(s: State, date: string): Task | undefined {
  return outcomesFor(s, date).find(t => t.status === 'ready')
}

/**
 * Rule-based accountability coach. Every message is derived from data the app actually has
 * (plans, blocks, sessions, postponements); when it can't know, it asks.
 */
export function coachInsights(s: State, at = new Date()): Insight[] {
  const today = dayKey(at)
  const now = at.getHours() * 60 + at.getMinutes()
  const out: Insight[] = []
  const outcomes = outcomesFor(s, today)
  const open = outcomes.filter(t => t.status === 'ready')
  const blocks = blocksFor(s, today)
  const cur = currentBlock(s, today, now)
  const taskById = (id: string | null) => s.tasks.find(t => t.id === id)
  const idle = s.timer.mode === 'idle'

  // Protected time: say nothing else.
  if (cur && cur.kind === 'family' && !isFocusingOn(s, null)) {
    return [{
      id: `family-${cur.id}`, tone: 'protect', title: cur.label || 'Family time',
      body: `Protected until ${clock(cur.end)}. Work can wait. Be here.`, actions: [],
    }]
  }

  const od = overdue(s, today)
  if (od.length) {
    out.push({
      id: `overdue-${today}`, tone: 'warn',
      title: `${od.length} unfinished from earlier`,
      body: 'Nothing rolls forward silently. Carry each one into today, park it in the backlog, or drop it on purpose.',
      actions: [{ label: 'Decide now', kind: 'plan-today', primary: true }],
    })
  }

  if (!outcomes.length && now < toMin(s.settings.eveningAt)) {
    out.push({
      id: `noplan-${today}`, tone: 'nudge', title: 'No commitments yet for today',
      body: 'Five minutes of planning beats a day of reacting. Pick up to three outcomes and give each a time.',
      actions: [{ label: 'Plan today', kind: 'plan-today', primary: true }], notify: true,
    })
  }

  // The block happening right now.
  if (cur && cur.kind === 'focus' && !cur.decision) {
    const task = taskById(cur.taskId)
    const late = Math.floor(now - toMin(cur.start))
    const onIt = isFocusingOn(s, cur.taskId) || blockHonored(s, cur)
    if (!onIt && (!task || task.status === 'ready')) {
      const title = task?.title ?? cur.label
      if (late < 5) {
        out.push({
          id: `blockstart-${cur.id}`, tone: 'nudge', title: `It’s time: ${title}`,
          body: task?.next ? `First step: ${task.next}` : `Until ${clock(cur.end)}. Start with the smallest concrete step.`,
          actions: task ? [
            { label: 'Start now', kind: 'start', taskId: task.id, minutes: Math.min(toMin(cur.end) - now, s.settings.defaultFocusMin) | 0, primary: true },
            { label: 'What’s in the way?', kind: 'unstick', taskId: task.id },
          ] : [],
          notify: true,
        })
      } else if (idle || s.timer.mode === 'transition') {
        out.push({
          id: `late-${cur.id}`, tone: 'warn', title: `Your block for “${title}” started ${late} min ago`,
          body: 'You don’t have to feel ready. Commit to five minutes; you can stop after that.',
          actions: [
            ...(task ? [{ label: 'Just 5 minutes', kind: 'start' as const, taskId: task.id, minutes: 5, primary: true },
              { label: 'What’s in the way?', kind: 'unstick' as const, taskId: task.id }] : []),
            { label: 'Reschedule', kind: 'reschedule', blockId: cur.id },
          ],
          notify: true,
        })
      }
    }
  }

  // Missed blocks earlier today, with no decision.
  for (const b of blocks) {
    if (b.kind !== 'focus' || b.decision || toMin(b.end) > now) continue
    if (blockHonored(s, b)) continue
    const task = taskById(b.taskId)
    if (task && task.status !== 'ready') continue
    out.push({
      id: `missed-${b.id}`, tone: 'warn', title: `Missed: ${task?.title ?? b.label}`,
      body: `Planned ${clock(b.start)}–${clock(b.end)}. Start it now, move it, or release it deliberately.`,
      actions: [
        ...(task ? [{ label: 'Start now', kind: 'start' as const, taskId: task.id, minutes: 25, primary: true }] : []),
        { label: 'Reschedule', kind: 'reschedule', blockId: b.id },
        { label: 'Release', kind: 'drop-block', blockId: b.id },
      ],
    })
  }

  // Transition after a meeting.
  const justEnded = blocks.filter(b => b.kind === 'fixed' && toMin(b.end) <= now && now - toMin(b.end) <= 20).pop()
  if (justEnded && (idle || s.timer.mode === 'paused') && !(cur && cur.kind !== 'break')) {
    const nb = nextBlock(s, today, now)
    const gap = (nb ? toMin(nb.start) : toMin(s.settings.dayEnd)) - now
    const paused = s.timer.mode === 'paused' ? taskById(s.timer.taskId) : undefined
    const pick = paused ?? topUnfinished(s, today)
    if (pick && gap >= 15) {
      out.push({
        id: `aftermeeting-${justEnded.id}`, tone: 'nudge', title: `${justEnded.label || 'Meeting'} is over. What’s next?`,
        body: `You have ${duration(gap)} before ${nb ? `“${nb.label}”` : 'the end of your day'}. ${paused ? `You were in the middle of “${pick.title}”.` : `Highest-priority open outcome: “${pick.title}”.`}`,
        actions: [{ label: paused ? 'Resume' : 'Start focus', kind: 'start', taskId: pick.id, minutes: Math.min(gap - 5, s.settings.defaultFocusMin), primary: true }],
        notify: true,
      })
    }
  }

  // Avoidance patterns.
  for (const t of open) {
    if (t.postponed >= 2) {
      out.push({
        id: `postponed-${t.id}-${t.postponed}`, tone: 'warn', title: `Postponed ${t.postponed} times: ${t.title}`,
        body: 'This is a pattern, not a scheduling accident. Is it still important? If yes, shrink it until it’s easy to start. If not, drop it and free your mind.',
        actions: [
          { label: 'Shrink it', kind: 'unstick', taskId: t.id, primary: true },
          { label: 'Drop it', kind: 'drop-task', taskId: t.id },
        ],
      })
    } else if (t.sessions >= 2) {
      out.push({
        id: `stalled-${t.id}-${t.sessions}`, tone: 'nudge', title: `${t.sessions} sessions on “${t.title}” and not done`,
        body: 'Is it blocked (you need something), or avoided (it feels hard)? Those need different fixes.',
        actions: [{ label: 'Diagnose it', kind: 'unstick', taskId: t.id, primary: true }],
      })
    }
  }

  // Eat the frog.
  const frog = open.find(t => t.frog)
  if (frog && now >= toMin('12:00') && focusMsForTaskOnDay(s, frog.id, today) === 0 && !isFocusingOn(s, frog.id)) {
    out.push({
      id: `frog-${frog.id}`, tone: 'nudge', title: 'The frog is still waiting',
      body: `“${frog.title}” hasn’t been touched today. The rest of the day gets easier once it has.`,
      actions: [{ label: 'Just 5 minutes', kind: 'start', taskId: frog.id, minutes: 5, primary: true },
        { label: 'What’s in the way?', kind: 'unstick', taskId: frog.id }],
    })
  }

  // Afternoon realism check.
  if (now >= toMin('14:00') && open.length >= 2) {
    const need = open.reduce((a, t) => a + Math.max(10, t.estimateMin - focusMsForTaskOnDay(s, t.id, today) / MINUTE), 0)
    const focusLeft = blocks.filter(b => b.kind === 'focus' && !b.decision && toMin(b.end) > now)
      .reduce((a, b) => a + toMin(b.end) - Math.max(now, toMin(b.start)), 0)
    const free = freeGaps(s, today, now).reduce((a, g) => a + g.end - g.start, 0)
    const avail = Math.min(focusLeft + free, Math.max(0, toMin(s.settings.eveningAt) - now))
    if (need > avail + 15) {
      const keep = frog ?? open[0]
      out.push({
        id: `realism-${today}-${open.length}`, tone: 'warn', title: 'The plan no longer fits the day',
        body: `About ${duration(need)} of work left and roughly ${duration(avail)} of usable time. Protect “${keep.title}” and move the rest, on purpose.`,
        actions: [
          { label: `Focus on ${keep.frog ? 'the frog' : 'the top one'}`, kind: 'start', taskId: keep.id, minutes: s.settings.defaultFocusMin, primary: true },
          { label: 'Move the rest to tomorrow', kind: 'move-rest', taskId: keep.id },
        ],
      })
    }
  }

  // Encouragement grounded in facts.
  const done = outcomes.filter(t => t.status === 'done')
  if (outcomes.length >= 2 && done.length === outcomes.length) {
    out.push({
      id: `alldone-${today}`, tone: 'good', title: 'Every commitment delivered',
      body: 'That’s a won day. Rest is a choice, not a failure. Or pick something from the backlog on purpose.',
      actions: [{ label: 'Review the day', kind: 'review' }],
    })
  } else if (outcomes.length === 3 && done.length === 2) {
    const left = open[0]
    out.push({
      id: `twodone-${today}`, tone: 'good', title: 'Two down, one to go',
      body: left ? `One important outcome left: “${left.title}”.` : 'One important outcome left.',
      actions: left ? [{ label: 'Start it', kind: 'start', taskId: left.id, minutes: s.settings.defaultFocusMin, primary: true }] : [],
    })
  }

  // Evening shutdown.
  if (now >= toMin(s.settings.eveningAt) && !day(s, tomorrow()).committedAt) {
    out.push({
      id: `evening-${today}`, tone: 'nudge', title: 'Shut down and plan tomorrow',
      body: 'Close today’s loops and decide tomorrow’s three outcomes. You’ll wake up knowing exactly where to start.',
      actions: [{ label: 'Start shutdown', kind: 'plan-tomorrow', primary: true }], notify: true,
    })
  }

  const snoozed = (id: string) => (s.coach[id] ?? 0) > at.getTime()
  return out.filter(i => !snoozed(i.id))
}

export function inQuietHours(s: State, now = nowMin()): boolean {
  const a = toMin(s.settings.quietStart)
  const b = toMin(s.settings.quietEnd)
  return a <= b ? now >= a && now < b : now >= a || now < b
}
