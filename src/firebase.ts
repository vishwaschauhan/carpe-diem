import { initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import {
  connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore,
} from 'firebase/firestore'

const env = import.meta.env
export const useEmulators = env.VITE_USE_EMULATORS === 'true'

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || (useEmulators ? 'demo-key' : undefined),
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID || (useEmulators ? 'demo-carpe-diem' : undefined),
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

/** False until the Firebase web config is supplied; the app then runs local-only. */
export const firebaseConfigured = Boolean(config.apiKey && config.projectId)

let app: FirebaseApp | undefined
let auth: Auth | undefined
let db: Firestore | undefined

if (firebaseConfigured) {
  app = initializeApp(config)
  auth = getAuth(app)
  // Persistent cache keeps the app usable offline; writes stay pending until the server acknowledges them.
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  if (useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }
}

export function firebase(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (!app || !auth || !db) throw new Error('Firebase is not configured')
  return { app, auth, db }
}
