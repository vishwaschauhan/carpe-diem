import { useEffect, useState } from 'react'
import { Nav } from '../components/Coach'
import { Timeline } from '../components/Timeline'
import { scoreDay } from '../score'
import { AREAS, State, StuckReason, day, outcomesFor, patchDay } from '../store'
import { addDays, dayKey, duration, longDate, relativeDay, shortDate } from '../time'
import { Icon, Progress, toast } from '../ui'
import { hourInfos } from './Hours'

const STUCK_LABEL: Record<StuckReason, string> = {
  unclear: 'Unclear next step', big: 'Felt too big', boring: 'Boring', anxious: 'Worry about quality', tired: 'Low energy', unimportant: 'Not important',
}

function suggestTakeaway(s: State, date: string): string {
  const outcomes = outcomesFor(s, date)
  const frog = outcomes.find(t => t.frog)
  const d = day(s, date)
  if (!outcomes.length) return 'Tomorrow, plan before you open email: three outcomes, one frog, each with a time.'
  if (frog && frog.status !== 'done') return `Tomorrow, protect your first focus window for “${frog.title}”. Start it before anything else.`
  const reasons = d.stuck.map(x => x.reason)
  if (reasons.length) {
    const top = reasons.sort((a, b) => reasons.filter(x => x === b).length - reasons.filter(x => x === a).length)[0]
    if (top === 'big') return 'Things felt too big today. Tonight, write a five-minute first step for each outcome.'
    if (top === 'unclear') return 'Clarity was the bottleneck. Write a concrete first action for every outcome before bed.'
    if (top === 'tired') return 'Energy was the constraint. Put the frog in your highest-energy slot and protect sleep tonight.'
    if (top === 'anxious') return 'Perfectionism showed up. Define “done” as a rough first version tomorrow.'
  }
  if (d.interruptions > d.recovered) return 'Interruptions broke the thread. Always leave a breadcrumb when you pause.'
  if (outcomes.every(t => t.status === 'done')) return 'Every commitment delivered. Keep the same rhythm, and don’t add a fourth.'
  return 'Start your first block within five minutes of its time. The first block sets the day.'
}

export function Review({ s, nav }: { s: State; nav: Nav }) {
  const today = dayKey()
  const [date, setDate] = useState(today)
  const d = day(s, date)
  const sc = scoreDay(s, date)
  const outcomes = outcomesFor(s, date)
  const sessions = s.sessions.filter(x => x.date === date)
  const focusMin = sessions.reduce((a, x) => a + x.ms, 0) / 60000
  const [reflection, setReflection] = useState(d.reflection)
  const [takeaway, setTakeaway] = useState(d.takeaway || suggestTakeaway(s, date))
  useEffect(() => { const x = day(s, date); setReflection(x.reflection); setTakeaway(x.takeaway || suggestTakeaway(s, date)) }, [date]) // eslint-disable-line react-hooks/exhaustive-deps

  const byArea = AREAS.map(a => ({
    ...a,
    min: sessions.filter(x => s.tasks.find(t => t.id === x.taskId)?.area === a.id).reduce((acc, x) => acc + x.ms, 0) / 60000,
  })).filter(a => a.min > 0)
  const maxArea = Math.max(1, ...byArea.map(a => a.min))
  const stuckCounts = Object.entries(d.stuck.reduce<Record<string, number>>((acc, x) => { acc[x.reason] = (acc[x.reason] ?? 0) + 1; return acc }, {}))
  const history = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)).map(k => ({ k, score: s.days[k] || outcomesFor(s, k).length ? scoreDay(s, k).score : null }))

  const hrs = hourInfos(s, date)
  const hPlanned = hrs.filter(r => r.planned).length
  const hDone = hrs.filter(r => r.status === 'done').length
  const hLogged = hrs.filter(r => r.status === 'logged').length
  const hMissing = hrs.filter(r => r.status === 'needs-log').length

  const shutdown = () => {
    patchDay(date, { reflection, takeaway, shutdownAt: Date.now() })
    toast('Shutdown complete. Now decide tomorrow.')
    nav('plan', { planDate: addDays(date, 1) })
  }

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <div className="eyebrow">Review · under 5 minutes</div>
          <h1 className="page-title">{date === today ? 'How did today go?' : longDate(date)}</h1>
          <p className="page-sub">Judged by commitments kept, not hours logged.</p>
        </div>
        <div className="seg">
          <button onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
          <button className="on" onClick={() => setDate(today)}>{relativeDay(date)}</button>
          <button onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="Next day">›</button>
        </div>
      </header>

      <section className="card pad score-card">
        <div className="score-big">
          <span className="num">{sc.score ?? '–'}</span>
          <span className="lbl">Execution score</span>
        </div>
        <div className="score-parts">
          {sc.parts.map(p => (
            <div key={p.key} className={`part ${p.value === null ? 'na' : ''}`}>
              <div className="part-top"><span>{p.label}</span><span className="muted">{p.value === null ? 'n/a' : `${Math.round(p.value * 100)}%`} · weight {p.weight}</span></div>
              <Progress value={p.value ?? 0} />
              <small>{p.detail}</small>
            </div>
          ))}
        </div>
      </section>

      {(sc.wins.length > 0 || sc.attention.length > 0) && (
        <section className="card pad two-col">
          <div><h3 className="good-text"><Icon name="sparkle" size={15} /> What went well</h3>
            {sc.wins.length ? <ul className="bullets">{sc.wins.map((w, i) => <li key={i}>{w}</li>)}</ul> : <p className="empty">Nothing to celebrate yet. The day isn’t over.</p>}</div>
          <div><h3 className="warn-text"><Icon name="flag" size={15} /> Needs attention</h3>
            {sc.attention.length ? <ul className="bullets">{sc.attention.map((w, i) => <li key={i}>{w}</li>)}</ul> : <p className="empty">Nothing flagged.</p>}</div>
        </section>
      )}

      <section className="card pad">
        <div className="card-head"><h2>Plan vs actual</h2></div>
        <div className="stats">
          <div><b>{outcomes.filter(t => t.status === 'done').length}/{outcomes.length}</b><span>Outcomes</span></div>
          <div><b>{duration(focusMin)}</b><span>Focused</span></div>
          <div><b>{d.redirects}</b><span>Drifts caught</span></div>
          <div><b>{d.recovered}/{d.interruptions}</b><span>Recovered</span></div>
        </div>
        {hPlanned > 0 && (
          <button className="hours-strip" onClick={() => nav('hours')}>
            <span><b>{hDone}</b> of {hPlanned} planned hours went to plan</span>
            {hLogged > 0 && <span className="c-logged"><b>{hLogged}</b> logged differently</span>}
            {hMissing > 0 && <span className="c-needs"><b>{hMissing}</b> still unaccounted</span>}
            <Icon name="arrow" size={14} />
          </button>
        )}
        <div className="outcomes review-outcomes">
          {outcomes.map(t => (
            <div key={t.id} className={`outcome ${t.status === 'done' ? 'done' : ''}`}>
              <span className={`status-dot ${t.status}`}>{t.status === 'done' ? <Icon name="check" size={12} /> : null}</span>
              <span className="outcome-body static"><span className="outcome-title">{t.frog && <Icon name="frog" size={13} />} {t.title}</span>
                <span className="outcome-sub">{duration(sessions.filter(x => x.taskId === t.id).reduce((a, x) => a + x.ms, 0) / 60000)} focused of {duration(t.estimateMin)} planned</span></span>
            </div>
          ))}
        </div>
        <Timeline s={s} date={date} />
        {byArea.length > 0 && <>
          <div className="sub-head">Where your focus went</div>
          {byArea.map(a => <div key={a.id} className="area-row"><span>{a.label}</span><Progress value={a.min / maxArea} /><b>{duration(a.min)}</b></div>)}
        </>}
        {stuckCounts.length > 0 && <>
          <div className="sub-head">What got in the way</div>
          <div className="tags">{stuckCounts.map(([r, n]) => <span key={r} className="tag">{STUCK_LABEL[r as StuckReason]} ×{n}</span>)}</div>
        </>}
      </section>

      <section className="card pad">
        <div className="card-head"><h2>Reflect</h2></div>
        <div className="stack-12">
          <div className="field"><span className="field-label">Did you make progress on what mattered most?</span>
            <div className="seg">{(['yes', 'partly', 'no'] as const).map(v => <button key={v} className={d.mattered === v ? 'on' : ''} onClick={() => patchDay(date, { mattered: v })}>{v === 'yes' ? 'Yes' : v === 'partly' ? 'Partly' : 'No'}</button>)}</div>
          </div>
          <label className="field"><span className="field-label">One win, one lesson</span>
            <textarea className="input" rows={3} value={reflection} onChange={e => setReflection(e.target.value)} onBlur={() => patchDay(date, { reflection })} placeholder="I did well when… Next time I will…" /></label>
          <label className="field"><span className="field-label">Tomorrow’s takeaway</span>
            <input className="input" value={takeaway} onChange={e => setTakeaway(e.target.value)} onBlur={() => patchDay(date, { takeaway })} /></label>
          <div className="actions">
            {d.shutdownAt && <span className="committed"><Icon name="check" size={14} /> Shut down at {new Date(d.shutdownAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
            <span className="grow" />
            <button className="primary" onClick={shutdown}>Shutdown complete · plan {date === today ? 'tomorrow' : 'next day'} <Icon name="arrow" size={15} /></button>
          </div>
        </div>
      </section>

      <section className="card pad">
        <div className="card-head"><h2>Last 14 days</h2></div>
        <div className="history">
          {history.map(h => (
            <button key={h.k} className={`hbar ${h.k === date ? 'sel' : ''}`} onClick={() => setDate(h.k)} title={`${shortDate(h.k)}: ${h.score ?? 'no data'}`}>
              <span className="hfill" style={{ height: `${h.score ?? 0}%` }} />
              <small>{shortDate(h.k).split(' ')[0].slice(0, 2)}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
