import { useState } from 'react'
import { TaskEditor } from '../components/modals'
import { AREAS, Area, Goal, State, areaLabel, deleteGoal, newGoal, saveGoal } from '../store'
import { addDays, dayKey, duration, weekStart } from '../time'
import { Dialog, Field, Icon, Progress, closeModal, openModal } from '../ui'

function GoalEditor({ goal }: { goal?: Goal }) {
  const [g, setG] = useState<Goal>(goal ?? newGoal({ title: '' }))
  const set = <K extends keyof Goal>(k: K, v: Goal[K]) => setG({ ...g, [k]: v })
  return (
    <Dialog eyebrow={goal ? 'Edit goal' : 'New goal'} title={goal ? goal.title : 'What are you building toward?'} sub="Goals give daily outcomes their meaning. Keep a handful, not a list.">
      <form className="stack-12" onSubmit={e => { e.preventDefault(); if (g.title.trim()) { saveGoal({ ...g, title: g.title.trim() }); closeModal() } }}>
        <Field label="Goal"><input className="input" data-autofocus value={g.title} onChange={e => set('title', e.target.value)} placeholder="Become an AI infrastructure engineer" required /></Field>
        <Field label="Why it matters" hint="Read this when motivation is low."><textarea className="input" rows={2} value={g.why} onChange={e => set('why', e.target.value)} /></Field>
        <div className="row-2">
          <Field label="Area"><select className="input" value={g.area} onChange={e => set('area', e.target.value as Area)}>{AREAS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></Field>
          <Field label="Status"><select className="input" value={g.status} onChange={e => set('status', e.target.value as Goal['status'])}><option value="active">Active</option><option value="paused">Paused</option><option value="done">Completed</option></select></Field>
        </div>
        <Field label="Current milestone"><input className="input" value={g.milestone} onChange={e => set('milestone', e.target.value)} placeholder="Finish the LLM architecture foundations" /></Field>
        <Field label="Success looks like"><input className="input" value={g.successCriteria} onChange={e => set('successCriteria', e.target.value)} placeholder="Measurable result" /></Field>
        <div className="row-2">
          <Field label="Target date"><input className="input" type="date" value={g.targetDate} onChange={e => set('targetDate', e.target.value)} /></Field>
          <Field label="Weekly focus target (min)"><input className="input" type="number" min={0} step={30} value={g.weeklyTargetMin} onChange={e => set('weeklyTargetMin', Number(e.target.value) || 0)} /></Field>
        </div>
        <div className="actions">
          {goal && <button type="button" className="ghost danger" onClick={() => { if (confirm('Delete this goal? Linked tasks stay, unlinked.')) { deleteGoal(goal.id); closeModal() } }}><Icon name="trash" size={15} /> Delete</button>}
          <span className="grow" /><button type="button" className="ghost" onClick={closeModal}>Cancel</button><button className="primary" type="submit">Save goal</button>
        </div>
      </form>
    </Dialog>
  )
}

export function Goals({ s }: { s: State }) {
  const today = dayKey()
  const wk = weekStart(today)
  const weekEnd = addDays(wk, 7)
  const goals = [...s.goals].sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1))
  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <div className="eyebrow">Goals</div>
          <h1 className="page-title">Why today matters</h1>
          <p className="page-sub">Every outcome should move one of these. Progress counts finished work, then focused time.</p>
        </div>
        <button className="primary" onClick={() => openModal(<GoalEditor />)}><Icon name="plus" size={15} /> Goal</button>
      </header>
      <div className="goal-list">
        {goals.map(g => {
          const tasks = s.tasks.filter(t => t.goalId === g.id)
          const weekMin = s.sessions.filter(x => x.date >= wk && x.date < weekEnd && tasks.some(t => t.id === x.taskId)).reduce((a, x) => a + x.ms, 0) / 60000
          const doneWeek = tasks.filter(t => t.status === 'done' && t.doneAt && dayKey(new Date(t.doneAt)) >= wk).length
          const open = tasks.filter(t => t.status === 'ready' || t.status === 'inbox')
          return (
            <section key={g.id} className={`card pad goal ${g.status !== 'active' ? 'inactive' : ''}`}>
              <div className="goal-top">
                <div>
                  <div className="eyebrow">{areaLabel(g.area)}{g.status !== 'active' ? ` · ${g.status === 'done' ? 'Completed' : 'Paused'}` : ''}{g.targetDate ? ` · by ${g.targetDate}` : ''}</div>
                  <h2>{g.title}</h2>
                  {g.why && <p className="goal-why">{g.why}</p>}
                </div>
                <button className="icon-btn" onClick={() => openModal(<GoalEditor goal={g} />)} aria-label={`Edit ${g.title}`}><Icon name="edit" size={15} /></button>
              </div>
              {g.milestone && <div className="milestone"><Icon name="flag" size={13} /> {g.milestone}</div>}
              {g.weeklyTargetMin > 0 && (
                <div className="goal-progress">
                  <div className="part-top"><span>This week</span><span className="muted">{duration(weekMin)} of {duration(g.weeklyTargetMin)} · {doneWeek} outcome{doneWeek === 1 ? '' : 's'} done</span></div>
                  <Progress value={weekMin / g.weeklyTargetMin} tone={weekMin >= g.weeklyTargetMin ? 'good' : ''} />
                </div>
              )}
              {open.length > 0 && <div className="goal-tasks">{open.slice(0, 4).map(t => <span key={t.id} className="tag">{t.title}{t.plannedDate ? '' : ' · backlog'}</span>)}</div>}
              <button className="text-btn" onClick={() => openModal(<TaskEditor date={null} goalId={g.id} />)}>+ Add a backlog item</button>
            </section>
          )
        })}
      </div>
    </div>
  )
}
