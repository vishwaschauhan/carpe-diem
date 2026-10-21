import { useState } from 'react'
import { STATUS_LABEL, signInGoogle, signOutSync, useSync } from '../sync'
import { Icon, toast } from '../ui'

export function SyncBadge() {
  const { status, user } = useSync()
  if (status === 'off') return null
  return (
    <div className={`sync-badge s-${status}`} title={user?.email ?? undefined}>
      <span className="dot" /> {STATUS_LABEL[status]}
    </div>
  )
}

export function SyncPanel() {
  const { status, user, error } = useSync()
  const [busy, setBusy] = useState(false)
  const signIn = async () => {
    setBusy(true)
    try { await signInGoogle(); toast('Signed in. Your plan now follows you across devices.') }
    catch (e) { const code = (e as { code?: string }).code; if (code !== 'auth/popup-closed-by-user') toast('Sign-in failed. Try again.') }
    finally { setBusy(false) }
  }
  if (status === 'off') {
    return (
      <section className="card pad stack-12">
        <h2>Sync across devices</h2>
        <p className="note flush">Sync isn’t set up in this build, so data stays on this device. Use Export backup to move it.</p>
      </section>
    )
  }
  return (
    <section className="card pad stack-12">
      <div className="card-head flush"><h2>Sync across devices</h2><SyncBadge /></div>
      {user ? <>
        <p className="note flush">Signed in as <b>{user.email ?? user.displayName}</b>. Plans, focus sessions and the running timer stay in step on every device you sign in on, and work offline.</p>
        {error && <p className="hint-box warn">{error}</p>}
        <div className="actions"><span className="grow" /><button className="ghost" onClick={() => signOutSync().then(() => toast('Signed out. This device keeps a local copy.'))}>Sign out</button></div>
      </> : <>
        <p className="note flush">Sign in to keep your phone and laptop in sync. The first device you sign in on uploads its data; other devices then follow your account.</p>
        <div className="actions"><button className="primary" disabled={busy} onClick={signIn}><Icon name="shield" size={15} /> Sign in with Google</button></div>
      </>}
    </section>
  )
}
