import { useState } from 'react'
import { coachInsights } from '../coach'
import { CoachCard, Nav } from '../components/Coach'
import { FocusCard, focusTask } from '../components/FocusCard'
import { Timeline } from '../components/Timeline'
import { SwitchModal, TaskEditor, markDone } from '../components/modals'
import { scoreDay } from '../score'
import { State, Task, day, goalOf, outcomesFor, park, reopenTask, selectTask, unpark } from '../store'
import { dayKey, duration, greeting, longDate } from '../time'
import { Icon, openModal, toast } from '../ui'

export function Today({ s, nav, immersive, setImmersive }: { s: State; nav: Nav; immersive: boolean; setImmersive: (v: boolean) => void }) {
  const today = dayKey()
  const insights = coachInsights(s)
  const [showAll, setShowAll] = useState(false)
  const score = scoreDay(s, today)
  const d = day(s, today)

  if (immersive) {
    return (
      <div className="immersive-wrap">
        {insights[0] && insights[0].tone !== 'good' && <CoachCard insight={insights[0]} nav={nav} />}
        <FocusCard s={s} nav={nav} immersive onImmersive={setImmersive} />
        <ParkingLot s={s} compact />
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">{longDate(today)}</div>
          <h1 className="page-title">{greeting()}</h1>
        </div>
        {score.score !== null && (score.parts.some(p => p.key !== 'outcomes' && p.value !== null) || outcomesFor(s, today).some(t => t.status === 'done')) && <button className="score-pill" onClick={() => nav('review')} title="Daily execution score">
          <span className="score-num">{score.score ?? '–'}</span>
          <span className="score-label">Execution<br />score</span>
        </button>}
      </header>

      {d.intention && <div className="intention"><Icon name="flag" size={14} /> <span><b>Your commitment:</b> {d.intention}</span></div>}

      {insights.length > 0 && (
        <div className="coach-stack">
          {(showAll ? insights : insights.slice(0, 1)).map(i => <CoachCard key={i.id} insight={i} nav={nav} />)}
          {insights.length > 1 && <button className="text-btn" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show less' : `${insights.length - 1} more from your coach`}</button>}
        </div>
      )}

      <div className="today-grid">
        <div className="col">
          <FocusCard s={s} nav={nav} immersive={false} onImmersive={setImmersive} />
          <ParkingLot s={s} />
        </div>
        <div className="col">
          <Outcomes s={s} nav={nav} />
          <section className="card pad">
            <div className="card-head"><h2>Schedule</h2><span className="row-actions"><button className="text-btn" onClick={() => nav('hours')}>Hour by hour</button><button className="text-btn" onClick={() => nav('plan', { planDate: today })}>Edit plan</button></span></div>
            <Timeline s={s} date={today} />
          </section>
        </div>
      </div>
    </div>
  )
}

function Outcomes({ s, nav }: { s: State; nav: Nav }) {
  const today = dayKey()
  const list = outcomesFor(s, today)
  const done = list.filter(t => t.status === 'done').length
  const active = focusTask(s)
  return (
    <section className="card pad">
      <div className="card-head"><h2>Today’s outcomes</h2><span className="count">{done}/{list.length} done</span></div>
      <div className="outcomes">
        {list.map(t => <OutcomeRow key={t.id} s={s} t={t} active={active?.id === t.id} />)}
        {list.length === 0 && <p className="empty">Nothing committed yet. <button className="text-btn" onClick={() => nav('plan', { planDate: today })}>Plan today</button></p>}
      </div>
      {list.length < 3 && <button className="add-row" onClick={() => openModal(<TaskEditor date={today} />)}><Icon name="plus" size={14} /> Add an outcome</button>}
    </section>
  )
}

function OutcomeRow({ s, t, active }: { s: State; t: Task; active: boolean }) {
  const goal = goalOf(s, t)
  const focusing = s.timer.mode === 'focus' || s.timer.mode === 'paused'
  const select = () => {
    if (t.status !== 'ready' || active) return
    if (focusing) openModal(<SwitchModal current={s.tasks.find(x => x.id === s.timer.taskId)} targetId={t.id} />)
    else selectTask(t.id)
  }
  return (
    <div className={`outcome ${active ? 'active' : ''} ${t.status === 'done' ? 'done' : ''}`}>
      <input type="checkbox" className="check" aria-label={`Mark ${t.title} done`} checked={t.status === 'done'}
        onChange={() => t.status === 'done' ? reopenTask(t.id) : markDone(t)} />
      <button className="outcome-body" onClick={select}>
        <span className="outcome-title">{t.frog && <span className="frog-dot" title="The frog"><Icon name="frog" size={13} /></span>}{t.title}</span>
        <span className="outcome-sub">
          {goal ? goal.title : 'No goal'} · {t.focusMs > 0 ? `${duration(t.focusMs / 60000)} of ${duration(t.estimateMin)}` : duration(t.estimateMin)}
          {t.postponed > 0 && <span className="warn-text"> · postponed {t.postponed}×</span>}
        </span>
      </button>
      {active && t.status === 'ready' && <span className="now-badge">NOW</span>}
      <button className="icon-btn" onClick={() => openModal(<TaskEditor task={t} />)} aria-label={`Edit ${t.title}`}><Icon name="edit" size={15} /></button>
    </div>
  )
}

export function ParkingLot({ s, compact }: { s: State; compact?: boolean }) {
  const [text, setText] = useState('')
  const today = dayKey()
  const items = s.parked.filter(p => p.date === today)
  return (
    <section className="card pad">
      <div className="card-head"><h2>Distraction parking lot</h2><span className="count">{items.length} parked</span></div>
      <form className="inline-form" onSubmit={e => { e.preventDefault(); if (text.trim()) { park(text.trim()); setText(''); toast('Parked. Back to what matters.') } }}>
        <input id="capture-input" className="input" value={text} onChange={e => setText(e.target.value)} placeholder="An idea, urge, or side quest…" autoComplete="off" />
        <button className="secondary" type="submit">Park</button>
      </form>
      {!compact && (items.length ? (
        <ul className="parked">
          {items.slice(0, 6).map(p => (
            <li key={p.id}><span>{p.text}</span>
              <span className="row-actions">
                <button className="text-btn" onClick={() => { unpark(p.id, true); toast('Moved to backlog.') }}>To backlog</button>
                <button className="icon-btn" onClick={() => unpark(p.id, false)} aria-label="Remove"><Icon name="x" size={14} /></button>
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="empty">Catch the thought, write it here, and go back. You’ll triage these in tonight’s shutdown.</p>)}
    </section>
  )
}
