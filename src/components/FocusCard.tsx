import { State, Task, currentBlock, goalOf, outcomesFor, timerElapsed } from '../store'
import { clock, countdown, dayKey, duration, toMin } from '../time'
import { Icon, openModal } from '../ui'
import { BreakModal, DriftModal, PauseModal, StartFocus, SwitchModal, TaskEditor, TransitionModal, Unstick, endBreakNow, markDone } from './modals'
import { Nav } from './Coach'

/** The task the app thinks you should be on right now: the active one, then the current block's, then the frog, then the next open outcome. */
export function focusTask(s: State): Task | undefined {
  const today = dayKey()
  const byId = (id: string | null | undefined) => s.tasks.find(t => t.id === id)
  const active = byId(s.timer.taskId)
  if (active && (active.status === 'ready' || active.status === 'inbox' || s.timer.mode !== 'idle')) return active
  const open = outcomesFor(s, today).filter(t => t.status === 'ready')
  const block = currentBlock(s)
  return (block?.taskId ? open.find(t => t.id === block.taskId) : undefined) ?? open.find(t => t.frog) ?? open[0]
}

export function FocusCard({ s, nav, immersive, onImmersive }: { s: State; nav: Nav; immersive: boolean; onImmersive: (v: boolean) => void }) {
  const task = focusTask(s)
  const t = s.timer
  const goal = goalOf(s, task)
  const block = currentBlock(s)

  if (!task) {
    const hasOutcomes = outcomesFor(s, dayKey()).length > 0
    const evening = new Date().getHours() * 60 + new Date().getMinutes() >= toMin(s.settings.eveningAt)
    return (
      <section className="card focus focus-empty">
        <div className="focus-head"><span className="cap">Your one thing</span></div>
        <h1 className="focus-title">{hasOutcomes ? 'Every commitment is done.' : evening ? 'Tomorrow starts tonight.' : 'Your day is yours to shape.'}</h1>
        <p className="focus-sub">{hasOutcomes ? 'Rest on purpose, review the day, or pick a backlog item deliberately.' : evening ? 'Close today’s loops and pick tomorrow’s outcomes before bed. Five minutes.' : 'Commit to up to three outcomes and give each one a time. It takes five minutes.'}</p>
        <div className="controls">
          {hasOutcomes || evening ? <button className="primary" onClick={() => nav('review')}>{evening ? 'Shut down & plan tomorrow' : 'Review the day'} <Icon name="arrow" size={15} /></button>
            : <button className="primary" onClick={() => nav('plan', { planDate: dayKey() })}>Plan today <Icon name="arrow" size={15} /></button>}
        </div>
      </section>
    )
  }

  const focusing = t.mode === 'focus' && t.taskId === task.id
  const paused = t.mode === 'paused' && t.taskId === task.id
  const onBreak = t.mode === 'break'
  const inTransition = t.mode === 'transition'
  const elapsed = timerElapsed(t)
  const remaining = onBreak ? (t.breakEnd ?? 0) - Date.now() : t.plannedMs - elapsed
  const total = onBreak ? t.breakMs : t.plannedMs
  const progress = focusing || paused ? elapsed / Math.max(1, total) : onBreak ? 1 - remaining / Math.max(1, total) : 0
  const status = focusing ? 'Focusing' : paused ? 'Paused' : onBreak ? 'On a break' : inTransition ? 'Choose what’s next' : 'Ready'
  const tone = focusing ? 'go' : paused ? 'hold' : onBreak ? 'rest' : inTransition ? 'turn' : 'idle'
  const R = 52
  const C = 2 * Math.PI * R

  return (
    <section className={`card focus state-${tone} ${immersive ? 'immersive' : ''}`} aria-live="polite">
      <div className="focus-head">
        <span className="cap">{focusing ? 'Focusing on' : paused ? 'You were working on' : 'Your one thing right now'}</span>
        <div className="focus-head-right">
          <span className={`chip ${tone}`}><span className="dot" /> {status}</span>
          <button className="icon-btn" onClick={() => onImmersive(!immersive)} aria-label={immersive ? 'Exit focus mode' : 'Enter focus mode'} title="Focus mode (F)"><Icon name={immersive ? 'shrink' : 'expand'} size={16} /></button>
        </div>
      </div>
      <div className="focus-meta">
        {task.frog && <span className="tag frog"><Icon name="frog" size={13} /> Frog</span>}
        {goal && <span className="tag">{goal.title}</span>}
        {block?.taskId === task.id && <span className="tag soft"><Icon name="clock" size={12} /> {clock(block.start)}–{clock(block.end)}</span>}
        {task.postponed > 0 && <span className="tag warn">Postponed {task.postponed}×</span>}
      </div>
      <h1 className="focus-title">{task.title}</h1>

      {paused && task.resume && <div className="resume"><b>Resume here:</b> {task.resume}</div>}

      <div className="focus-grid">
        <div className="detail"><div className="detail-label">Next physical action</div><div className="detail-value">{(paused ? task.next : task.resume || task.next) || <button className="text-btn" onClick={() => openModal(<TaskEditor task={task} />)}>Add the first step</button>}</div></div>
        <div className="detail"><div className="detail-label">Done when</div><div className="detail-value">{task.doneWhen || <button className="text-btn" onClick={() => openModal(<TaskEditor task={task} />)}>Define done</button>}</div></div>
      </div>

      <div className="timer-row">
        <div className="ring" aria-label={`Timer ${countdown(remaining)}`}>
          <svg viewBox="0 0 120 120"><defs><linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#6a5cff" /><stop offset="55%" stopColor="#0a84ff" /><stop offset="100%" stopColor="#22c3ee" /></linearGradient></defs><circle cx="60" cy="60" r={R} className="ring-track" /><circle cx="60" cy="60" r={R} className="ring-fill" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, Math.max(0, progress)))} /></svg>
          <div className="ring-text">
            <span className="ring-time">{focusing || paused || onBreak ? countdown(remaining) : duration(task.estimateMin)}</span>
            <span className="ring-sub">{onBreak ? 'break left' : focusing || paused ? 'remaining' : 'estimate'}</span>
          </div>
        </div>
        <div className="timer-controls">
          {focusing && <>
            <div className="controls">
              <button className="primary" onClick={() => openModal(<PauseModal task={task} />)}><Icon name="pause" size={15} /> Pause / interrupted</button>
              <button className="ghost" onClick={() => markDone(task)}><Icon name="check" size={15} /> Done</button>
              <button className="ghost" onClick={() => openModal(<SwitchModal current={task} />)}><Icon name="switch" size={15} /> Switch</button>
            </div>
            <button className="text-btn drift" onClick={() => openModal(<DriftModal />)}>↪ I’m drifting</button>
          </>}
          {paused && <div className="controls">
            <button className="primary" onClick={() => openModal(<StartFocus task={task} />)}><Icon name="play" size={15} /> Resume focus</button>
            <button className="ghost" onClick={() => openModal(<SwitchModal current={task} />)}><Icon name="switch" size={15} /> Switch</button>
            <button className="ghost" onClick={() => markDone(task)}><Icon name="check" size={15} /> Done</button>
          </div>}
          {onBreak && <div className="controls"><button className="primary" onClick={endBreakNow}>I’m back <Icon name="arrow" size={15} /></button></div>}
          {inTransition && <div className="controls"><button className="primary" onClick={() => openModal(<TransitionModal />)}>Choose the next move <Icon name="arrow" size={15} /></button></div>}
          {t.mode === 'idle' && <>
            <div className="controls">
              <button className="primary big" onClick={() => openModal(<StartFocus task={task} />)}><Icon name="play" size={16} /> Start focus</button>
              <button className="ghost" onClick={() => openModal(<StartFocus task={task} minutes={5} />)}>Just 5 min</button>
            </div>
            <div className="controls subtle-row">
              <button className="text-btn" onClick={() => openModal(<Unstick task={task} />)}>What’s in the way?</button>
              <button className="text-btn" onClick={() => openModal(<SwitchModal current={task} />)}>Choose another</button>
              <button className="text-btn" onClick={() => openModal(<BreakModal />)}>Take a break</button>
            </div>
          </>}
          {(focusing || paused) && <p className="note">The timer ending never marks the outcome done. You decide.</p>}
          {t.mode === 'idle' && block && block.kind === 'focus' && block.taskId === task.id && <p className="note">This block runs until {clock(block.end)} ({Math.max(0, Math.round(toMin(block.end) - (new Date().getHours() * 60 + new Date().getMinutes())))} min left).</p>}
        </div>
      </div>
    </section>
  )
}
