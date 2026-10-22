import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  BLOCK_KINDS, Block, BlockInput, BlockKind, PlaceResult, State, Task, addInbox, backlog, deleteBlock, findTimeFor, goalOf,
  outcomesFor, placeBlock, placePriorities, planTask, retimeBlock, setFrog, addOutcome, saveTask, splitTask, unplanTask, dropTask,
} from '../store'
import {
  DAY_END, Span, activeBlocks, capacity, conflictsFor, describeConflict, effortOf, firstFit, gapsBetween, isExclusive, len,
  sessionLength, snap, spanOf,
} from '../schedule'
import { clock, dayKey, duration, fromMin, nowMin, toMin } from '../time'
import { Icon, openModal, toast } from '../ui'
import { StartFocus, TaskEditor } from './modals'

const PX = 1.2 // pixels per minute: 72px an hour
const ESTIMATES = [15, 30, 45, 60, 90, 120, 180, 240, 300]
const DURATIONS = [15, 30, 45, 60, 90]
const OTHER_KINDS: BlockKind[] = ['fixed', 'family', 'health', 'routine', 'break']
const t12 = (m: number) => clock(fromMin(Math.min(m, DAY_END - 1)))
const range = (sp: Span) => `${t12(sp.start)}–${sp.end >= DAY_END ? '12am' : t12(sp.end)}`

type Pending = { kind: 'new'; input: BlockInput } | { kind: 'move'; id: string; patch: { start: number; end: number } }
type Pop =
  | { mode: 'quick'; minute: number }
  | { mode: 'edit'; id: string }
  | { mode: 'conflict'; minute: number; pending: Pending; conflict: Block; suggestion: number | null }

interface TrayDrag { taskId: string; title: string; length: number; x: number; y: number; minute: number | null }
interface Moving { id: string; start: number; end: number }

export function Planner({ s, date }: { s: State; date: string }) {
  const today = dayKey()
  const isToday = date === today
  const priorities = outcomesFor(s, date)
  const ready = priorities.filter(t => t.status === 'ready')
  const blocks = activeBlocks(s, date)
  const cap = capacity(s, date, priorities)

  const [full, setFull] = useState(false)
  const [armed, setArmed] = useState<string | null>(null)
  const [pop, setPop] = useState<Pop | null>(null)
  const [drag, setDrag] = useState<TrayDrag | null>(null)
  const [moving, setMoving] = useState<Moving | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const suppressClick = useRef(false)

  // Visible hours: the configured day, stretched to include anything scheduled outside it.
  const dayStart = toMin(s.settings.dayStart)
  const dayEnd = Math.max(dayStart + 60, toMin(s.settings.dayEnd))
  const from = full ? 0 : Math.floor(Math.min(dayStart, ...blocks.map(b => spanOf(b).start)) / 60) * 60
  const to = full ? DAY_END : Math.ceil(Math.max(dayEnd, ...blocks.map(b => spanOf(b).end)) / 60) * 60
  const y = (m: number) => (m - from) * PX
  const now = nowMin()

  useEffect(() => { setPop(null); setArmed(null) }, [date])
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const target = isToday ? now - 60 : blocks[0] ? spanOf(blocks[0]).start - 30 : dayStart
    el.scrollTop = Math.max(0, y(target))
  }, [date, full]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPop(null); setArmed(null) } }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])

  const minuteAt = (clientY: number, step = 15) => {
    const r = gridRef.current!.getBoundingClientRect()
    return Math.max(from, Math.min(to - step, Math.floor(((clientY - r.top) / PX + from) / step) * step))
  }
  const overGrid = (x: number, yy: number) => {
    const r = scrollRef.current?.getBoundingClientRect()
    return !!r && x >= r.left && x <= r.right && yy >= r.top && yy <= r.bottom
  }

  const done = (r: PlaceResult, pending: Pending, minute: number, what: string) => {
    if (r.ok) {
      setPop(null)
      setFlash(r.id)
      setTimeout(() => setFlash(f => (f === r.id ? null : f)), 1200)
      toast(what)
      return true
    }
    if (r.reason === 'conflict' && r.conflict) setPop({ mode: 'conflict', minute, pending, conflict: r.conflict, suggestion: r.suggestion })
    else if (r.reason === 'full') toast('Your day is already fully booked.')
    else toast('That time doesn’t work.')
    return false
  }

  const scheduleTask = (t: Task, start: number, length = sessionLength(effortOf(s, t))) => {
    const input: BlockInput = { date, start, end: Math.min(DAY_END, start + length), kind: 'focus', label: t.title, taskId: t.id }
    if (done(placeBlock(input), { kind: 'new', input }, start, `Scheduled “${t.title}” ${range(input)}.`)) setArmed(null)
  }
  const scheduleOther = (kind: BlockKind, label: string, start: number, length: number) => {
    const input: BlockInput = { date, start, end: Math.min(DAY_END, start + length), kind, label: label || BLOCK_KINDS.find(k => k.id === kind)!.label, taskId: null }
    done(placeBlock(input), { kind: 'new', input }, start, `Added ${input.label} ${range(input)}.`)
  }
  const resolve = (pending: Pending, start: number | null, shared = false) => {
    if (pending.kind === 'new') {
      const l = pending.input.end - pending.input.start
      const input = start === null ? { ...pending.input, shared } : { ...pending.input, start, end: start + l }
      done(placeBlock(input), { kind: 'new', input }, input.start, `Scheduled ${input.label} ${range(input)}.`)
    } else {
      const l = pending.patch.end - pending.patch.start
      const patch = start === null ? { ...pending.patch, shared } : { start, end: start + l }
      done(retimeBlock(pending.id, patch), { kind: 'move', id: pending.id, patch: { start: patch.start, end: patch.end } }, patch.start, `Moved to ${range(patch)}.`)
    }
  }

  // ----- Drag a task from the tray onto the calendar -----
  const startTrayDrag = (e: React.PointerEvent, t: Task) => {
    if (e.button !== 0 || e.pointerType === 'touch' || (e.target as HTMLElement).closest('button, select, input, a')) return
    const x0 = e.clientX
    const y0 = e.clientY
    const length = sessionLength(effortOf(s, t))
    let active = false
    let last: TrayDrag | null = null
    const move = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return
      active = true
      ev.preventDefault()
      const minute = overGrid(ev.clientX, ev.clientY) ? minuteAt(ev.clientY) : null
      last = { taskId: t.id, title: t.title, length, x: ev.clientX, y: ev.clientY, minute }
      setDrag(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDrag(null)
      if (!active) { setArmed(a => (a === t.id ? null : t.id)); setPop(null); return }
      if (last?.minute != null) scheduleTask(t, last.minute, length)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ----- Move and resize blocks -----
  const startMove = (e: React.PointerEvent, b: Block) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, .rz')) return
    const sp = spanOf(b)
    const y0 = e.clientY
    let cur: Moving | null = null
    const touch = e.pointerType === 'touch'
    const move = (ev: PointerEvent) => {
      if (touch || Math.abs(ev.clientY - y0) < 4) return
      const d = snap((ev.clientY - y0) / PX, 5)
      const start = Math.max(0, Math.min(DAY_END - len(sp), sp.start + d))
      cur = { id: b.id, start, end: start + len(sp) }
      setMoving(cur)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      setMoving(null)
      suppressClick.current = true
      setTimeout(() => { suppressClick.current = false }, 0)
      if (!cur) { setPop({ mode: 'edit', id: b.id }); return }
      if (cur.start === sp.start) return
      done(retimeBlock(b.id, { start: cur.start, end: cur.end }), { kind: 'move', id: b.id, patch: { start: cur.start, end: cur.end } }, cur.start, `Moved to ${range(cur)}.`)
    }
    const cancel = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); setMoving(null) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  const startResize = (e: React.PointerEvent, b: Block) => {
    e.stopPropagation()
    e.preventDefault()
    const sp = spanOf(b)
    const y0 = e.clientY
    // The furthest this block can stretch: the next exclusive commitment.
    const limit = b.shared ? DAY_END : Math.min(DAY_END, ...activeBlocks(s, date).filter(o => o.id !== b.id && isExclusive(o) && spanOf(o).start >= sp.end).map(o => spanOf(o).start))
    let cur: Moving | null = null
    let hit = false
    const move = (ev: PointerEvent) => {
      const want = Math.max(sp.start + 10, sp.end + snap((ev.clientY - y0) / PX, 5))
      hit = want > limit
      cur = { id: b.id, start: sp.start, end: Math.min(want, limit) }
      setMoving(cur)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setMoving(null)
      suppressClick.current = true
      setTimeout(() => { suppressClick.current = false }, 0)
      if (!cur || cur.end === sp.end) return
      const r = retimeBlock(b.id, { end: cur.end })
      if (r.ok) toast(hit ? `Stopped at ${t12(cur.end)}, where your next commitment starts.` : `Now ${range(cur)} (${duration(len(cur))}).`)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const gridClick = (e: React.MouseEvent) => {
    if (suppressClick.current || (e.target as HTMLElement).closest('.pblock, .pop')) return
    const minute = minuteAt(e.clientY)
    if (armed) {
      const t = s.tasks.find(x => x.id === armed)
      if (t) { scheduleTask(t, minute); return }
    }
    setPop({ mode: 'quick', minute })
  }

  // ----- Layout: blocks that are allowed to overlap sit side by side -----
  const placed = blocks.map(b => (moving?.id === b.id ? { b, sp: { start: moving.start, end: moving.end } } : { b, sp: spanOf(b) }))
  const lanes = layoutLanes(placed.map(p => p.sp))
  const win = cap.window
  const free = gapsBetween(s, date, Math.max(from, isToday ? win.start : dayStart), Math.min(to, dayEnd)).filter(g => len(g) >= 15)
  const armedTask = s.tasks.find(t => t.id === armed)
  const preview = drag?.minute != null ? { start: drag.minute, end: drag.minute + drag.length, title: drag.title } : null
  const previewClash = preview ? conflictsFor(s, date, preview) : []
  const movingClash = moving ? conflictsFor(s, date, moving, moving.id) : []

  return (
    <div className="planner">
      <aside className="tray">
        <section className="card pad tray-card">
          <div className="tray-head">
            <span className="step-num">1</span>
            <div><h2>Choose what matters</h2><p>Up to three outcomes. The frog goes first.</p></div>
            <span className="count">{priorities.length}/3</span>
          </div>
          <div className="tcards">
            {priorities.map(t => (
              <TaskCard key={t.id} s={s} t={t} date={date} armed={armed === t.id} onPointerDown={e => startTrayDrag(e, t)} onArm={() => setArmed(a => (a === t.id ? null : t.id))} priority />
            ))}
          </div>
          {priorities.length < 3
            ? <QuickAdd date={date} />
            : <p className="note">Three is the limit. Saying no is part of the plan.</p>}
          {priorities.length > 0 && !priorities.some(t => t.frog) && <p className="hint-box">Tap the frog on the outcome you’re most likely to avoid. It goes first.</p>}
        </section>
        <Backlog s={s} date={date} armed={armed} onPointerDown={startTrayDrag} onArm={id => setArmed(a => (a === id ? null : id))} full={priorities.length >= 3} />
      </aside>

      <section className="card day-card">
        <div className="day-head">
          <div className="tray-head">
            <span className="step-num">2</span>
            <div><h2>Place work on the calendar</h2><p className="hide-sm">Drag a task onto free time, or click a slot.</p></div>
          </div>
          <div className="capacity" aria-label="Capacity">
            <span><b>{duration(cap.scheduled)}</b> scheduled</span>
            <span className="cap-free"><b>{duration(cap.free)}</b> free</span>
            <span className={cap.unscheduled > cap.free ? 'cap-over' : ''}><b>{duration(cap.unscheduled)}</b> priority work unscheduled</span>
          </div>
        </div>
        <Suggestions s={s} date={date} priorities={ready} free={cap.free} unscheduled={cap.unscheduled} />
        {armedTask && (
          <div className="armed-bar" role="status">
            <Icon name="arrow" size={15} /> Tap a free slot to place <b>“{armedTask.title}”</b> ({duration(sessionLength(effortOf(s, armedTask)))})
            <button className="text-btn" onClick={() => setArmed(null)}>Cancel</button>
          </div>
        )}
        <div className="grid-tools">
          <span className="legend">{BLOCK_KINDS.filter(k => k.id !== 'break').map(k => <span key={k.id} className={`lg k-${k.id}`}><i />{k.label}</span>)}</span>
          <button className="text-btn" onClick={() => setFull(f => !f)}>{full ? 'Show my day' : 'Show full 24h'}</button>
        </div>
        <div className="grid-scroll" ref={scrollRef}>
          <div className={`pgrid ${armed || drag ? 'targeting' : ''}`} ref={gridRef} style={{ height: (to - from) * PX }} onClick={gridClick} data-from={from} data-px={PX}>
            {Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60).map(m => (
              <div key={m} className="hour-line" style={{ top: y(m) }}><span>{t12(m)}</span></div>
            ))}
            {from < dayStart && <div className="off-hours" style={{ top: 0, height: y(dayStart) }} />}
            {to > dayEnd && <div className="off-hours" style={{ top: y(dayEnd), height: y(to) - y(dayEnd) }} />}
            {free.map(g => (
              <div key={g.start} className="free-band" style={{ top: y(g.start), height: len(g) * PX }}>
                {len(g) >= 30 && <span>Free · {duration(len(g))}</span>}
              </div>
            ))}
            {placed.map(({ b, sp }, i) => {
              const lane = lanes[i]
              const task = s.tasks.find(t => t.id === b.taskId)
              const past = isToday && sp.end <= now
              const isMoving = moving?.id === b.id
              const short = len(sp) < 35
              return (
                <div key={b.id} data-id={b.id}
                  className={`pblock k-${b.kind} ${short ? 'short' : ''} ${past ? 'past' : ''} ${b.shared ? 'shared' : ''} ${isMoving ? `moving ${movingClash.length && !b.shared ? 'clash' : ''}` : ''} ${flash === b.id ? 'flash' : ''} ${task?.status === 'done' ? 'done' : ''}`}
                  style={{ top: y(sp.start), height: Math.max(len(sp) * PX - 2, 16), left: `calc(${(lane.col / lane.cols) * 100}% + 2px)`, width: `calc(${100 / lane.cols}% - 4px)` }}
                  onPointerDown={e => startMove(e, b)} title={`${b.label} · ${range(sp)}`}>
                  <div className="pb-title">{task?.frog && <Icon name="frog" size={12} />}{b.label}</div>
                  <div className="pb-time">{range(sp)}{!short && ` · ${duration(len(sp))}`}{b.shared && ' · can overlap'}</div>
                  <button className="pb-x" aria-label={`Remove ${b.label}`} onClick={e => { e.stopPropagation(); deleteBlock(b.id); toast(`Removed ${b.label} ${range(sp)}.`) }}><Icon name="x" size={12} /></button>
                  <div className="rz" onPointerDown={e => startResize(e, b)} aria-label="Resize" />
                </div>
              )
            })}
            {preview && (
              <div className={`pblock ghost k-focus ${previewClash.length ? 'clash' : ''}`} style={{ top: y(preview.start), height: len(preview) * PX - 2 }}>
                <div className="pb-title">{preview.title}</div>
                <div className="pb-time">{range(preview)}{previewClash.length ? ` · overlaps ${previewClash[0].label}` : ''}</div>
              </div>
            )}
            {isToday && now >= from && now < to && <div className="now-line" style={{ top: y(now) }}><span>{t12(now)}</span></div>}
            {pop && <Popover s={s} date={date} pop={pop} top={y(pop.mode === 'edit' ? spanOf(s.blocks.find(b => b.id === pop.id) ?? blocks[0]).end : pop.minute + (pop.mode === 'quick' ? 15 : 0))}
              close={() => setPop(null)} scheduleTask={scheduleTask} scheduleOther={scheduleOther} resolve={resolve} setPop={setPop} />}
          </div>
        </div>
      </section>
      {drag && <div className="drag-ghost" style={{ left: drag.x + 12, top: drag.y + 8 }}>{drag.title} · {duration(drag.length)}{drag.minute != null && ` → ${t12(drag.minute)}`}</div>}
    </div>
  )
}

function layoutLanes(spans: Span[]): { col: number; cols: number }[] {
  const order = spans.map((sp, i) => ({ sp, i })).sort((a, b) => a.sp.start - b.sp.start || b.sp.end - a.sp.end)
  const out: { col: number; cols: number }[] = spans.map(() => ({ col: 0, cols: 1 }))
  let cluster: { i: number; col: number }[] = []
  let clusterEnd = -1
  let colsEnd: number[] = []
  const flush = () => { const n = Math.max(1, colsEnd.length); cluster.forEach(c => { out[c.i] = { col: c.col, cols: n } }); cluster = []; colsEnd = [] }
  for (const { sp, i } of order) {
    if (sp.start >= clusterEnd) { flush(); clusterEnd = -1 }
    let col = colsEnd.findIndex(e => e <= sp.start)
    if (col < 0) { col = colsEnd.length; colsEnd.push(sp.end) } else colsEnd[col] = sp.end
    cluster.push({ i, col })
    clusterEnd = Math.max(clusterEnd, sp.end)
  }
  flush()
  return out
}

function TaskCard({ s, t, date, armed, onPointerDown, onArm, priority }: {
  s: State; t: Task; date: string; armed: boolean; onPointerDown: (e: React.PointerEvent) => void; onArm: () => void; priority?: boolean
}) {
  const e = effortOf(s, t)
  const g = goalOf(s, t)
  const pct = e.estimate ? Math.min(100, (e.scheduled / e.estimate) * 100) : 0
  const isDone = t.status === 'done'
  return (
    <div className={`tcard ${t.frog ? 'frog' : ''} ${armed ? 'armed' : ''} ${isDone ? 'done' : ''}`} onPointerDown={onPointerDown} data-task={t.title}>
      {priority && <button className={`frog-toggle ${t.frog ? 'on' : ''}`} onClick={() => setFrog(t.id)} title={t.frog ? 'This is the frog' : 'Make this the frog'} aria-pressed={t.frog} aria-label="Frog"><Icon name="frog" size={15} /></button>}
      <div className="tc-main">
        <button className="tc-title" onClick={() => openModal(<TaskEditor task={t} />)} title="Edit details">{t.title}</button>
        <div className="tc-meta">
          {g ? g.title : priority ? <span className="warn-text">No goal</span> : 'Backlog'}
          {' · '}
          <select className="est" value={ESTIMATES.includes(t.estimateMin) ? t.estimateMin : ''} aria-label={`Estimate for ${t.title}`} onChange={ev => saveTask(t.id, { estimateMin: Number(ev.target.value) })}>
            {!ESTIMATES.includes(t.estimateMin) && <option value="">{duration(t.estimateMin)}</option>}
            {ESTIMATES.map(m => <option key={m} value={m}>{duration(m)} est.</option>)}
          </select>
          {t.postponed > 0 && <span className="warn-text"> · postponed {t.postponed}×</span>}
        </div>
        <div className="effort-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
        <div className="tc-effort">
          {isDone ? <span className="ok-text"><Icon name="check" size={12} /> Done</span>
            : e.remaining === 0 ? <span className="ok-text"><Icon name="check" size={12} /> Fully scheduled · {duration(e.scheduled)}</span>
              : <>Scheduled {duration(e.scheduled)} · <b>{duration(e.remaining)} left</b></>}
          {e.spent > 0 && <> · {duration(e.spent)} done</>}
        </div>
        {e.sessions.length > 0 && (
          <div className="tc-sessions">
            {e.sessions.map(b => <span key={b.id} className="sess">{b.date !== date ? `${b.date === dayKey() ? 'Today' : b.date.slice(5)} ` : ''}{range(spanOf(b))}</span>)}
          </div>
        )}
        {!isDone && (
          <div className="tc-actions">
            <button className="ghost sm" onClick={() => { const r = findTimeFor(t.id, date); toast(r.ok ? `Added a session for “${t.title}”.` : 'No free time left that day.') }}><Icon name="plus" size={13} /> Session</button>
            {e.remaining > 90 && <button className="ghost sm" onClick={() => { const n = splitTask(t.id, date); toast(n ? `Split into ${n} session${n > 1 ? 's' : ''}.` : 'No free gaps left to split into.') }}>Split</button>}
            <button className={`ghost sm place-btn ${armed ? 'on' : ''}`} onClick={onArm} aria-pressed={armed}>{armed ? 'Pick a slot…' : 'Place'}</button>
            <span className="grow" />
            {priority
              ? <button className="icon-btn" onClick={() => unplanTask(t.id)} aria-label={`Move ${t.title} to backlog`} title="Move to backlog"><Icon name="x" size={14} /></button>
              : <button className="ghost sm" disabled={false} onClick={() => planTask(t.id, date)} title="Make it one of the day’s priorities">Prioritize</button>}
          </div>
        )}
      </div>
    </div>
  )
}

function QuickAdd({ date }: { date: string }) {
  const [title, setTitle] = useState('')
  return (
    <form className="quick-add" onSubmit={e => { e.preventDefault(); if (title.trim()) { addOutcome(date, { title: title.trim(), estimateMin: 60 }); setTitle('') } }}>
      <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Add an outcome and press Enter" aria-label="New outcome" />
      <button type="button" className="text-btn" onClick={() => openModal(<TaskEditor date={date} />)}>With details…</button>
    </form>
  )
}

function Backlog({ s, date, armed, onPointerDown, onArm, full }: {
  s: State; date: string; armed: string | null; onPointerDown: (e: React.PointerEvent, t: Task) => void; onArm: (id: string) => void; full: boolean
}) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(() => typeof matchMedia === 'undefined' || !matchMedia('(max-width: 820px)').matches)
  const items = backlog(s)
  return (
    <section className="card pad tray-card">
      <button className="card-head as-btn" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <h2>Backlog & brain dump</h2><span className="count">{items.length}</span>
      </button>
      {open && <>
        <form className="quick-add" onSubmit={e => { e.preventDefault(); if (text.trim()) { addInbox(text.trim()); setText('') } }}>
          <input className="input" value={text} onChange={e => setText(e.target.value)} placeholder="Anything on your mind…" aria-label="Brain dump" />
        </form>
        <div className="bl-list">
          {items.map(t => (
            <div key={t.id} className={`bl-row ${armed === t.id ? 'armed' : ''}`} onPointerDown={e => onPointerDown(e, t)} data-task={t.title}>
              <span className={`pri ${t.priority}`}>{t.priority === 'gold' ? 'Gold' : 'Silver'}</span>
              <span className="grow bl-title">{t.title}{t.postponed > 0 && <small className="warn-text"> · postponed {t.postponed}×</small>}
                {effortOf(s, t).scheduled > 0 && <small className="ok-text"> · {duration(effortOf(s, t).scheduled)} scheduled</small>}</span>
              <button className="ghost sm" onClick={() => onArm(t.id)}>{armed === t.id ? 'Pick…' : 'Place'}</button>
              <button className="ghost sm" disabled={full} onClick={() => planTask(t.id, date)} title={full ? 'Three priorities already' : 'Make it a priority'}>Prioritize</button>
              <button className="icon-btn" onClick={() => dropTask(t.id, 'cleared from backlog')} aria-label={`Drop ${t.title}`}><Icon name="x" size={13} /></button>
            </div>
          ))}
          {!items.length && <p className="empty">Empty head, clear mind.</p>}
        </div>
      </>}
    </section>
  )
}

interface Sug { id: string; text: string; tone?: 'warn' | 'good'; actions: { label: string; run: () => void; primary?: boolean }[] }

function Suggestions({ s, date, priorities, free, unscheduled }: { s: State; date: string; priorities: Task[]; free: number; unscheduled: number }) {
  const out: Sug[] = []
  const unplaced = priorities.filter(t => effortOf(s, t).scheduled === 0)
  if (free < 15) out.push({ id: 'full', tone: 'warn', text: 'Your day is already fully booked.', actions: [] })
  if (unplaced.length >= 2 && free >= 15) {
    out.push({
      id: 'all', text: `${unplaced.length} priorities don’t have a time yet.`, actions: [{
        label: 'Place them, frog first', primary: true,
        run: () => { const p = placePriorities(date); toast(p.length ? `Placed ${p.length} session${p.length > 1 ? 's' : ''}, frog first.` : 'No free slot big enough.') },
      }],
    })
  }
  if (unscheduled > free && free >= 15) {
    const least = [...priorities].reverse().find(t => !t.frog)
    out.push({
      id: 'over', tone: 'warn', text: `Priority work needs ${duration(unscheduled)} but only ${duration(free)} is free.`,
      actions: least ? [{ label: `Move “${least.title}” to backlog`, run: () => unplanTask(least.id) }] : [],
    })
  }
  for (const t of priorities) {
    const e = effortOf(s, t)
    if (e.remaining === 0 || free < 15 || (unplaced.length >= 2 && e.scheduled === 0)) continue
    const fit = firstFit(s, date, Math.min(e.remaining, 90))
    const actions: Sug['actions'] = [{ label: 'Find free time', run: () => { const r = findTimeFor(t.id, date); toast(r.ok ? 'Scheduled.' : 'No free time left.') } }]
    if (e.remaining > 90) actions.push({ label: 'Split into sessions', run: () => { const n = splitTask(t.id, date); toast(n ? `Split into ${n} sessions.` : 'No free gaps left.') } })
    const text = e.scheduled > 0
      ? `You’ve scheduled ${duration(e.scheduled)} of the ${duration(e.estimate)} estimated for “${t.title}”.`
      : e.remaining > 90
        ? `“${t.title}” needs ${duration(e.remaining)}. One long block, or split it into sessions?`
        : `“${t.title}” needs ${duration(e.remaining)}.${fit !== null ? ` Free from ${t12(fit)}.` : ''}`
    out.push({ id: t.id, text, actions })
  }
  if (date === dayKey()) {
    const n = nowMin()
    const next = activeBlocks(s, date).find(b => b.kind === 'fixed' && spanOf(b).start > n)
    const gap = next && gapsBetween(s, date, n, spanOf(next).start).slice(-1)[0]
    if (next && gap && gap.end === spanOf(next).start && len(gap) >= 15 && gap.start <= n + 5) {
      out.push({ id: 'window', tone: 'good', text: `You have a free ${duration(len(gap))} window before “${next.label}”.`, actions: [] })
    }
  }
  if (!out.length) return null
  return (
    <div className="suggestions">
      {out.slice(0, 3).map(x => (
        <div key={x.id} className={`sug ${x.tone ?? ''}`}>
          <Icon name={x.tone === 'warn' ? 'flag' : x.tone === 'good' ? 'sparkle' : 'compass'} size={14} />
          <span className="grow">{x.text}</span>
          {x.actions.map(a => <button key={a.label} className={a.primary ? 'primary sm' : 'ghost sm'} onClick={a.run}>{a.label}</button>)}
        </div>
      ))}
    </div>
  )
}

function Popover({ s, date, pop, top, close, scheduleTask, scheduleOther, resolve, setPop }: {
  s: State; date: string; pop: Pop; top: number; close: () => void
  scheduleTask: (t: Task, start: number, length?: number) => void
  scheduleOther: (kind: BlockKind, label: string, start: number, length: number) => void
  resolve: (p: Pending, start: number | null, shared?: boolean) => void
  setPop: (p: Pop | null) => void
}) {
  const [dur, setDur] = useState(30)
  const [label, setLabel] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [pop])
  const stop = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation()

  if (pop.mode === 'conflict') {
    return (
      <div className="pop conflict" style={{ top }} ref={ref} onClick={stop} onPointerDown={stop} role="dialog" aria-label="Time conflict">
        <div className="pop-title"><Icon name="flag" size={14} /> That overlaps {describeConflict(pop.conflict)}</div>
        <p className="pop-sub">Exclusive time can’t be double-booked.</p>
        <div className="pop-actions">
          {pop.suggestion !== null && <button className="primary sm" onClick={() => resolve(pop.pending, pop.suggestion)}>Use {t12(pop.suggestion)} instead</button>}
          <button className="ghost sm" onClick={() => resolve(pop.pending, null, true)} title="Mark this block as non-exclusive">Allow overlap</button>
          <button className="text-btn" onClick={close}>Cancel</button>
        </div>
      </div>
    )
  }

  if (pop.mode === 'edit') {
    const b = s.blocks.find(x => x.id === pop.id)
    if (!b) return null
    return <BlockPop s={s} b={b} top={top} close={close} onConflict={(pending, r) => r.conflict && setPop({ mode: 'conflict', minute: pending.kind === 'move' ? pending.patch.start : 0, pending, conflict: r.conflict, suggestion: r.suggestion })} />
  }

  const minute = pop.minute
  const priorities = outcomesFor(s, date).filter(t => t.status === 'ready')
  const extra = backlog(s).slice(0, 5)
  return (
    <div className="pop quick" style={{ top }} ref={ref} onClick={stop} onPointerDown={stop} role="dialog" aria-label={`Schedule at ${t12(minute)}`}>
      <div className="pop-row">
        <div className="pop-title">{t12(minute)}</div>
        <div className="seg small">{DURATIONS.map(m => <button key={m} className={dur === m ? 'on' : ''} onClick={() => setDur(m)}>{duration(m)}</button>)}</div>
        <button className="icon-btn" onClick={close} aria-label="Close"><Icon name="x" size={14} /></button>
      </div>
      {priorities.length > 0 && <div className="pop-label">Priorities</div>}
      {priorities.map(t => {
        const e = effortOf(s, t)
        return <button key={t.id} className="pop-task" onClick={() => scheduleTask(t, minute, dur)}>{t.frog && <Icon name="frog" size={13} />}<span className="grow">{t.title}</span><small>{e.remaining ? `${duration(e.remaining)} left` : 'scheduled'}</small></button>
      })}
      {extra.length > 0 && <div className="pop-label">Backlog</div>}
      {extra.map(t => <button key={t.id} className="pop-task" onClick={() => scheduleTask(t, minute, dur)}><span className="grow">{t.title}</span></button>)}
      <div className="pop-label">Something else</div>
      <input className="input sm" value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (optional)" aria-label="Block label" />
      <div className="pop-kinds">
        {OTHER_KINDS.map(k => <button key={k} className={`kind-chip k-${k}`} onClick={() => scheduleOther(k, label.trim(), minute, dur)}><i />{BLOCK_KINDS.find(x => x.id === k)!.label}</button>)}
      </div>
    </div>
  )
}

function BlockPop({ s, b, top, close, onConflict }: { s: State; b: Block; top: number; close: () => void; onConflict: (p: Pending, r: Extract<PlaceResult, { ok: false }>) => void }) {
  const sp = spanOf(b)
  const task = s.tasks.find(t => t.id === b.taskId)
  const [label, setLabel] = useState(b.label)
  const ref = useRef<HTMLDivElement>(null)
  const stop = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation()
  const apply = (patch: { start?: number; end?: number; kind?: BlockKind; label?: string; shared?: boolean }) => {
    const r = retimeBlock(b.id, patch)
    if (!r.ok) {
      if (r.reason === 'conflict') onConflict({ kind: 'move', id: b.id, patch: { start: patch.start ?? sp.start, end: patch.end ?? sp.end } }, r)
      else toast('That time doesn’t work.')
    }
  }
  const isToday = b.date === dayKey()
  const now = nowMin()
  return (
    <div className="pop edit" style={{ top }} ref={ref} onClick={stop} onPointerDown={stop} role="dialog" aria-label={`Edit ${b.label}`}>
      <div className="pop-row">
        {task ? <div className="pop-title grow">{b.label}</div>
          : <input className="input sm grow" value={label} onChange={e => setLabel(e.target.value)} onBlur={() => label.trim() && label !== b.label && apply({ label: label.trim() })} aria-label="Label" />}
        <button className="icon-btn" onClick={close} aria-label="Close"><Icon name="x" size={14} /></button>
      </div>
      <div className="pop-sub">{range(sp)} · {duration(len(sp))}{task && <> · {duration(effortOf(s, task).remaining)} of “{task.title}” left to schedule</>}</div>
      <div className="pop-row wrap">
        <button className="ghost sm" onClick={() => apply({ start: sp.start - 15, end: sp.end - 15 })}>−15m</button>
        <button className="ghost sm" onClick={() => apply({ start: sp.start + 15, end: sp.end + 15 })}>+15m</button>
        <div className="seg small">{DURATIONS.map(m => <button key={m} className={len(sp) === m ? 'on' : ''} onClick={() => apply({ end: sp.start + m })}>{duration(m)}</button>)}</div>
      </div>
      {!task && (
        <div className="pop-kinds">
          {BLOCK_KINDS.map(k => <button key={k.id} className={`kind-chip k-${k.id} ${b.kind === k.id ? 'on' : ''}`} onClick={() => apply({ kind: k.id })}><i />{k.label}</button>)}
        </div>
      )}
      <label className="check-row small"><input type="checkbox" className="check" checked={!!b.shared} onChange={() => apply({ shared: !b.shared })} /> Can overlap other blocks</label>
      <div className="pop-actions">
        <button className="ghost sm danger" onClick={() => { deleteBlock(b.id); close(); toast(`Removed ${b.label}.`) }}><Icon name="trash" size={13} /> Remove</button>
        <span className="grow" />
        {task && isToday && task.status === 'ready' && sp.end > now && <button className="primary sm" onClick={() => { close(); openModal(<StartFocus task={task} minutes={Math.max(5, Math.min(len(sp), sp.end - Math.max(now, sp.start)))} />) }}><Icon name="play" size={13} /> Start focus</button>}
        <button className="ghost sm" onClick={close}>Done</button>
      </div>
    </div>
  )
}
