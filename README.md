# Carpe Diem v2

Plan tonight. Execute tomorrow. A private, local-first execution and accountability app (installable PWA).

## The method (and where it comes from)

| In the app | Research it rests on |
|---|---|
| Max three outcomes a day, one marked as **the frog** that goes first | Brian Tracy, *Eat That Frog*; Burkeman, *Four Thousand Weeks* (limit work in progress) |
| Every outcome gets a **time block**; plan-realism check against free time | Cal Newport, *Deep Work* / time-block planning |
| **Commit** with an if-then plan ("When I sit down at 7:35, I will start X") | Gollwitzer's implementation intentions (large effect on follow-through) |
| **First physical action** and **done when** on every outcome | David Allen, *Getting Things Done* |
| **Just 5 minutes** start, and **"What's in the way?"** unpacker (unclear / too big / boring / anxious / tired / not important) | Pychyl, *Solving the Procrastination Puzzle*; Steel, *The Procrastination Equation* |
| Distraction **parking lot**, "I'm drifting", intentional switching | Attention-residue research (Leroy); Zeigarnik effect |
| Pause **breadcrumbs** and a transition gate after every session, break and meeting | Interruption-recovery research (Mark, Gonzalez) |
| Nightly **shutdown ritual**: close loops, nothing rolls forward silently | Newport's shutdown ritual |
| Execution score from commitments kept, not hours logged; self-compassionate tone | Drucker's "know thy time"; Wohl et al. on self-forgiveness reducing procrastination |

## Screens

- **Today**: the one thing to do now, a timer, your three outcomes, the schedule (plan vs actual, with unplanned log), the parking lot and a coach card.
- **Plan**: close open loops, choose up to three outcomes, give each a time (routine + auto-place), commit. Brain dump with Gold/Silver.
- **Goals**: why each goal matters, current milestone, weekly focus vs target.
- **Review**: transparent score breakdown, wins vs needs-attention, plan vs actual, reflection, suggested takeaway, 14-day history, then shutdown → plan tomorrow.
- **Settings**: day shape, daily routine, check-in notifications and quiet hours, score weights, backup export/import.

Shortcuts: `/` park a thought, `F` focus mode, `D` I'm drifting.

## Sync across devices

Same setup as VishwarimaOS: **Firebase Authentication** (Google sign-in), **Cloud Firestore** with an offline cache, and **Firebase Hosting**, all on the free Spark plan.

- Signed out, the app works fully on one device (local storage).
- Sign in under **Settings → Sync across devices**. The first device to sign in uploads its data; every other device then follows the account. That device's previous local data is kept in `localStorage["carpe-diem-v2-before-sync"]`.
- Data lives at `users/{uid}/...`, one document per task, goal, block, session, parked thought and day, so edits from two devices merge instead of overwriting each other. Settings and the running timer live on `users/{uid}`, so a session started on the laptop shows on the phone.
- `firestore.rules` lets only the signed-in owner read or write their own data.

## Develop

```sh
npm install
cp .env.example .env.local     # fill in the Firebase web config, or leave empty for local-only
npm run dev                    # http://localhost:5173
```

### Checks

```sh
npm run build
npx vite preview --port 4173 & npm run test:e2e        # 19 checks: the PRD's 7 critical journeys
npm run build:emulators && npm run test:sync           # 6 checks: two devices, offline, security rules
```

`test:sync` needs Java 21+ for the Firestore emulator.

## Deploy

One-time setup:

1. Firebase console: create the project, enable **Authentication → Google**, create **Firestore** (production mode).
2. Put the web app config in `.env.production` (not secret) and the project id in `.firebaserc`.
3. `npx firebase login && npm run deploy` deploys Hosting, rules and indexes.

### Automatic deploys

`.github/workflows/ci.yml` runs both test suites on every push and PR, and deploys on merge to `main`.
Add a repository secret `FIREBASE_SERVICE_ACCOUNT` containing a service-account JSON key with the
**Firebase Hosting Admin** and **Firebase Rules Admin** roles (Google Cloud console → IAM → Service accounts).
Without it, the deploy step is skipped with a warning.

## Limits, stated honestly

- Check-in notifications fire while the app is open (tab or installed PWA); there is no server push.
- The timer can't verify you worked; the coach asks rather than assumes.
- Conflicts resolve per item, last write wins. Editing the same task on two devices at the same moment keeps the later edit.
- The v1 prototype's data (`carpe-diem-focus-guard-v1`) is imported automatically when served from the same origin.
