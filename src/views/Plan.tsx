import { useEffect, useState } from 'react'
import { Nav } from '../components/Coach'
import { Timeline } from '../components/Timeline'
import { TaskEditor } from '../components/modals'
import {
  State, addInbox, applyRoutine, autoPlace, backlog, blocksFor, commitPlan, day, dropTask, freeGaps, goalOf, outcomesFor, overdue,
  planTask, setFrog, unpark, unplanTask,
} from '../store'
import { addDays, clock, dayKey, duration, longDate, nowMin, relativeDay, toMin } from '../time'
import { Icon, openModal, toast } from '../ui'

export function Plan({ s, date, setDate, nav }: { s: State; date: string; setDate: (d: string) => void; nav: Nav }) {
  const today = dayKey()
  const tmr = addDays(today, 1)
  const outcomes = outcomesFor(s, date)
  const open = outcomes.filter(t => t.status === 'ready')
  const blocks = blocksFor(s, date)
  const dlog = day(s, date)
  const od = overdue(s, date)
  const parkedToday = s.parked.filter(p => p.date <= today)
  const frog = outcomes.find(t => t.frog)
  const scheduled = new Set(blocks.filter(b => b.taskId && !b.decision).map(b => b.taskId))
  const unscheduled = open.filter(t => !scheduled.has(t.id))
  const from = date === today ? nowMin() : 0
  const free = freeGaps(s, date, from).reduce((a, g) => a + g.end - g.start, 0)
  const focusPlanned = blocks.filter(b => b.kind === 'focus' && !b.decision && toMin(b.end) > from).reduce((a, b) => a + toMin(b.end) - Math.max(from, toMin(b.start)), 0)
  const need = open.reduce((a, t) => a + t.estimateMin, 0)
  const overlaps = blocks.filter((b, i) => blocks.some((o, j) => j !== i && !b.decision && !o.decision && toMin(o.start) < toMin(b.end) && toMin(b.start) < toMin(o.end)))
  const firstFocus = blocks.find(b => b.kind === 'focus' && !b.decision && (frog ? b.taskId === frog.id : true))
  const lead = frog ?? open[0]

  // Fill tomorrow's routine automatically the first time it is opened.
  useEffect(() => {
    if (date >= today && blocks.length === 0 && !dlog.committedAt) applyRoutine(date)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const defaultIntention = lead ? `When I sit down at ${firstFocus ? clock(firstFocus.start) : 'my desk'}, I will start “${lead.title}”.${lead.next ? ` First step: ${lead.next}.` : ''}` : ''
  const [intention, setIntention] = useState(dlog.intention || defaultIntention)
  useEffect(() => { setIntention(day(s, date).intention || defaultIntention) }, [date, lead?.id, firstFocus?.start]) // eslint-disable-line react-hooks/exhaustive-deps

  let step = 1
  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <div className="eyebrow">{date === tmr ? 'Evening ritual · 5 minutes' : 'Daily plan'}</div>
          <h1 className="page-title">Plan {relativeDay(date).toLowerCase() === 'today' ? 'today' : relativeDay(date) === 'Tomorrow' ? 'tomorrow' : longDate(date)}</h1>
          <p className="page-sub">{longDate(date)}. Decide tonight, so tomorrow you only have to execute.</p>
        </div>
        <div className="seg">
          <button className={date === today ? 'on' : ''} onClick={() => setDate(today)}>Today</button>
          <button className={date === tmr ? 'on' : ''} onClick={() => setDate(tmr)}>Tomorrow</button>
        </div>
      </header>

      {(od.length > 0 || (date === tmr && parkedToday.length > 0)) && (
        <section className="card pad step">
          <div className="step-head"><span className="step-num">{step++}</span><div><h2>Close open loops</h2><p>Nothing rolls forward on its own. Each unfinished item gets a decision.</p></div></div>
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

      <section className="card pad step">
        <div className="step-head"><span className="step-num">{step++}</span><div><h2>Choose up to three outcomes</h2><p>If you could finish only one, which would make the day a win? Mark it as the frog. It goes first.</p></div></div>
        <div className="outcomes">
          {outcomes.map(t => {
            const g = goalOf(s, t)
            return (
              <div key={t.id} className={`outcome ${t.status === 'done' ? 'done' : ''}`}>
                <button className={`frog-toggle ${t.frog ? 'on' : ''}`} onClick={() => setFrog(t.id)} title={t.frog ? 'This is the frog' : 'Make this the frog'} aria-pressed={t.frog}><Icon name="frog" size={16} /></button>
                <button className="outcome-body" onClick={() => openModal(<TaskEditor task={t} />)}>
                  <span className="outcome-title">{t.title}</span>
                  <span className="outcome-sub">{g ? g.title : <span className="warn-text">No goal linked</span>} · {duration(t.estimateMin)}{!t.next && <span className="warn-text"> · no first step</span>}{t.postponed > 0 && <span className="warn-text"> · postponed {t.postponed}×</span>}</span>
                </button>
                <button className="icon-btn" onClick={() => unplanTask(t.id)} aria-label="Move to backlog" title="Move to backlog"><Icon name="x" size={15} /></button>
              </div>
            )
          })}
        </div>
        {outcomes.length < 3
          ? <button className="add-row" onClick={() => openModal(<TaskEditor date={date} />)}><Icon name="plus" size={14} /> New outcome</button>
          : <p className="note">Three is the limit. Saying no is part of the plan.</p>}
        {outcomes.length > 0 && !frog && <p className="hint-box">Pick a frog: tap the frog icon on the outcome you’re most likely to avoid.</p>}
        {outcomes.length < 3 && backlog(s).length > 0 && (
          <div className="backlog">
            <div className="sub-head">From your backlog</div>
            {backlog(s).slice(0, 8).map(t => (
              <div key={t.id} className="backlog-row">
                <span className={`pri ${t.priority}`}>{t.priority === 'gold' ? 'Gold' : 'Silver'}</span>
                <span className="grow">{t.title}{t.postponed > 0 && <small className="warn-text"> · postponed {t.postponed}×</small>}</span>
                <button className="ghost sm" onClick={() => planTask(t.id, date)}><Icon name="plus" size={13} /> Plan</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card pad step">
        <div className="step-head"><span className="step-num">{step++}</span><div><h2>Give each outcome a time</h2><p>Fixed commitments first, family time protected, then focus blocks. A task without a time is just a wish.</p></div></div>
        <div className="controls">
          <button className="secondary sm" disabled={!unscheduled.length} onClick={() => { const p = autoPlace(date); toast(p.length ? `Placed ${p.length} block${p.length > 1 ? 's' : ''}, frog first.` : 'No free slot big enough. Shorten an estimate or free some time.') }}><Icon name="sparkle" size={14} /> Auto-place outcomes</button>
          <button className="ghost sm" onClick={() => { applyRoutine(date); toast('Routine added.') }}>Add my routine</button>
        </div>
        <Timeline s={s} date={date} showActual={date === today} />
        <div className="realism">
          <div><span>Outcomes need</span><b>{duration(need)}</b></div>
          <div><span>Focus blocked</span><b>{duration(focusPlanned)}</b></div>
          <div><span>Still unblocked</span><b>{duration(free)}</b></div>
        </div>
        {need > focusPlanned + free && <p className="hint-box warn">You’ve planned {duration(need)} of work into {duration(focusPlanned + free)} of time. Which outcome matters least? Move it to the backlog.</p>}
        {unscheduled.length > 0 && need <= focusPlanned + free && <p className="hint-box">Not scheduled yet: {unscheduled.map(t => `“${t.title}”`).join(', ')}.</p>}
        {overlaps.length > 0 && <p className="hint-box warn">Some blocks overlap: {overlaps.map(b => `${b.label} (${clock(b.start)})`).join(', ')}.</p>}
      </section>

      <section className="card pad step">
        <div className="step-head"><span className="step-num">{step++}</span><div><h2>Commit</h2><p>People who decide exactly when and where they’ll start follow through far more often. Name the moment.</p></div></div>
        {lead ? <>
          <textarea className="input" rows={2} value={intention} onChange={e => setIntention(e.target.value)} />
          <div className="actions">
            {dlog.committedAt && <span className="committed"><Icon name="check" size={14} /> Committed {relativeDay(dayKey(new Date(dlog.committedAt))).toLowerCase()} at {new Date(dlog.committedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
            <span className="grow" />
            <button className="primary" onClick={() => { commitPlan(date, intention.trim()); toast(date === today ? 'Committed. Go start the first block.' : 'Committed. Shut the laptop. Tomorrow is decided.'); if (date === today) nav('today') }}>
              {dlog.committedAt ? 'Recommit' : 'I commit to this plan'}
            </button>
          </div>
        </> : <p className="empty">Choose at least one outcome first.</p>}
      </section>

      <BrainDump s={s} />
    </div>
  )
}

function BrainDump({ s }: { s: State }) {
  const [text, setText] = useState('')
  const [pri, setPri] = useState<'gold' | 'silver'>('silver')
  const items = backlog(s)
  return (
    <section className="card pad">
      <div className="card-head"><h2>Brain dump & backlog</h2><span className="count">{items.length}</span></div>
      <p className="note flush">Get it out of your head. Gold is high leverage, silver is useful. Nothing here is a commitment until you plan it.</p>
      <form className="inline-form" onSubmit={e => { e.preventDefault(); if (text.trim()) { addInbox(text.trim(), pri); setText('') } }}>
        <input className="input" value={text} onChange={e => setText(e.target.value)} placeholder="Anything on your mind…" />
        <div className="seg small">
          <button type="button" className={pri === 'gold' ? 'on gold' : ''} onClick={() => setPri('gold')}>Gold</button>
          <button type="button" className={pri === 'silver' ? 'on' : ''} onClick={() => setPri('silver')}>Silver</button>
        </div>
        <button className="secondary" type="submit">Add</button>
      </form>
      <div className="backlog">
        {items.map(t => (
          <div key={t.id} className="backlog-row">
            <span className={`pri ${t.priority}`}>{t.priority === 'gold' ? 'Gold' : 'Silver'}</span>
            <button className="grow link-like" onClick={() => openModal(<TaskEditor task={t} />)}>{t.title}{t.postponed > 0 && <small className="warn-text"> · postponed {t.postponed}×</small>}</button>
            <button className="icon-btn" onClick={() => dropTask(t.id, 'cleared from backlog')} aria-label="Drop"><Icon name="x" size={14} /></button>
          </div>
        ))}
        {!items.length && <p className="empty">Empty head, clear mind.</p>}
      </div>
    </section>
  )
}
