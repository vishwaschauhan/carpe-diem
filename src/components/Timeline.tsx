import { useState } from 'react'
import { BLOCK_KINDS, Block, State, blockHonored, blocksFor, logUnplanned } from '../store'
import { clock, clockOf, dayKey, duration, fromMin, minutesOfStamp, nowMin, toMin } from '../time'
import { Icon, openModal, toast } from '../ui'
import { BlockEditor } from './modals'

type Row =
  | { type: 'block'; at: number; block: Block }
  | { type: 'session'; at: number; text: string; mins: number }
  | { type: 'unplanned'; at: number; text: string }
  | { type: 'now'; at: number }

function blockStatus(s: State, b: Block, isToday: boolean, now: number): string {
  if (b.decision) return b.decision
  const started = toMin(b.start) <= now
  const ended = toMin(b.end) <= now
  if (b.kind !== 'focus') return isToday && started && !ended ? 'now' : ended && isToday ? 'past' : ''
  const task = s.tasks.find(t => t.id === b.taskId)
  if (task?.status === 'done' && (!isToday || ended || blockHonored(s, b))) return 'done'
  if (!isToday) return ''
  if (started && !ended) return blockHonored(s, b) ? 'now on' : 'now'
  if (ended) return blockHonored(s, b) ? 'kept' : 'missed'
  return ''
}

const STATUS_LABEL: Record<string, string> = {
  done: 'Done', kept: 'Kept', missed: 'Missed', now: 'Now', 'now on': 'Now · on it', rescheduled: 'Moved', dropped: 'Released', past: '',
}

export function Timeline({ s, date, showActual = true }: { s: State; date: string; showActual?: boolean }) {
  const isToday = date === dayKey()
  const now = nowMin()
  const [note, setNote] = useState('')
  const [logging, setLogging] = useState(false)
  const blocks = blocksFor(s, date)
  const rows: Row[] = blocks.map(b => ({ type: 'block', at: toMin(b.start), block: b }))
  if (showActual) {
    for (const x of s.sessions.filter(x => x.date === date)) {
      const t = s.tasks.find(t => t.id === x.taskId)
      rows.push({ type: 'session', at: minutesOfStamp(x.start), text: t?.title ?? 'Focus', mins: x.ms / 60000 })
    }
    for (const u of s.days[date]?.unplanned ?? []) rows.push({ type: 'unplanned', at: minutesOfStamp(u.at), text: u.text })
  }
  if (isToday) rows.push({ type: 'now', at: now })
  rows.sort((a, b) => a.at - b.at || (a.type === 'now' ? 1 : 0) - (b.type === 'now' ? 1 : 0))

  return (
    <div className="timeline">
      {blocks.length === 0 && <p className="empty">No time blocks yet. Blocks turn intentions into appointments with yourself.</p>}
      {rows.map((r, i) => {
        if (r.type === 'now') return blocks.length ? <div key="now" className="now-line"><span>{clockOf(Date.now())}</span></div> : null
        if (r.type === 'session') return (
          <div key={`s${i}`} className="actual"><span className="actual-time">{clock(fromMin(r.at))}</span><Icon name="check" size={13} /> {duration(r.mins)} focus · {r.text}</div>
        )
        if (r.type === 'unplanned') return (
          <div key={`u${i}`} className="actual unplanned"><span className="actual-time">{clock(fromMin(r.at))}</span><Icon name="bolt" size={13} /> {r.text}</div>
        )
        const b = r.block
        const st = blockStatus(s, b, isToday, now)
        const task = s.tasks.find(t => t.id === b.taskId)
        return (
          <button key={b.id} className={`block k-${b.kind} ${st.replace(' ', '-')}`} onClick={() => openModal(<BlockEditor date={date} block={b} />)}>
            <span className="block-time">{clock(b.start)}<small>{duration(toMin(b.end) - toMin(b.start))}</small></span>
            <span className="block-body">
              <span className="block-label">{task?.frog && <Icon name="frog" size={13} />} {task?.title ?? b.label}</span>
              <span className="block-kind">{BLOCK_KINDS.find(k => k.id === b.kind)?.label}{task && b.label && b.label !== task.title ? ` · ${b.label}` : ''}</span>
            </span>
            {STATUS_LABEL[st] && <span className={`block-status ${st.replace(' ', '-')}`}>{STATUS_LABEL[st]}</span>}
          </button>
        )
      })}
      <div className="timeline-actions">
        <button className="ghost sm" onClick={() => openModal(<BlockEditor date={date} />)}><Icon name="plus" size={14} /> Block</button>
        {isToday && showActual && !logging && <button className="ghost sm" onClick={() => setLogging(true)}><Icon name="bolt" size={14} /> Log unplanned</button>}
      </div>
      {logging && (
        <form className="inline-form" onSubmit={e => { e.preventDefault(); if (note.trim()) { logUnplanned(note.trim()); setNote(''); setLogging(false); toast('Logged. Honest records beat perfect plans.') } }}>
          <input className="input" autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="What actually happened? e.g. Sent email for Otto" />
          <button className="ghost" type="submit">Log</button>
        </form>
      )}
    </div>
  )
}
