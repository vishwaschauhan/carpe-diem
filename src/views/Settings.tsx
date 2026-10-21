import { useRef, useState } from 'react'
import { BLOCK_KINDS, BlockKind, RoutineBlock, State, exportJSON, importJSON, patchSettings, resetAll, uid } from '../store'
import { clock, dayKey } from '../time'
import { Field, Icon, toast } from '../ui'
import { SyncPanel } from '../components/SyncPanel'

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function Settings({ s }: { s: State }) {
  const st = s.settings
  const fileRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<RoutineBlock>({ id: '', start: '09:00', end: '09:15', kind: 'fixed', label: '', days: [1, 2, 3, 4, 5] })

  const enableNotifications = async () => {
    if (!('Notification' in window)) { toast('This browser does not support notifications.'); return }
    const p = await Notification.requestPermission()
    patchSettings({ notifications: p === 'granted' })
    toast(p === 'granted' ? 'Check-ins enabled while Carpe Diem is open.' : 'Notifications were not allowed.')
  }

  const download = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `carpe-diem-backup-${dayKey()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const upload = async (f: File | undefined) => {
    if (!f) return
    if (!confirm('Replace all current data with this backup?')) return
    const err = importJSON(await f.text())
    toast(err ?? 'Backup restored.')
  }

  const w = st.weights
  const setW = (k: keyof typeof w, v: number) => patchSettings({ weights: { ...w, [k]: Math.max(0, Math.min(100, v)) } })

  return (
    <div className="page narrow">
      <header className="page-head"><div><div className="eyebrow">Settings</div><h1 className="page-title">Make it yours</h1></div></header>

      <SyncPanel />

      <section className="card pad stack-12">
        <h2>Day shape</h2>
        <div className="row-3">
          <Field label="Day starts"><input className="input" type="time" value={st.dayStart} onChange={e => patchSettings({ dayStart: e.target.value })} /></Field>
          <Field label="Day ends"><input className="input" type="time" value={st.dayEnd} onChange={e => patchSettings({ dayEnd: e.target.value })} /></Field>
          <Field label="Evening shutdown"><input className="input" type="time" value={st.eveningAt} onChange={e => patchSettings({ eveningAt: e.target.value })} /></Field>
        </div>
        <Field label="Default focus length (min)"><div className="seg">{[25, 45, 50, 60, 90].map(m => <button key={m} className={st.defaultFocusMin === m ? 'on' : ''} onClick={() => patchSettings({ defaultFocusMin: m })}>{m}</button>)}</div></Field>
        <Field label="Theme"><div className="seg">{(['system', 'light', 'dark'] as const).map(t => <button key={t} className={st.theme === t ? 'on' : ''} onClick={() => patchSettings({ theme: t })}>{t[0].toUpperCase() + t.slice(1)}</button>)}</div></Field>
      </section>

      <section className="card pad stack-12">
        <h2>Daily routine</h2>
        <p className="note flush">Recurring blocks added to each new day’s plan. Family blocks silence the coach.</p>
        <div className="routine-list">
          {[...st.routine].sort((a, b) => a.start.localeCompare(b.start)).map(r => (
            <div key={r.id} className={`routine-row k-${r.kind}`}>
              <span className="routine-time">{clock(r.start)}–{clock(r.end)}</span>
              <span className="grow">{r.label}<small>{BLOCK_KINDS.find(k => k.id === r.kind)?.label} · {r.days.length === 7 ? 'Every day' : r.days.map(d => DAYS[d]).join(' ')}</small></span>
              <button className="icon-btn" onClick={() => patchSettings({ routine: st.routine.filter(x => x.id !== r.id) })} aria-label="Remove"><Icon name="x" size={14} /></button>
            </div>
          ))}
        </div>
        <div className="routine-form">
          <input className="input" value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} placeholder="Label, e.g. Standup" />
          <div className="row-3">
            <input className="input" type="time" value={draft.start} onChange={e => setDraft({ ...draft, start: e.target.value })} aria-label="Start" />
            <input className="input" type="time" value={draft.end} onChange={e => setDraft({ ...draft, end: e.target.value })} aria-label="End" />
            <select className="input" value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as BlockKind })}>{BLOCK_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
          </div>
          <div className="seg small">{DAYS.map((d, i) => <button key={i} className={draft.days.includes(i) ? 'on' : ''} onClick={() => setDraft({ ...draft, days: draft.days.includes(i) ? draft.days.filter(x => x !== i) : [...draft.days, i] })}>{d}</button>)}</div>
          <button className="secondary sm" onClick={() => {
            if (!draft.label.trim() || draft.end <= draft.start) { toast('Add a label and an end after the start.'); return }
            patchSettings({ routine: [...st.routine, { ...draft, id: uid(), label: draft.label.trim() }] })
            setDraft({ ...draft, label: '' })
          }}><Icon name="plus" size={14} /> Add to routine</button>
        </div>
      </section>

      <section className="card pad stack-12">
        <h2>Check-ins</h2>
        <p className="note flush">Nudges at block start, for missed blocks, after meetings and at evening shutdown. They fire while the app is open (installed or in a tab), never during family blocks or quiet hours.</p>
        <div className="actions">
          {st.notifications ? <button className="ghost" onClick={() => patchSettings({ notifications: false })}><Icon name="bell" size={15} /> Turn off notifications</button>
            : <button className="secondary" onClick={enableNotifications}><Icon name="bell" size={15} /> Enable notifications</button>}
        </div>
        <div className="row-2">
          <Field label="Quiet from"><input className="input" type="time" value={st.quietStart} onChange={e => patchSettings({ quietStart: e.target.value })} /></Field>
          <Field label="Quiet until"><input className="input" type="time" value={st.quietEnd} onChange={e => patchSettings({ quietEnd: e.target.value })} /></Field>
        </div>
      </section>

      <section className="card pad stack-12">
        <h2>Execution score weights</h2>
        <p className="note flush">Parts that don’t apply on a given day are skipped and the rest rescaled.</p>
        {([['outcomes', 'Outcomes delivered'], ['blocks', 'Focus blocks honored'], ['recovery', 'Recovery after interruptions'], ['goals', 'Progress on goals']] as const).map(([k, label]) => (
          <div key={k} className="weight-row"><span>{label}</span><input type="range" min={0} max={100} step={5} value={w[k]} onChange={e => setW(k, Number(e.target.value))} /><b>{w[k]}</b></div>
        ))}
      </section>

      <section className="card pad stack-12">
        <h2>Your data</h2>
        <p className="note flush">Your data is yours: no tracking, and it’s only synced to your own account when you sign in. A JSON backup is always a click away.</p>
        <div className="actions">
          <button className="secondary" onClick={download}><Icon name="download" size={15} /> Export backup</button>
          <button className="ghost" onClick={() => fileRef.current?.click()}><Icon name="upload" size={15} /> Restore backup</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => { upload(e.target.files?.[0]); e.target.value = '' }} />
          <span className="grow" />
          <button className="ghost danger" onClick={() => { if (confirm('Delete all Carpe Diem data? If you’re signed in, this also clears it on your other devices. This cannot be undone.')) { resetAll(); toast('All data reset.') } }}>Reset everything</button>
        </div>
      </section>
    </div>
  )
}
