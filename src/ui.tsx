import { ReactNode, useEffect, useRef, useSyncExternalStore } from 'react'

// ---------- Icons (stroke icons in the Lucide style) ----------

const paths: Record<string, ReactNode> = {
  today: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  plan: <><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M8 2v4M16 2v4M3 10h18M8 14h3M8 17h6" /></>,
  goals: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></>,
  review: <><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  play: <path d="M7 4.5v15l12-7.5z" />,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  check: <path d="M4 12.5l5 5L20 6.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  switch: <><path d="M4 8h13l-3-3M20 16H7l3 3" /></>,
  coffee: <><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v2M12 3v2" /></>,
  inbox: <><path d="M3 13l3-8h12l3 8v6H3z" /><path d="M3 13h5l1 3h6l1-3h5" /></>,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  shrink: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  bell: <><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  flag: <><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></>,
  frog: <><circle cx="8" cy="8" r="2.5" /><circle cx="16" cy="8" r="2.5" /><path d="M4 14c0 4 3.6 6 8 6s8-2 8-6c0-2-1.5-3.5-4-4H8c-2.5.5-4 2-4 4z" /><path d="M9 15c1.8 1 4.2 1 6 0" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  upload: <path d="M12 20V9M7 14l5-5 5 5M5 4h14" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
}

export function Icon({ name, size = 18 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

// ---------- Modal host ----------

let modal: ReactNode = null
const modalListeners = new Set<() => void>()
export function openModal(node: ReactNode) { modal = node; modalListeners.forEach(l => l()) }
export function closeModal() { modal = null; modalListeners.forEach(l => l()) }
export function useModal() {
  return useSyncExternalStore(l => { modalListeners.add(l); return () => { modalListeners.delete(l) } }, () => modal)
}
export const isModalOpen = () => modal !== null

export function ModalHost() {
  const node = useModal()
  useEffect(() => {
    if (!node) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [node])
  if (!node) return null
  return (
    <div className="shade" onMouseDown={e => { if (e.target === e.currentTarget) closeModal() }}>
      {node}
    </div>
  )
}

export function Dialog({ eyebrow, title, sub, children, wide }: { eyebrow?: string; title: string; sub?: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[data-autofocus], input, textarea, select, button.primary')
    el?.focus()
  }, [])
  return (
    <section ref={ref} className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <button className="dialog-close" onClick={closeModal} aria-label="Close"><Icon name="x" size={16} /></button>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h2 className="dialog-title">{title}</h2>
      {sub && <p className="dialog-sub">{sub}</p>}
      <div className="dialog-body">{children}</div>
    </section>
  )
}

// ---------- Toast ----------

let toastMsg = ''
let toastId = 0
const toastListeners = new Set<() => void>()
export function toast(msg: string) {
  toastMsg = msg
  const id = ++toastId
  toastListeners.forEach(l => l())
  setTimeout(() => { if (id === toastId) { toastMsg = ''; toastListeners.forEach(l => l()) } }, 2800)
}
export function Toast() {
  const msg = useSyncExternalStore(l => { toastListeners.add(l); return () => { toastListeners.delete(l) } }, () => toastMsg)
  return <div className={`toast ${msg ? 'show' : ''}`} role="status" aria-live="polite">{msg}</div>
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Progress({ value, tone }: { value: number; tone?: string }) {
  return <div className={`bar ${tone ?? ''}`}><span style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} /></div>
}
