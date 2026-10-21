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

## Develop

```sh
npm install
npm run dev            # http://localhost:5173
npm run build          # type-check + production build into dist/
npx vite preview --port 4173 &
npm run test:e2e       # 19 browser checks covering the PRD's 7 critical journeys
```

## Deploy to Google Cloud

**Cloud Run** (container built by Cloud Build from the Dockerfile, nginx serving `dist/`):

```sh
gcloud auth login
./deploy.sh YOUR_PROJECT_ID us-central1
```

**Firebase Hosting** (alternative, static CDN):

```sh
npm run build && npx firebase-tools deploy --only hosting --project YOUR_PROJECT_ID
```

Data lives in each browser's local storage, so a public URL exposes no data. Use Settings → Export backup to move data between devices. Cross-device sync is a planned next step.

## Limits, stated honestly

- Check-in notifications fire while the app is open (tab or installed PWA); there is no server push yet.
- The timer can't verify you worked; the coach asks rather than assumes.
- Storage is localStorage (not IndexedDB) for now; backups are JSON.
- The v1 prototype's data (`carpe-diem-focus-guard-v1`) is imported automatically when served from the same origin.
