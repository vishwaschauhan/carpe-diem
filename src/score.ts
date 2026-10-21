import { State, blockHonored, blocksFor, day, focusMsForTaskOnDay, outcomesFor } from './store'
import { dayKey, nowMin, toMin } from './time'

export interface ScorePart {
  key: 'outcomes' | 'blocks' | 'recovery' | 'goals'
  label: string
  weight: number
  value: number | null // 0..1, null when it doesn't apply today
  detail: string
}

export interface DayScore {
  score: number | null
  parts: ScorePart[]
  wins: string[]
  attention: string[]
}

/**
 * Daily Execution Score. Transparent and based only on what the app can observe:
 * commitments made, outcomes finished, focus blocks started on time, interruptions recovered.
 * Parts that don't apply are left out and the remaining weights are rescaled.
 */
export function scoreDay(s: State, date: string): DayScore {
  const w = s.settings.weights
  const isToday = date === dayKey()
  const d = day(s, date)
  const outcomes = outcomesFor(s, date)
  const wins: string[] = []
  const attention: string[] = []

  // 1. Priority outcomes delivered (the frog counts double).
  let outcomesVal: number | null = null
  let outcomesDetail = 'No outcomes were planned.'
  if (outcomes.length) {
    const weightOf = (t: { frog: boolean }) => (t.frog ? 2 : 1)
    const total = outcomes.reduce((a, t) => a + weightOf(t), 0)
    const done = outcomes.filter(t => t.status === 'done')
    outcomesVal = done.reduce((a, t) => a + weightOf(t), 0) / total
    outcomesDetail = `${done.length} of ${outcomes.length} outcomes done`
    const frog = outcomes.find(t => t.frog)
    if (frog?.status === 'done') wins.push(`You ate the frog: “${frog.title}”.`)
    else if (frog) attention.push(`The frog “${frog.title}” is still open. Make it the first block tomorrow if it still matters.`)
  } else if (!isToday || nowMin() > toMin('10:00')) {
    attention.push('No outcomes were committed. A 5-minute plan the night before is the highest-leverage habit here.')
  }

  // 2. Planned focus blocks honored. Deliberate rescheduling counts; deliberate dropping counts half.
  const due = blocksFor(s, date).filter(b => b.kind === 'focus' && (!isToday || toMin(b.start) + 10 <= nowMin()))
  let blocksVal: number | null = null
  let blocksDetail = 'No focus blocks were due.'
  if (due.length) {
    let pts = 0
    let missed = 0
    for (const b of due) {
      if (blockHonored(s, b) || b.decision === 'rescheduled') pts += 1
      else if (b.decision === 'dropped') pts += 0.5
      else missed++
    }
    blocksVal = pts / due.length
    blocksDetail = `${due.length - missed} of ${due.length} blocks started or consciously moved`
    if (missed) attention.push(`${missed} focus block${missed > 1 ? 's' : ''} passed with no start and no decision. Missing is fine; drifting past is not.`)
    else wins.push('Every focus block was either started or consciously moved.')
  }

  // 3. Recovery after interruptions.
  let recoveryVal: number | null = null
  let recoveryDetail = 'No interruptions logged.'
  if (d.interruptions > 0) {
    recoveryVal = Math.min(1, d.recovered / d.interruptions)
    recoveryDetail = `Came back from ${Math.min(d.recovered, d.interruptions)} of ${d.interruptions} interruptions`
    if (recoveryVal >= 1) wins.push('You came back after every interruption.')
    else attention.push('Some interruptions never led back to work. Leave a breadcrumb when you pause.')
  }

  // 4. Progress on long-term goals: goal-linked outcomes that were finished or got real focus time.
  let goalsVal: number | null = null
  let goalsDetail = 'No goal-linked outcomes.'
  const linked = outcomes.filter(t => t.goalId)
  if (linked.length) {
    const moved = linked.filter(t => t.status === 'done' || focusMsForTaskOnDay(s, t.id, date) >= 15 * 60_000)
    goalsVal = moved.length / linked.length
    goalsDetail = `${moved.length} of ${linked.length} goal-linked outcomes moved forward`
  } else if (outcomes.length) {
    attention.push('None of the outcomes were linked to a goal. Is today serving your bigger plans?')
  }

  if (d.redirects >= 3) wins.push(`You caught yourself drifting ${d.redirects} times and came back. That is the skill.`)
  if (d.committedAt && day(s, date).committedAt) {
    const committedBefore = new Date(d.committedAt)
    if (dayKey(committedBefore) < date) wins.push('You planned this day the night before.')
  }

  const parts: ScorePart[] = [
    { key: 'outcomes', label: 'Outcomes delivered', weight: w.outcomes, value: outcomesVal, detail: outcomesDetail },
    { key: 'blocks', label: 'Focus blocks honored', weight: w.blocks, value: blocksVal, detail: blocksDetail },
    { key: 'recovery', label: 'Recovered from interruptions', weight: w.recovery, value: recoveryVal, detail: recoveryDetail },
    { key: 'goals', label: 'Progress on goals', weight: w.goals, value: goalsVal, detail: goalsDetail },
  ]
  const applicable = parts.filter(p => p.value !== null && p.weight > 0)
  const wsum = applicable.reduce((a, p) => a + p.weight, 0)
  const score = wsum > 0 ? Math.round((applicable.reduce((a, p) => a + p.weight * (p.value as number), 0) / wsum) * 100) : null
  return { score, parts, wins, attention }
}
