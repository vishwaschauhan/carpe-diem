import { useState } from 'react'
import {
  AREAS, Area, BLOCK_KINDS, Block, BlockKind, StuckReason, Task, addBlock, addOutcome, addTask, backlog, breakOver, clearTransition,
  completeTask, currentBlock, deleteBlock, deleteTask, dropTask, finishSession, getState, noteReturn, outcomesFor, park,
  pauseFocus, recordStuck, saveBlock, saveTask, startBreak, startFocus, switchTo, unplanTask,
} from '../store'
import { clock, dayKey, fromMin, nowMin, toMin } from '../time'
import { Dialog, Field, Icon, closeModal, openModal, toast } from '../ui'

const DURATIONS = [5, 25, 50, 90]

// ---------- Task editor ----------

export function TaskEditor({ task, date, goalId: presetGoal }: { task?: Task; date?: string | null; goalId?: string }) {
  const s = getState()
  const [title, setTitle] = useState(task?.title ?? '')
  const [goalId, setGoalId] = useState(task?.goalId ?? presetGoal ?? '')
  const [area, setArea] = useState<Area>(task?.area ?? 'work')
  const [next, setNext] = useState(task?.next ?? '')
  const [doneWhen, setDoneWhen] = useState(task?.doneWhen ?? '')
  const [estimate, setEstimate] = useState(task?.estimateMin ?? 50)
  const [priority, setPriority] = useState<'gold' | 'silver'>(task?.priority ?? 'gold')
  const [frog, setFrog] = useState(task?.frog ?? false)
  const planned = task ? task.plannedDate : date ?? null
  const goals = s.goals.filter(g => g.status === 'active')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const goal = s.goals.find(g => g.id === goalId)
    const patch = {
      title: title.trim(), goalId: goalId || null, area: goal?.area ?? area, next: next.trim(), doneWhen: doneWhen.trim(),
      estimateMin: Math.max(5, Number(estimate) || 25), priority, frog: planned ? frog : false,
    }
    if (task) saveTask(task.id, patch)
    else if (planned) {
      if (outcomesFor(s, planned).length >= 3) { toast('Three outcomes max. Swap one out first.'); return }
      addOutcome(planned, patch)
    } else {
      addTask({ ...patch, status: 'ready' })
    }
    closeModal()
  }

  return (
    <Dialog eyebrow={task ? 'Edit outcome' : planned ? 'New outcome' : 'New backlog item'} title={task ? 'Sharpen the finish line' : 'Make it concrete'}
      sub="Vague intentions invite procrastination. Name the result, the very first physical step, and what done looks like.">
      <form onSubmit={submit} className="stack-12">
        <Field label="Outcome"><input className="input" data-autofocus value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="e.g. Ship the review of PR #482" required /></Field>
        <div className="row-2">
          <Field label="Goal"><select className="input" value={goalId} onChange={e => setGoalId(e.target.value)}>
            <option value="">No goal</option>
            {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select></Field>
          {!goalId && <Field label="Area"><select className="input" value={area} onChange={e => setArea(e.target.value as Area)}>
            {AREAS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select></Field>}
          {goalId && <Field label="Estimate (min)"><input className="input" type="number" min={5} step={5} value={estimate} onChange={e => setEstimate(Number(e.target.value))} /></Field>}
        </div>
        <Field label="First physical action" hint="Something you could start in the next 60 seconds."><input className="input" value={next} maxLength={200} onChange={e => setNext(e.target.value)} placeholder="Open the PR and read the description" /></Field>
        <Field label="Done when"><input className="input" value={doneWhen} maxLength={200} onChange={e => setDoneWhen(e.target.value)} placeholder="An observable result, not “worked on it”" /></Field>
        <div className="row-2">
          {!goalId && <Field label="Estimate (min)"><input className="input" type="number" min={5} step={5} value={estimate} onChange={e => setEstimate(Number(e.target.value))} /></Field>}
          <Field label="Priority"><div className="seg">
            <button type="button" className={priority === 'gold' ? 'on gold' : ''} onClick={() => setPriority('gold')}>Gold</button>
            <button type="button" className={priority === 'silver' ? 'on' : ''} onClick={() => setPriority('silver')}>Silver</button>
          </div></Field>
        </div>
        {planned && (
          <label className="check-row">
            <input type="checkbox" checked={frog} onChange={e => setFrog(e.target.checked)} />
            <span><b>This is the frog.</b> The most important, most resisted outcome. It gets the first focus block.</span>
          </label>
        )}
        <div className="actions">
          {task && <button type="button" className="ghost danger" onClick={() => { if (confirm('Delete this item permanently?')) { deleteTask(task.id); closeModal() } }}><Icon name="trash" size={15} /> Delete</button>}
          <span className="grow" />
          <button type="button" className="ghost" onClick={closeModal}>Cancel</button>
          <button className="primary" type="submit">{task ? 'Save' : 'Add'}</button>
        </div>
      </form>
    </Dialog>
  )
}

// ---------- Start focus ----------

export function StartFocus({ task, minutes }: { task: Task; minutes?: number }) {
  const s = getState()
  const block = currentBlock(s)
  const blockLeft = block && block.taskId === task.id ? Math.floor(toMin(block.end) - nowMin()) : 0
  const [mins, setMins] = useState(minutes ?? (blockLeft >= 15 ? Math.min(blockLeft, 90) : s.settings.defaultFocusMin))
  const [next, setNext] = useState(task.resume || task.next)
  const start = (e: React.FormEvent) => {
    e.preventDefault()
    if (!next.trim()) return
    if (task.resume) saveTask(task.id, { resume: next.trim() })
    else saveTask(task.id, { next: next.trim() })
    startFocus(task.id, mins)
    closeModal()
  }
  return (
    <Dialog eyebrow="Start focus" title={task.title} sub={task.doneWhen ? `Done when: ${task.doneWhen}` : 'One thing. Everything else can wait or be parked.'}>
      <form onSubmit={start} className="stack-12">
        <Field label={task.resume ? 'Pick up where you left off' : 'Your first physical action'}>
          <input className="input" data-autofocus value={next} onChange={e => setNext(e.target.value)} placeholder="Open…, write…, decide…" required />
        </Field>
        <Field label="How long">
          <div className="seg wrap">
            {DURATIONS.map(m => <button type="button" key={m} className={mins === m ? 'on' : ''} onClick={() => setMins(m)}>{m === 5 ? 'Just 5 min' : `${m} min`}</button>)}
            <input className="input mini" type="number" min={1} max={180} value={mins} onChange={e => setMins(Math.max(1, Number(e.target.value) || 1))} aria-label="Custom minutes" />
          </div>
        </Field>
        {mins === 5 && <p className="hint-box">The five-minute rule: starting is the hard part. When the timer ends, you can stop guilt-free, or keep going.</p>}
        <div className="actions">
          <button type="button" className="ghost" onClick={() => openModal(<Unstick task={task} />)}>Feeling resistance?</button>
          <span className="grow" />
          <button className="primary" type="submit"><Icon name="play" size={15} /> Start {mins} min</button>
        </div>
      </form>
    </Dialog>
  )
}

// ---------- Pause / interruption ----------

export function PauseModal({ task }: { task: Task }) {
  const [note, setNote] = useState(task.resume || task.next)
  return (
    <Dialog eyebrow="Interruption" title="Leave yourself a breadcrumb" sub="Ten seconds now saves ten minutes of reloading context later.">
      <form className="stack-12" onSubmit={e => { e.preventDefault(); pauseFocus(note.trim()); closeModal(); toast('Paused. Your place is saved.') }}>
        <Field label="When I come back, I’ll start by…">
          <textarea className="input" data-autofocus rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Re-run the failing test in auth_spec…" />
        </Field>
        <div className="actions"><span className="grow" /><button type="button" className="ghost" onClick={closeModal}>Keep focusing</button><button className="primary" type="submit"><Icon name="pause" size={15} /> Pause</button></div>
      </form>
    </Dialog>
  )
}

// ---------- Intentional switch ----------

const SWITCH_REASONS = ['Higher-priority work came up', 'Blocked on this one', 'Meeting or scheduled transition', 'Choosing a different priority']

export function SwitchModal({ current, targetId }: { current?: Task; targetId?: string }) {
  const s = getState()
  const today = dayKey()
  const options = [...outcomesFor(s, today), ...backlog(s)].filter(t => t.status === 'ready' || t.status === 'inbox').filter(t => t.id !== current?.id)
  const [target, setTarget] = useState(targetId ?? options[0]?.id ?? '')
  const [reason, setReason] = useState(SWITCH_REASONS[0])
  const [crumb, setCrumb] = useState(current?.resume || current?.next || '')
  const [idea, setIdea] = useState('')
  if (!options.length) {
    return <Dialog title="Nothing else is planned" sub="Add an outcome or a backlog item first, or finish the current one."><div className="actions"><span className="grow" /><button className="primary" onClick={closeModal}>Back to focus</button></div></Dialog>
  }
  const focusing = s.timer.mode === 'focus' || s.timer.mode === 'paused'
  return (
    <Dialog eyebrow="Intentional switch" title={current && focusing ? `You’re working on “${current.title}”` : 'Choose what’s next'}
      sub={current && focusing ? 'Switching is allowed. Make it a decision, not a drift.' : undefined}>
      <div className="stack-12">
        {current && focusing && <>
          <div className="actions">
            <button className="secondary" onClick={() => { closeModal(); toast('Back to it.') }}>Return to current focus</button>
            <button className="ghost" onClick={() => openModal(<BreakModal />)}><Icon name="coffee" size={15} /> Take a break</button>
          </div>
          <form className="inline-form" onSubmit={e => { e.preventDefault(); if (idea.trim()) { park(idea.trim()); closeModal(); toast('Parked. Back to what matters.') } }}>
            <input className="input" value={idea} onChange={e => setIdea(e.target.value)} placeholder="Or park the new thing for later…" />
            <button className="ghost" type="submit">Park it</button>
          </form>
          <div className="divider" />
        </>}
        <Field label="Switch to"><select className="input" value={target} onChange={e => setTarget(e.target.value)}>
          {options.map(t => <option key={t.id} value={t.id}>{t.title}{t.plannedDate ? '' : ' (backlog)'}</option>)}
        </select></Field>
        <Field label="Why now?"><select className="input" value={reason} onChange={e => setReason(e.target.value)}>{SWITCH_REASONS.map(r => <option key={r}>{r}</option>)}</select></Field>
        {current && <Field label={`Breadcrumb for “${current.title}”`}><input className="input" value={crumb} onChange={e => setCrumb(e.target.value)} placeholder="When I return, start by…" /></Field>}
        <div className="actions"><span className="grow" /><button className="ghost" onClick={closeModal}>Cancel</button>
          <button className="primary" onClick={() => {
            switchTo(target, reason, crumb.trim())
            const t = getState().tasks.find(x => x.id === target)
            if (t) openModal(<StartFocus task={t} />)
            else closeModal()
          }}>Switch on purpose <Icon name="arrow" size={15} /></button></div>
      </div>
    </Dialog>
  )
}

// ---------- Break ----------

export function BreakModal() {
  const [mins, setMins] = useState(10)
  return (
    <Dialog eyebrow="Rest is intentional" title="Take a real break" sub="Set a boundary so a short reset doesn’t quietly become an hour.">
      <div className="stack-12">
        <div className="seg">{[5, 10, 15, 30].map(m => <button key={m} className={mins === m ? 'on' : ''} onClick={() => setMins(m)}>{m} min</button>)}</div>
        <p className="hint-box">Move, hydrate, look out a window. Screens don’t count as rest.</p>
        <div className="actions"><span className="grow" /><button className="ghost" onClick={closeModal}>Not now</button><button className="primary" onClick={() => { startBreak(mins); closeModal() }}><Icon name="coffee" size={15} /> Start break</button></div>
      </div>
    </Dialog>
  )
}

// ---------- Drift ----------

export function DriftModal() {
  const [text, setText] = useState('')
  const s = getState()
  const cur = s.tasks.find(t => t.id === s.timer.taskId)
  return (
    <Dialog eyebrow="Attention check" title="You noticed. That’s the skill." sub="No guilt. Park the pull, then go back, or make a conscious choice.">
      <form className="stack-12" onSubmit={e => { e.preventDefault(); if (!text.trim()) { noteReturn(); closeModal(); toast('Back on track.'); return } park(text.trim()); closeModal(); toast('Parked. Back to what matters.') }}>
        <Field label="What pulled at you?"><input className="input" data-autofocus value={text} onChange={e => setText(e.target.value)} placeholder="A video, an email, a new idea…" /></Field>
        {cur && <p className="hint-box">Back to <b>{cur.title}</b>{(cur.resume || cur.next) ? <>: {cur.resume || cur.next}</> : null}</p>}
        <div className="actions">
          <button type="button" className="ghost" onClick={() => openModal(<BreakModal />)}>I need a break</button>
          <button type="button" className="ghost" onClick={() => openModal(<SwitchModal current={cur} />)}>Switch on purpose</button>
          <span className="grow" />
          <button className="primary" type="submit">{text.trim() ? 'Park it & return' : 'Just return'}</button>
        </div>
      </form>
    </Dialog>
  )
}

// ---------- Unstick: the procrastination unpacker ----------

const REASONS: { id: StuckReason; label: string; sub: string }[] = [
  { id: 'unclear', label: 'I’m not sure what to do first', sub: 'Unclear next step' },
  { id: 'big', label: 'It feels too big', sub: 'Overwhelm' },
  { id: 'boring', label: 'It’s boring or unpleasant', sub: 'Low appeal' },
  { id: 'anxious', label: 'I’m worried it won’t be good', sub: 'Perfectionism, fear' },
  { id: 'tired', label: 'I’m tired or low on energy', sub: 'Capacity' },
  { id: 'unimportant', label: 'Honestly, it may not matter', sub: 'Wrong commitment' },
]

export function Unstick({ task }: { task: Task }) {
  const [reason, setReason] = useState<StuckReason | null>(null)
  const [text, setText] = useState('')
  const s = getState()
  const choose = (r: StuckReason) => {
    recordStuck(task.id, r)
    setReason(r)
    setText(r === 'anxious' ? 'A rough first pass that I can improve later' : '')
  }
  const go = (mins: number, patch?: Partial<Task>) => {
    if (patch) saveTask(task.id, patch)
    startFocus(task.id, mins)
    closeModal()
  }

  if (!reason) {
    return (
      <Dialog eyebrow="What’s in the way?" title={task.title}
        sub="Procrastination is usually about a feeling, not laziness or time. Name it, and the fix gets obvious.">
        <div className="choice-list">
          {REASONS.map(r => (
            <button key={r.id} className="choice" onClick={() => choose(r.id)}>
              <span><b>{r.label}</b><small>{r.sub}</small></span><Icon name="arrow" size={16} />
            </button>
          ))}
        </div>
      </Dialog>
    )
  }

  const easier = [...outcomesFor(s, dayKey()), ...backlog(s)].filter(t => t.id !== task.id && t.status !== 'done' && t.estimateMin <= 30)

  return (
    <Dialog eyebrow="Make it easy to start" title={task.title}>
      <div className="stack-12">
        {reason === 'unclear' && <>
          <p className="dialog-sub flush">Clarity kills resistance. What is the very next physical action? Use a verb: open, write, list, call.</p>
          <input className="input" autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="Open the design doc and list the open questions" />
          <div className="actions"><span className="grow" /><button className="primary" disabled={!text.trim()} onClick={() => go(25, { next: text.trim() })}>Start with that, 25 min</button></div>
        </>}
        {reason === 'big' && <>
          <p className="dialog-sub flush">Shrink it until it’s almost silly. What’s a version you could do in five minutes?</p>
          <input className="input" autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="Write the headings only" />
          <div className="actions"><span className="grow" /><button className="primary" disabled={!text.trim()} onClick={() => go(5, { next: text.trim() })}>Do just that, 5 min</button></div>
        </>}
        {reason === 'boring' && <>
          <p className="dialog-sub flush">Make a deal with yourself: ten minutes, then you’re allowed to stop. Most of the pain is in the anticipation.</p>
          <div className="actions"><span className="grow" /><button className="primary" onClick={() => go(10)}>Deal. 10 minutes</button></div>
        </>}
        {reason === 'anxious' && <>
          <p className="dialog-sub flush">Lower the bar. Give yourself permission to do it badly first. You can’t edit a blank page.</p>
          <Field label="Done when (for now)"><input className="input" autoFocus value={text} onChange={e => setText(e.target.value)} /></Field>
          <div className="actions"><span className="grow" /><button className="primary" onClick={() => go(25, { doneWhen: text.trim() || task.doneWhen })}>Start the rough pass</button></div>
        </>}
        {reason === 'tired' && <>
          <p className="dialog-sub flush">Respect your energy without abandoning the plan. Pick one:</p>
          <div className="choice-list">
            <button className="choice" onClick={() => { startBreak(10); closeModal() }}><span><b>Recharge for 10 minutes</b><small>Walk, water, daylight. Then come back.</small></span><Icon name="coffee" size={16} /></button>
            <button className="choice" onClick={() => go(5)}><span><b>Start anyway, just 5 minutes</b><small>Energy often follows action.</small></span><Icon name="play" size={16} /></button>
            {easier.slice(0, 3).map(t => (
              <button key={t.id} className="choice" onClick={() => { switchTo(t.id, 'Low energy, swapped to a lighter task', task.resume); openModal(<StartFocus task={t} minutes={25} />) }}>
                <span><b>Swap to: {t.title}</b><small>Lighter task, {t.estimateMin} min</small></span><Icon name="switch" size={16} />
              </button>
            ))}
          </div>
        </>}
        {reason === 'unimportant' && <>
          <p className="dialog-sub flush">Then let it go on purpose. A dropped commitment is honest; a dodged one keeps nagging.</p>
          <div className="actions">
            <button className="ghost" onClick={() => { unplanTask(task.id); closeModal(); toast('Moved to the backlog.') }}>Move to backlog</button>
            <span className="grow" />
            <button className="primary" onClick={() => { dropTask(task.id, 'not important'); closeModal(); toast('Dropped. One less open loop.') }}>Drop it</button>
          </div>
        </>}
        <button className="text-btn" onClick={() => setReason(null)}>← Something else</button>
      </div>
    </Dialog>
  )
}

// ---------- Transition gate ----------

export function TransitionModal() {
  const s = getState()
  const t = s.timer
  const task = s.tasks.find(x => x.id === t.taskId)
  const [stage, setStage] = useState<'ask' | 'progress'>('ask')
  const [next, setNext] = useState(task?.next ?? '')
  const today = dayKey()
  const open = outcomesFor(s, today).filter(x => x.status === 'ready' && x.id !== task?.id)
  const block = currentBlock(s)
  const recommended = (block?.taskId && open.find(x => x.id === block.taskId)) || open.find(x => x.frog) || open[0]

  if (t.transition === 'session' && task) {
    if (stage === 'ask') {
      return (
        <Dialog eyebrow="Focus block complete" title="Did you finish the outcome?" sub={task.doneWhen ? `${task.title}. Done when: ${task.doneWhen}` : task.title}>
          <div className="choice-list">
            <button className="choice" onClick={() => { finishSession('done'); openModal(<TransitionModal />) }}><span><b>Yes, it’s done</b><small>Mark the outcome complete</small></span><Icon name="check" size={16} /></button>
            <button className="choice" onClick={() => setStage('progress')}><span><b>Made progress</b><small>Set the next step, then continue or rest</small></span><Icon name="arrow" size={16} /></button>
            <button className="choice" onClick={() => { finishSession('stuck'); openModal(<Unstick task={getState().tasks.find(x => x.id === task.id)!} />) }}><span><b>I got stuck</b><small>Figure out what’s in the way</small></span><Icon name="compass" size={16} /></button>
          </div>
        </Dialog>
      )
    }
    return (
      <Dialog eyebrow="Keep the thread" title="What’s the next step?" sub="Write it now while the context is fresh.">
        <div className="stack-12">
          <input className="input" autoFocus value={next} onChange={e => setNext(e.target.value)} placeholder="Next physical action" />
          <div className="actions">
            <button className="ghost" onClick={() => { finishSession('progress', next); openModal(<BreakModal />) }}><Icon name="coffee" size={15} /> Break</button>
            <button className="ghost" onClick={() => { finishSession('progress', next); openModal(<SwitchModal />) }}><Icon name="switch" size={15} /> Switch</button>
            <span className="grow" />
            <button className="primary" onClick={() => { finishSession('progress', next); openModal(<StartFocus task={getState().tasks.find(x => x.id === task.id)!} />) }}>Another block <Icon name="arrow" size={15} /></button>
          </div>
        </div>
      </Dialog>
    )
  }

  if (t.transition === 'task') {
    const doneCount = outcomesFor(s, today).filter(x => x.status === 'done').length
    return (
      <Dialog eyebrow="Outcome complete" title={doneCount >= 3 ? 'All three. That’s a won day.' : 'Done. Nicely handled.'}
        sub={recommended ? `Next up: “${recommended.title}”${recommended.next ? `. First step: ${recommended.next}` : ''}` : 'Nothing else is committed today. Rest is a choice, not a failure.'}>
        <div className="actions">
          <button className="ghost" onClick={() => { clearTransition(); openModal(<BreakModal />) }}><Icon name="coffee" size={15} /> Break first</button>
          <span className="grow" />
          {recommended
            ? <button className="primary" onClick={() => { clearTransition(); openModal(<StartFocus task={recommended} />) }}>Start next <Icon name="arrow" size={15} /></button>
            : <button className="primary" onClick={() => { clearTransition(); closeModal() }}>Close</button>}
        </div>
      </Dialog>
    )
  }

  if (t.transition === 'break') {
    const resumeTask = task && task.status === 'ready' ? task : recommended
    return (
      <Dialog eyebrow="Welcome back" title="Choose deliberately" sub={resumeTask ? `You were on “${resumeTask.title}”.` : 'Your break is over.'}>
        {resumeTask && (resumeTask.resume || resumeTask.next) && <p className="hint-box">Resume: {resumeTask.resume || resumeTask.next}</p>}
        <div className="actions">
          <button className="ghost" onClick={() => { clearTransition(); openModal(<SwitchModal />) }}>Something else</button>
          <span className="grow" />
          {resumeTask
            ? <button className="primary" onClick={() => { clearTransition(); openModal(<StartFocus task={resumeTask} />) }}>Resume <Icon name="arrow" size={15} /></button>
            : <button className="primary" onClick={() => { clearTransition(); closeModal() }}>Close</button>}
        </div>
      </Dialog>
    )
  }
  return null
}

export function endBreakNow() {
  breakOver()
  openModal(<TransitionModal />)
}

export function markDone(task: Task) {
  completeTask(task.id)
  if (getState().timer.transition === 'task') openModal(<TransitionModal />)
  else toast('Done.')
}

// ---------- Block editor ----------

export function BlockEditor({ date, block, start }: { date: string; block?: Block; start?: string }) {
  const s = getState()
  const initialStart = block?.start ?? start ?? fromMin(Math.ceil(nowMin() / 15) * 15)
  const [from, setFrom] = useState(initialStart)
  const [to, setTo] = useState(block?.end ?? fromMin(toMin(initialStart) + 60))
  const [kind, setKind] = useState<BlockKind>(block?.kind ?? 'focus')
  const [label, setLabel] = useState(block?.label ?? '')
  const [taskId, setTaskId] = useState(block?.taskId ?? '')
  const outcomes = outcomesFor(s, date).filter(t => t.status !== 'dropped')
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (toMin(to) <= toMin(from)) { toast('End must be after start.'); return }
    const t = outcomes.find(x => x.id === taskId)
    const patch = { start: from, end: to, kind, label: label.trim() || t?.title || BLOCK_KINDS.find(k => k.id === kind)!.label, taskId: kind === 'focus' ? taskId || null : null }
    if (block) saveBlock(block.id, { ...patch, decision: null })
    else addBlock({ date, ...patch })
    closeModal()
  }
  return (
    <Dialog eyebrow={block ? 'Edit block' : 'New time block'} title={block ? (block.label || 'Block') : 'Give it a time'} sub={kind === 'family' ? 'Family blocks are protected. The coach stays silent.' : undefined}>
      <form className="stack-12" onSubmit={save}>
        <div className="seg wrap">{BLOCK_KINDS.map(k => <button type="button" key={k.id} className={kind === k.id ? `on k-${k.id}` : ''} onClick={() => setKind(k.id)} title={k.hint}>{k.label}</button>)}</div>
        <div className="row-2">
          <Field label="Start"><input className="input" type="time" value={from} onChange={e => setFrom(e.target.value)} required /></Field>
          <Field label="End"><input className="input" type="time" value={to} onChange={e => setTo(e.target.value)} required /></Field>
        </div>
        <div className="seg wrap small">{[15, 25, 45, 60, 90].map(m => <button type="button" key={m} onClick={() => setTo(fromMin(toMin(from) + m))} className={toMin(to) - toMin(from) === m ? 'on' : ''}>{m}m</button>)}</div>
        {kind === 'focus' && <Field label="Outcome"><select className="input" value={taskId} onChange={e => setTaskId(e.target.value)}>
          <option value="">Any / unassigned</option>
          {outcomes.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select></Field>}
        <Field label="Label"><input className="input" value={label} onChange={e => setLabel(e.target.value)} placeholder={kind === 'fixed' ? 'Standup' : kind === 'family' ? 'Dinner and bedtime' : 'Optional'} /></Field>
        <div className="actions">
          {block && <button type="button" className="ghost danger" onClick={() => { deleteBlock(block.id); closeModal() }}><Icon name="trash" size={15} /> Remove</button>}
          <span className="grow" />
          <button type="button" className="ghost" onClick={closeModal}>Cancel</button>
          <button className="primary" type="submit">{block ? 'Save' : 'Add block'}</button>
        </div>
      </form>
    </Dialog>
  )
}

export function blockLabelTime(b: Block) {
  return `${clock(b.start)}–${clock(b.end)}`
}
