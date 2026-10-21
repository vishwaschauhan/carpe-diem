import { useEffect, useRef, useState } from 'react'
import { coachInsights, inQuietHours } from './coach'
import { Nav, View } from './components/Coach'
import { DriftModal, TransitionModal } from './components/modals'
import { SyncBadge } from './components/SyncPanel'
import { breakOver, currentBlock, finishOnboarding, getState, hasSaveError, park, sessionTimeUp, timerElapsed, useStore, useTick } from './store'
import { countdown, dayKey } from './time'
import { Dialog, Icon, ModalHost, Toast, closeModal, isModalOpen, openModal, toast } from './ui'
import { Goals } from './views/Goals'
import { Plan } from './views/Plan'
import { Review } from './views/Review'
import { Settings } from './views/Settings'
import { Today } from './views/Today'


const NAV: { id: View; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'plan', label: 'Plan', icon: 'plan' },
  { id: 'goals', label: 'Goals', icon: 'goals' },
  { id: 'review', label: 'Review', icon: 'review' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

function viewFromHash(): View {
  const h = location.hash.replace('#', '') as View
  return NAV.some(n => n.id === h) ? h : 'today'
}

function CaptureModal() {
  const [text, setText] = useState('')
  return (
    <Dialog eyebrow="Quick capture" title="Park it, then go back" sub="It’s safe here. You’ll triage it at shutdown.">
      <form className="inline-form" onSubmit={e => { e.preventDefault(); if (text.trim()) { park(text.trim()); closeModal(); toast('Parked. Back to what matters.') } }}>
        <input className="input" data-autofocus value={text} onChange={e => setText(e.target.value)} placeholder="An idea, urge, or to-do…" />
        <button className="primary" type="submit">Park</button>
      </form>
    </Dialog>
  )
}

function Welcome({ nav }: { nav: Nav }) {
  return (
    <Dialog eyebrow="Welcome to Carpe Diem" title="Don’t just plan your day. Live the day you planned." wide>
      <div className="welcome">
        <div><span className="step-num">1</span><b>Plan tonight</b><p>Pick at most three outcomes, mark the frog, and give each a time. Commit with an if-then plan.</p></div>
        <div><span className="step-num">2</span><b>Do one thing</b><p>Start with the smallest step. Park distractions, leave breadcrumbs when interrupted, switch only on purpose.</p></div>
        <div><span className="step-num">3</span><b>Review honestly</b><p>A score built on commitments kept, not hours logged. Close loops, then plan tomorrow.</p></div>
      </div>
      <p className="note">Stuck? Tap “What’s in the way?” and the app helps you find the next small move. To sync your phone and laptop, sign in under Settings.</p>
      <div className="actions"><span className="grow" />
        <button className="ghost" onClick={() => { finishOnboarding(); closeModal() }}>Look around first</button>
        <button className="primary" onClick={() => { finishOnboarding(); closeModal(); nav('plan', { planDate: dayKey() }) }}>Plan today <Icon name="arrow" size={15} /></button>
      </div>
    </Dialog>
  )
}

export default function App() {
  const s = useStore()
  useTick()
  const [view, setView] = useState<View>(viewFromHash)
  const [planDate, setPlanDate] = useState(() => {
    const h = new Date().getHours()
    return h >= 17 ? dayKey(new Date(Date.now() + 86_400_000)) : dayKey()
  })
  const [immersive, setImmersive] = useState(false)
  const notified = useRef(new Set<string>())

  const nav: Nav = (v, opts) => {
    if (opts?.planDate) setPlanDate(opts.planDate)
    setView(v)
    setImmersive(false)
    if (location.hash !== `#${v}`) history.pushState(null, '', `#${v}`)
    window.scrollTo({ top: 0 })
  }

  useEffect(() => {
    const onPop = () => setView(viewFromHash())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Theme
  useEffect(() => {
    const root = document.documentElement
    if (s.settings.theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', s.settings.theme)
  }, [s.settings.theme])

  // First run and a session that ended while the app was closed.
  useEffect(() => {
    if (!getState().onboarded) openModal(<Welcome nav={nav} />)
    else if (getState().timer.mode === 'transition') openModal(<TransitionModal />)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clock: end focus blocks and breaks from timestamps, so refreshes and sleeps are safe.
  const t = s.timer
  const now = Date.now()
  useEffect(() => {
    const notify = (title: string, body: string, tag: string) => {
      const st = getState().settings
      if (!st.notifications || !('Notification' in window) || Notification.permission !== 'granted') return
      if (inQuietHours(getState())) return
      if (currentBlock(getState())?.kind === 'family') return
      if (!document.hidden) return
      try { new Notification(title, { body, tag, icon: './icon-192.png' }) } catch { /* some platforms need a service worker */ }
    }
    if (t.mode === 'focus' && t.plannedMs - timerElapsed(t, now) <= 0) {
      sessionTimeUp()
      notify('Focus block complete', 'Did you finish the outcome? Decide the next move.', 'session')
      if (!isModalOpen()) openModal(<TransitionModal />)
    } else if (t.mode === 'break' && t.breakEnd && t.breakEnd <= now) {
      breakOver()
      notify('Break’s over', 'Your next action is waiting.', 'break')
      if (!isModalOpen()) openModal(<TransitionModal />)
    }
    // Coach check-ins every 30 seconds
    if (Math.floor(now / 1000) % 30 === 0) {
      for (const i of coachInsights(getState()).filter(i => i.notify)) {
        if (notified.current.has(i.id)) continue
        notified.current.add(i.id)
        notify(i.title, i.body, i.id)
      }
    }
  })

  // Tab title shows the live timer.
  useEffect(() => {
    const task = s.tasks.find(x => x.id === t.taskId)
    if (t.mode === 'focus' && task) document.title = `${countdown(t.plannedMs - timerElapsed(t))} · ${task.title}`
    else if (t.mode === 'break') document.title = `Break ${countdown((t.breakEnd ?? 0) - Date.now())} · Carpe Diem`
    else if (t.mode === 'paused') document.title = `Paused · ${task?.title ?? 'Carpe Diem'}`
    else document.title = 'Carpe Diem'
  })

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (e.metaKey || e.ctrlKey || e.altKey || isModalOpen() || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag ?? '')) return
      if (e.key === '/') {
        e.preventDefault()
        const input = document.getElementById('capture-input') as HTMLInputElement | null
        if (input) input.focus()
        else openModal(<CaptureModal />)
      } else if (e.key === 'f') setImmersive(v => !v)
      else if (e.key === 'd' && getState().timer.mode === 'focus') openModal(<DriftModal />)
      else if (e.key === 'Escape') setImmersive(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const activeTask = s.tasks.find(x => x.id === t.taskId)
  const showMini = view !== 'today' && (t.mode === 'focus' || t.mode === 'paused' || t.mode === 'break') && activeTask

  return (
    <div className={`app ${immersive ? 'is-immersive' : ''}`}>
      <aside className="sidebar">
        <div className="brand"><span className="logo"><Icon name="today" size={20} /></span><span>carpe diem<span className="brand-dot">.</span></span></div>
        <nav>
          {NAV.map(n => (
            <button key={n.id} className={`nav-item ${view === n.id ? 'on' : ''}`} onClick={() => nav(n.id, n.id === 'plan' ? { planDate } : undefined)} aria-current={view === n.id ? 'page' : undefined}>
              <Icon name={n.icon} size={18} /> {n.label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <div className="kbd-hints"><span><kbd>/</kbd> park a thought</span><span><kbd>F</kbd> focus mode</span><span><kbd>D</kbd> I’m drifting</span></div>
          <SyncBadge />
          <div className="privacy"><Icon name="shield" size={13} /> Private · only you can see your data</div>
        </div>
      </aside>

      <main className="main">
        {hasSaveError() && <div className="save-error">Couldn’t save to this browser’s storage. Export a backup from Settings.</div>}
        {showMini && (
          <button className="mini-timer" onClick={() => nav('today')}>
            <span className={`dot ${t.mode}`} /> {t.mode === 'break' ? 'Break' : activeTask!.title}
            <b>{t.mode === 'break' ? countdown((t.breakEnd ?? 0) - Date.now()) : t.mode === 'paused' ? 'Paused' : countdown(t.plannedMs - timerElapsed(t))}</b>
          </button>
        )}
        {view === 'today' && <Today s={s} nav={nav} immersive={immersive} setImmersive={setImmersive} />}
        {view === 'plan' && <Plan s={s} date={planDate} setDate={setPlanDate} nav={nav} />}
        {view === 'goals' && <Goals s={s} />}
        {view === 'review' && <Review s={s} nav={nav} />}
        {view === 'settings' && <Settings s={s} />}
      </main>

      <button className="fab" onClick={() => openModal(<CaptureModal />)} aria-label="Quick capture"><Icon name="plus" size={22} /></button>

      <nav className="bottom-nav">
        {NAV.filter(n => n.id !== 'settings').map(n => (
          <button key={n.id} className={view === n.id ? 'on' : ''} onClick={() => nav(n.id, n.id === 'plan' ? { planDate } : undefined)}>
            <Icon name={n.icon} size={20} /><span>{n.label}</span>
          </button>
        ))}
        <button className={view === 'settings' ? 'on' : ''} onClick={() => nav('settings')}><Icon name="settings" size={20} /><span>More</span></button>
      </nav>

      <ModalHost />
      <Toast />
    </div>
  )
}
