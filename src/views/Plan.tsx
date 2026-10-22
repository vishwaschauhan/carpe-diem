import { useEffect } from 'react'
import { Nav } from '../components/Coach'
import { Planner } from '../components/Planner'
import { State, applyRoutine, blocksFor, commitPlan, day, dropTask, outcomesFor, overdue, planTask, unpark, unplanTask } from '../store'
import { effortOf, spanOf } from '../schedule'
import { addDays, clock, dayKey, longDate, nowMin, relativeDay } from '../time'
import { Icon, toast } from '../ui'

export function Plan({ s, date, setDate, nav }: { s: State; date: string; setDate: (d: string) => void; nav: Nav }) {
  const today = dayKey()
  const tmr = addDays(today, 1)
  const outcomes = outcomesFor(s, date)
  const open = outcomes.filter(t => t.status === 'ready')
  const blocks = blocksFor(s, date).filter(b => !b.decision)
  const dlog = day(s, date)
  const od = overdue(s, date)
  const parkedToday = s.parked.filter(p => p.date <= today)
  const frog = outcomes.find(t => t.frog)
  const lead = frog && frog.status === 'ready' ? frog : open[0]
  const after = date === today ? nowMin() - 10 : 0
  const nextFocus = blocks.find(b => b.taskId && spanOf(b).end > after && open.some(t => t.id === b.taskId))
  const firstFocus = (lead && blocks.find(b => b.taskId === lead.id && spanOf(b).end > after)) ?? nextFocus
  const placedAll = open.length > 0 && open.every(t => effortOf(s, t).scheduled > 0)

  // Lay in the daily routine the first time a day is opened.
  useEffect(() => {
    if (date >= today && blocks.length === 0 && !dlog.committedAt) applyRoutine(date)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const intention = lead ? `When I sit down at ${firstFocus ? clock(firstFocus.start) : 'my desk'}, I will start “${lead.title}”.${lead.next ? ` First step: ${lead.next}.` : ''}` : ''
  const start = () => {
    commitPlan(date, intention)
    if (date === today) { toast(nextFocus ? `Day started. First up: ${nextFocus.label} at ${clock(nextFocus.start)}.` : 'Day started.'); nav('today') }
    else toast('Tomorrow is decided. Shut the laptop.')
  }

  return (
    <div className="page plan-page">
      <header className="page-head">
        <div>
          <div className="eyebrow">{date === tmr ? 'Evening ritual · 5 minutes' : 'Daily plan'}</div>
          <h1 className="page-title">Plan {date === today ? 'today' : date === tmr ? 'tomorrow' : longDate(date)}</h1>
          <p className="page-sub">{longDate(date)}. Choose what matters, give it time, start.</p>
        </div>
        <div className="seg">
          <button onClick={() => setDate(addDays(date, -1))} aria-label="Previous day" disabled={date <= today}>‹</button>
          <button className={date === today ? 'on' : ''} onClick={() => setDate(today)}>Today</button>
          <button className={date === tmr ? 'on' : ''} onClick={() => setDate(tmr)}>Tomorrow</button>
          <button onClick={() => setDate(addDays(date, 1))} aria-label="Next day">›</button>
        </div>
      </header>

      <ol className="steps-bar" aria-label="Planning steps">
        <li className={outcomes.length ? 'done' : 'on'}><span>1</span>Choose what matters</li>
        <li className={placedAll ? 'done' : outcomes.length ? 'on' : ''}><span>2</span>Place work on the calendar</li>
        <li className={dlog.committedAt ? 'done' : placedAll ? 'on' : ''}><span>3</span>Start</li>
      </ol>

      {(od.length > 0 || (date === tmr && parkedToday.length > 0)) && (
        <section className="card pad step">
          <div className="step-head"><span className="step-num"><Icon name="flag" size={13} /></span><div><h2>Close open loops</h2><p>Nothing rolls forward on its own. Each unfinished item gets a decision.</p></div></div>
          {od.map(t => (
            <div key={t.id} className="loop-row">
              <div><b>{t.title}</b><small>Planned {relativeDay(t.plannedDate!)}{t.postponed ? ` · postponed ${t.postponed}×` : ''}</small></div>
              <div className="row-actions">
                <button className="ghost sm" disabled={outcomes.length >= 3} onClick={() => planTask(t.id, date)}>Carry to {relativeDay(date).toLowerCase()}</button>
                <button className="ghost sm" onClick={() => unplanTask(t.id)}>Backlog</button>
                <button className="ghost sm danger" onClick={() => dropTask(t.id, 'released in review')}>Drop</button>
              </div>
            </div>
          ))}
          {date === tmr && parkedToday.map(p => (
            <div key={p.id} className="loop-row">
              <div><b>{p.text}</b><small>Parked distraction</small></div>
              <div className="row-actions">
                <button className="ghost sm" onClick={() => unpark(p.id, true)}>To backlog</button>
                <button className="ghost sm" onClick={() => unpark(p.id, false)}>Let it go</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <Planner s={s} date={date} />

      <section className="start-bar">
        <span className="step-num">3</span>
        <div className="grow">
          <b>{lead ? (nextFocus ? `First up: ${nextFocus.label} at ${clock(nextFocus.start)}` : `First up: ${lead.title}`) : 'Choose at least one outcome first'}</b>
          {lead && <small>{intention}</small>}
          {dlog.committedAt && <small className="ok-text"><Icon name="check" size={12} /> Started {new Date(dlog.committedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>}
        </div>
        <button className="primary" disabled={!lead} onClick={start}>
          <Icon name="play" size={15} /> {date === today ? (dlog.committedAt ? 'Back to today' : 'Start day') : 'Lock in tomorrow'}
        </button>
      </section>
    </div>
  )
}
