import { useEffect, useRef, useState } from 'react'
import {
  BLOCK_KINDS, Block, HourEntry, State, blockHonored, blocksFor, day, setHour, toggleBlockChecked,
} from '../store'
import { addDays, clock, dayKey, duration, fromMin, longDate, minutesOfStamp, nowMin, relativeDay, toMin } from '../time'
import { Icon } from '../ui'

const pad = (h: number) => String(h).padStart(2, '0')
const hourLabel = (h: number) => clock(`${pad(h)}:00`)
const EMPTY: HourEntry = { plan: '', actual: '', done: false }
/** Focus blocks count as done when worked on; other blocks only when ticked. */
const blockDone = (s: State, b: Block) => b.kind === 'focus' ? blockHonored(s, b) : Boolean(b.checked)

/** Text that saves on blur and after a short pause, and follows remote edits while not being typed in. */
function HourText({ value, onSave, placeholder, multiline, className, label }: {
  value: string; onSave: (v: string) => void; placeholder: string; multiline?: boolean; className?: string; label: string
}) {
  const [text, setText] = useState(value)
  const focused = useRef(false)
  const timer = useRef<number>()
  useEffect(() => { if (!focused.current) setText(value) }, [value])
  const commit = (v: string) => { window.clearTimeout(timer.current); if (v !== value) onSave(v) }
  const change = (v: string) => {
    setText(v)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => commit(v), 900)
  }
  const props = {
    className: `hour-input ${className ?? ''}`, value: text, placeholder, 'aria-label': label,
    onFocus: () => { focused.current = true },
    onBlur: () => { focused.current = false; commit(text) },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(e.target.value),
  }
  if (multiline) {
    return <textarea {...props} rows={1} onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px` }}
      ref={el => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` } }} />
  }
  return <input {...props} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
}

interface HourInfo {
  h: number
  key: string
  entry: HourEntry
  starts: Block[]
  continues: Block[]
  sessions: { text: string; mins: number }[]
  unplanned: string[]
  past: boolean
  now: boolean
  planned: boolean
  status: 'done' | 'needs-log' | 'logged' | 'open' | 'empty'
}

export function hourInfos(s: State, date: string): HourInfo[] {
  const isToday = date === dayKey()
  const isPast = date < dayKey()
  const n = nowMin()
  const d = day(s, date)
  const hours = d.hours ?? {}
  const blocks = blocksFor(s, date).filter(b => b.decision !== 'rescheduled')
  const first = Math.floor(toMin(s.settings.dayStart) / 60)
  const last = Math.ceil(toMin(s.settings.dayEnd) / 60) - 1
  const extra = Object.keys(hours).map(Number)
  const from = Math.min(first, ...extra, ...blocks.map(b => Math.floor(toMin(b.start) / 60)))
  const to = Math.max(last, ...extra, ...blocks.map(b => Math.floor((toMin(b.end) - 1) / 60)))
  const out: HourInfo[] = []
  for (let h = from; h <= to; h++) {
    const key = pad(h)
    const entry = hours[key] ?? EMPTY
    const a = h * 60
    const z = a + 60
    const starts = blocks.filter(b => toMin(b.start) >= a && toMin(b.start) < z)
    const continues = blocks.filter(b => toMin(b.start) < a && toMin(b.end) > a)
    const sessions = s.sessions.filter(x => x.date === date && minutesOfStamp(x.start) >= a && minutesOfStamp(x.start) < z)
      .map(x => ({ text: s.tasks.find(t => t.id === x.taskId)?.title ?? 'Focus', mins: x.ms / 60000 }))
    const unplanned = (d.unplanned ?? []).filter(u => minutesOfStamp(u.at) >= a && minutesOfStamp(u.at) < z).map(u => u.text)
    const past = isPast || (isToday && n >= z)
    const now = isToday && n >= a && n < z
    const plannedSomething = Boolean(entry.plan) || starts.some(b => b.kind !== 'break')
    const unticked = (entry.plan && !entry.done) || starts.some(b => b.kind !== 'break' && b.kind !== 'family' && !b.decision && !blockDone(s, b))
    const loggedSomething = Boolean(entry.actual) || sessions.length > 0 || unplanned.length > 0
    let status: HourInfo['status'] = 'empty'
    if (plannedSomething && !unticked) status = 'done'
    else if (past && unticked && !loggedSomething) status = 'needs-log'
    else if (past && loggedSomething) status = 'logged'
    else if (plannedSomething) status = 'open'
    out.push({ h, key, entry, starts, continues, sessions, unplanned, past, now, planned: plannedSomething, status })
  }
  return out
}

export function Hours({ s }: { s: State }) {
  const today = dayKey()
  const [date, setDate] = useState(today)
  const rows = hourInfos(s, date)
  const nowRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (date === today) nowRef.current?.scrollIntoView({ block: 'center' }) }, [date]) // eslint-disable-line react-hooks/exhaustive-deps

  const planned = rows.filter(r => r.planned).length
  const done = rows.filter(r => r.status === 'done').length
  const logged = rows.filter(r => r.status === 'logged').length
  const needs = rows.filter(r => r.status === 'needs-log').length

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Hour by hour</div>
          <h1 className="page-title">{date === today ? 'Today, hour by hour' : longDate(date)}</h1>
          <p className="page-sub">Plan each hour, tick what happened, and write down what you actually did when it didn’t.</p>
        </div>
        <div className="seg">
          <button onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
          <button className="on" onClick={() => setDate(today)}>{relativeDay(date)}</button>
          <button onClick={() => setDate(addDays(date, 1))} aria-label="Next day">›</button>
        </div>
      </header>

      <div className="hour-summary">
        <div><b>{planned}</b><span>hours planned</span></div>
        <div className="c-done"><b>{done}</b><span>done as planned</span></div>
        <div className="c-logged"><b>{logged}</b><span>logged differently</span></div>
        <div className={`c-needs ${needs ? 'hot' : ''}`}><b>{needs}</b><span>need an honest log</span></div>
      </div>

      <section className="card sheet">
        <div className="sheet-head" aria-hidden="true"><span>Hour</span><span>Planned</span><span>Actual</span></div>
        {rows.map(r => (
          <div key={r.key} ref={r.now ? nowRef : undefined} className={`hour-row st-${r.status} ${r.now ? 'is-now' : ''} ${r.past ? 'is-past' : ''}`}>
            <div className="hour-time">
              <b>{hourLabel(r.h)}</b>
              <small>{r.now ? 'Now' : `to ${hourLabel(r.h + 1)}`}</small>
              <span className="hour-dot" title={r.status} />
            </div>

            <div className="hour-cell planned">
              <span className="cell-label">Planned</span>
              {r.continues.map(b => (
                <div key={b.id} className={`chip-block k-${b.kind} cont`}><span className="k-dot" /> {b.label} <small>until {clock(b.end)}</small></div>
              ))}
              {r.starts.map(b => {
                const kept = blockDone(s, b)
                const kind = BLOCK_KINDS.find(k => k.id === b.kind)?.label
                return (
                  <label key={b.id} className={`chip-block k-${b.kind} ${kept ? 'kept' : ''} ${b.decision ? 'decided' : ''}`}>
                    <input type="checkbox" className="check" checked={kept} disabled={!b.checked && kept} onChange={() => toggleBlockChecked(b.id)} aria-label={`Done: ${b.label}`} />
                    <span className="chip-text">{b.label}<small>{clock(b.start)}–{clock(b.end)} · {kind}{b.decision === 'dropped' ? ' · released' : ''}</small></span>
                  </label>
                )
              })}
              <div className="plan-line">
                <input type="checkbox" className="check" checked={r.entry.done} disabled={!r.entry.plan}
                  onChange={() => setHour(date, r.key, { done: !r.entry.done })} aria-label={`Done: plan for ${hourLabel(r.h)}`} />
                <HourText value={r.entry.plan} className={r.entry.done ? 'is-done' : ''} label={`Plan for ${hourLabel(r.h)}`}
                  placeholder={r.starts.length ? 'Add a note…' : 'Plan this hour…'} onSave={v => setHour(date, r.key, { plan: v, done: v ? r.entry.done : false })} />
              </div>
            </div>

            <div className="hour-cell actual">
              <span className="cell-label">Actual</span>
              {r.sessions.map((x, i) => <div key={`s${i}`} className="auto-log focus"><Icon name="check" size={13} /> {duration(x.mins)} focused · {x.text}</div>)}
              {r.unplanned.map((u, i) => <div key={`u${i}`} className="auto-log unplanned"><Icon name="bolt" size={13} /> {u}</div>)}
              <HourText multiline value={r.entry.actual} label={`What you did ${hourLabel(r.h)}`}
                className={r.status === 'needs-log' ? 'needs' : ''}
                placeholder={r.status === 'needs-log' ? 'Didn’t go to plan? What did you do instead?' : r.past || r.now ? 'What did you actually do?' : '—'}
                onSave={v => setHour(date, r.key, { actual: v })} />
            </div>
          </div>
        ))}
      </section>
      <p className="note center">Hours run from {clock(fromMin(toMin(s.settings.dayStart)))} to {clock(s.settings.dayEnd)}. Change that in Settings.</p>
    </div>
  )
}
