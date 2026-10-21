import {
  GoogleAuthProvider, createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut, type User,
} from 'firebase/auth'
import {
  collection, doc, getDoc, getDocFromServer, onSnapshot, writeBatch, type DocumentData, type Firestore, type Unsubscribe,
} from 'firebase/firestore'
import { useSyncExternalStore } from 'react'
import { firebase, firebaseConfigured, useEmulators } from './firebase'
import { DayLog, LOCAL_BACKUP_KEY, State, applyRemote, getState, setSyncHook, settleStaleTimer, update } from './store'

// Cloud layout, one document per entity so devices merge edits instead of overwriting each other:
//   users/{uid}                     meta: settings, timer, coach, onboarded
//   users/{uid}/{tasks|goals|blocks|sessions|parked}/{id}
//   users/{uid}/days/{YYYY-MM-DD}

const LISTS = ['tasks', 'goals', 'blocks', 'sessions', 'parked'] as const
type Meta = Pick<State, 'version' | 'settings' | 'timer' | 'coach' | 'onboarded'>

export type SyncStatus = 'off' | 'signed-out' | 'connecting' | 'synced' | 'pending' | 'offline' | 'error'
interface SyncState { status: SyncStatus; user: User | null; error: string }

let sync: SyncState = { status: firebaseConfigured ? 'connecting' : 'off', user: null, error: '' }
const listeners = new Set<() => void>()
function setSync(patch: Partial<SyncState>) {
  sync = { ...sync, ...patch }
  listeners.forEach(l => l())
}
export function useSync(): SyncState {
  return useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l) } }, () => sync)
}

const meta = (s: State): Meta => ({ version: s.version, settings: s.settings, timer: s.timer, coach: s.coach, onboarded: s.onboarded })
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Firestore batches allow 500 writes; split large uploads. */
async function commitOps(db: Firestore, ops: ((b: ReturnType<typeof writeBatch>) => void)[]) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db)
    ops.slice(i, i + 450).forEach(op => op(batch))
    await batch.commit()
  }
}

function diffOps(db: Firestore, uid: string, prev: State, next: State) {
  const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = []
  const root = doc(db, 'users', uid)
  if (!same(meta(prev), meta(next))) ops.push(b => b.set(root, meta(next)))
  for (const key of LISTS) {
    const before = new Map((prev[key] as { id: string }[]).map(x => [x.id, x]))
    const after = new Map((next[key] as { id: string }[]).map(x => [x.id, x]))
    for (const [id, item] of after) {
      if (!before.has(id) || !same(before.get(id), item)) ops.push(b => b.set(doc(root, key, id), item as DocumentData))
    }
    for (const id of before.keys()) if (!after.has(id)) ops.push(b => b.delete(doc(root, key, id)))
  }
  for (const [date, d] of Object.entries(next.days)) {
    if (!same(prev.days[date], d)) ops.push(b => b.set(doc(root, 'days', date), d as unknown as DocumentData))
  }
  for (const date of Object.keys(prev.days)) if (!next.days[date]) ops.push(b => b.delete(doc(root, 'days', date)))
  return ops
}

let unsubs: Unsubscribe[] = []

function stop() {
  unsubs.forEach(u => u())
  unsubs = []
  setSyncHook(null)
}

async function start(user: User) {
  const { db } = firebase()
  const uid = user.uid
  const root = doc(db, 'users', uid)
  setSync({ status: 'connecting', user, error: '' })

  const existing = await getDoc(root)
  if (!existing.exists()) {
    // First sign-in anywhere: this device's data becomes the account's data.
    const empty = { ...getState(), goals: [], tasks: [], blocks: [], sessions: [], parked: [], days: {} } as State
    await commitOps(db, diffOps(db, uid, { ...empty, settings: {} as State['settings'] }, getState()))
  } else {
    // The account already has data: keep a copy of this device's local data, then follow the cloud.
    try { localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(getState())) } catch { /* storage full */ }
  }

  setSyncHook((prev, next) => {
    commitOps(db, diffOps(db, uid, prev, next)).catch(e => setSync({ status: 'error', error: String(e?.message ?? e) }))
  })

  const loaded = new Set<string>()
  const pending = new Map<string, boolean>()
  const ready = () => {
    if (loaded.size < LISTS.length + 2) return
    const anyPending = [...pending.values()].some(Boolean)
    setSync({ status: !navigator.onLine ? 'offline' : anyPending ? 'pending' : 'synced' })
  }
  const settleOnce = () => {
    if (loaded.size === LISTS.length + 2 && !settled) { settled = true; update(s => settleStaleTimer(s)) }
  }
  let settled = false

  unsubs.push(onSnapshot(root, { includeMetadataChanges: true }, snap => {
    if (snap.exists()) {
      const m = snap.data() as Meta
      applyRemote({ settings: { ...getState().settings, ...m.settings }, timer: m.timer, coach: m.coach ?? {}, onboarded: m.onboarded })
    }
    loaded.add('meta'); pending.set('meta', snap.metadata.hasPendingWrites); ready(); settleOnce()
  }, e => setSync({ status: 'error', error: e.message })))

  for (const key of LISTS) {
    unsubs.push(onSnapshot(collection(root, key), { includeMetadataChanges: true }, snap => {
      applyRemote({ [key]: snap.docs.map(d => d.data()) } as Partial<State>)
      loaded.add(key); pending.set(key, snap.metadata.hasPendingWrites); ready(); settleOnce()
    }, e => setSync({ status: 'error', error: e.message })))
  }
  unsubs.push(onSnapshot(collection(root, 'days'), { includeMetadataChanges: true }, snap => {
    const days: Record<string, DayLog> = {}
    snap.docs.forEach(d => { days[d.id] = d.data() as DayLog })
    applyRemote({ days })
    loaded.add('days'); pending.set('days', snap.metadata.hasPendingWrites); ready(); settleOnce()
  }, e => setSync({ status: 'error', error: e.message })))
}

if (firebaseConfigured) {
  onAuthStateChanged(firebase().auth, user => {
    stop()
    if (user) start(user).catch(e => setSync({ status: 'error', user, error: String(e?.message ?? e) }))
    else setSync({ status: 'signed-out', user: null })
  })
  window.addEventListener('online', () => { if (sync.user) setSync({ status: 'pending' }) })
  window.addEventListener('offline', () => { if (sync.user) setSync({ status: 'offline' }) })
}

export async function signInGoogle() {
  await signInWithPopup(firebase().auth, new GoogleAuthProvider())
}

export async function signOutSync() {
  stop()
  await signOut(firebase().auth)
}

export const STATUS_LABEL: Record<SyncStatus, string> = {
  off: 'This device only',
  'signed-out': 'Not syncing',
  connecting: 'Connecting…',
  synced: 'Synced',
  pending: 'Saving…',
  offline: 'Offline · will sync',
  error: 'Sync error',
}

// Test hooks for the local emulators only: email sign-in and a raw read for checking security rules.
if (firebaseConfigured && useEmulators) {
  Object.assign(window, {
    __cdTest: {
      async signIn(email: string, password: string) {
        const { auth } = firebase()
        try { await signInWithEmailAndPassword(auth, email, password) } catch { await createUserWithEmailAndPassword(auth, email, password) }
        return auth.currentUser?.uid
      },
      async probe(path: string) {
        try { await getDocFromServer(doc(firebase().db, path)); return 'allowed' } catch (e) { return (e as { code?: string }).code ?? 'error' }
      },
    },
  })
}
