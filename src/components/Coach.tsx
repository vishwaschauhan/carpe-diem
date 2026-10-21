import { CoachAction, Insight } from '../coach'
import { dropBlock, dropTask, getState, outcomesFor, rescheduleBlock, snoozeCoach, unplanTask } from '../store'
import { clock, dayKey } from '../time'
import { Icon, openModal, toast } from '../ui'
import { StartFocus, Unstick } from './modals'

export type Nav = (view: View, opts?: { planDate?: string }) => void
export type View = 'today' | 'plan' | 'goals' | 'review' | 'settings'

export function runCoachAction(a: CoachAction, nav: Nav) {
  const s = getState()
  const task = s.tasks.find(t => t.id === a.taskId)
  switch (a.kind) {
    case 'plan-today': nav('plan', { planDate: dayKey() }); break
    case 'plan-tomorrow': nav('review'); break
    case 'review': nav('review'); break
    case 'start': if (task) openModal(<StartFocus task={task} minutes={a.minutes} />); break
    case 'unstick': if (task) openModal(<Unstick task={task} />); break
    case 'reschedule': {
      const at = a.blockId ? rescheduleBlock(a.blockId) : null
      toast(at ? `Moved to ${clock(at)}.` : 'No free slot left today. Consider moving it to tomorrow.')
      break
    }
    case 'drop-block': if (a.blockId) { dropBlock(a.blockId); toast('Released. That was a decision, not a drift.') } break
    case 'drop-task': if (task && confirm(`Drop “${task.title}”? It will leave your plan.`)) { dropTask(task.id, 'postponed too often'); toast('Dropped. One less open loop.') } break
    case 'move-rest': {
      const today = dayKey()
      const rest = outcomesFor(s, today).filter(t => t.status === 'ready' && t.id !== a.taskId)
      rest.forEach(t => unplanTask(t.id))
      toast(`${rest.length} moved to the backlog. Plan them in tonight.`)
      break
    }
    case 'snooze': break
  }
}

export function CoachCard({ insight, nav }: { insight: Insight; nav: Nav }) {
  return (
    <div className={`coach tone-${insight.tone}`} role="status">
      <div className="coach-icon"><Icon name={insight.tone === 'good' ? 'sparkle' : insight.tone === 'protect' ? 'shield' : insight.tone === 'warn' ? 'flag' : 'compass'} size={17} /></div>
      <div className="coach-main">
        <div className="coach-title">{insight.title}</div>
        <p className="coach-body">{insight.body}</p>
        {(insight.actions.length > 0 || insight.tone !== 'protect') && (
          <div className="coach-actions">
            {insight.actions.map((a, i) => (
              <button key={i} className={a.primary ? 'primary sm' : 'ghost sm'} onClick={() => runCoachAction(a, nav)}>{a.label}</button>
            ))}
            {insight.tone !== 'protect' && <>
              <button className="text-btn" onClick={() => snoozeCoach(insight.id, 15)}>Snooze 15m</button>
              <button className="text-btn muted" onClick={() => snoozeCoach(insight.id, 'day')}>Dismiss</button>
            </>}
          </div>
        )}
      </div>
    </div>
  )
}
