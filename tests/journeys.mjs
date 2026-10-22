// End-to-end checks of the PRD's critical user journeys against a running build.
// Usage: npm run build && npx vite preview --port 4173 & node tests/journeys.mjs
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:4173/'
const SHOTS = process.env.SHOTS
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) })
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, timezoneId: 'UTC', acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('dialog', d => d.accept())

let passed = 0
async function step(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${e.message.split('\n')[0]}`)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fail-${passed}.png`, fullPage: true })
    await browser.close()
    process.exit(1)
  }
}
const expectText = async (text, opts = {}) => page.getByText(text, opts).first().waitFor({ timeout: 4000 })
const shot = async name => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) }
const at = hhmm => new Date(`2026-10-22T${hhmm}:00Z`)

await page.clock.install({ time: at('07:30') })
await page.goto(URL)
await page.clock.resume()

console.log('Scenario 1: morning start')
await step('welcome explains the method and opens planning', async () => {
  await expectText('Don’t just plan your day')
  await page.locator('.dialog').getByRole('button', { name: /Plan today/ }).click()
  await expectText('Choose up to three outcomes')
})
await step('add three concrete outcomes and mark the frog', async () => {
  const add = async (title, next, done, goal, frog) => {
    await page.getByRole('button', { name: 'New outcome' }).click()
    await page.getByPlaceholder('e.g. Ship the review').fill(title)
    if (goal) await page.locator('.dialog select').first().selectOption({ label: goal })
    await page.getByPlaceholder('Open the PR and read').fill(next)
    await page.getByPlaceholder('An observable result').fill(done)
    if (frog) await page.locator('.check-row input').check()
    await page.locator('.dialog').getByRole('button', { name: 'Add', exact: true }).click()
  }
  await add('Design doc for agent memory', 'Open the doc and write the problem statement', 'Draft shared with the team', 'Contribute to GC AI agents', true)
  await add('Solve one LeetCode problem', 'Open today’s problem and write the approach', 'Accepted solution plus one lesson noted', 'Interview-ready: LeetCode + system design', false)
  await add('Pay Sobha installment', 'Open the SBI app', 'Payment confirmation saved', null, false)
  await expectText('Three is the limit')
  if (!(await page.locator('.frog-toggle.on').count())) throw new Error('no frog marked')
})
await step('routine was applied and outcomes auto-place frog first', async () => {
  await expectText('Workout')
  await page.getByRole('button', { name: /Auto-place outcomes/ }).click()
  await expectText(/Placed 3 blocks/)
  const labels = await page.locator('.block.k-focus .block-label').allInnerTexts()
  if (!labels[0].includes('Design doc')) throw new Error(`first focus block is ${labels[0]}`)
})
await step('commit with an if-then plan and land on Today', async () => {
  await page.getByRole('button', { name: 'I commit to this plan' }).click()
  await expectText('Your commitment:')
  await expectText('Design doc for agent memory')
  await shot('j1-today-planned')
})

console.log('Scenario 2: start, distraction, drift')
await step('start a 5-minute “just start” session', async () => {
  await page.getByRole('button', { name: 'Just 5 min' }).click()
  await page.locator('.dialog').getByRole('button', { name: /Start 5 min/ }).click()
  await expectText('Focusing', { exact: true })
})
await step('park a distraction with / without losing focus', async () => {
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('/')
  await page.keyboard.type('Look into a new agent framework')
  await page.keyboard.press('Enter')
  await expectText('1 parked')
  await expectText('Focusing', { exact: true })
})
await step('“I’m drifting” parks the pull and returns', async () => {
  await page.getByRole('button', { name: /I’m drifting/ }).click()
  await page.getByPlaceholder('A video, an email').fill('YouTube')
  await page.getByRole('button', { name: 'Park it & return' }).click()
  await expectText('2 parked')
})

console.log('Scenario 3: interruption and recovery')
await step('pause leaves a breadcrumb', async () => {
  await page.getByRole('button', { name: /Pause \/ interrupted/ }).click()
  await page.locator('.dialog textarea').fill('Write section 2: retrieval strategy')
  await page.locator('.dialog').getByRole('button', { name: /Pause/ }).click()
  await expectText('Resume here:')
  await expectText('Write section 2: retrieval strategy')
})
await step('state survives a refresh', async () => {
  await page.reload()
  await expectText('Resume here:')
})
await step('resume picks up the same session', async () => {
  await page.getByRole('button', { name: /Resume focus/ }).click()
  await page.locator('.dialog').getByRole('button', { name: /Start/ }).click()
  await expectText('Focusing', { exact: true })
})

console.log('Scenario 4: timer ends, transition gate')
await step('timer reaching zero asks, never auto-completes', async () => {
  await page.clock.fastForward('06:00')
  await expectText('Did you finish the outcome?')
  await page.getByRole('button', { name: /Made progress/ }).click()
  await page.locator('.dialog input').fill('Write section 3: eviction policy')
  await page.getByRole('button', { name: /Another block/ }).click()
  await page.locator('.dialog').getByRole('button', { name: '25 min', exact: true }).click()
  await page.locator('.dialog').getByRole('button', { name: /Start 25 min/ }).click()
  await expectText('Focusing', { exact: true })
})
await step('marking done shows what’s next', async () => {
  await page.locator('.focus').getByRole('button', { name: 'Done' }).click()
  await expectText(/Done\. Nicely handled|All three/)
  await page.getByRole('button', { name: /Start next/ }).click()
  await expectText('Start focus', { exact: false })
  await page.keyboard.press('Escape')
})

console.log('Scenario 5: avoidance and missed blocks')
await step('procrastination unpacker shrinks a task to 5 minutes', async () => {
  await page.getByRole('button', { name: 'What’s in the way?' }).first().click()
  await page.getByRole('button', { name: /It feels too big/ }).click()
  await page.locator('.dialog input').fill('Read the problem statement only')
  await page.getByRole('button', { name: /Do just that, 5 min/ }).click()
  await expectText('Focusing', { exact: true })
  await page.locator('.focus').getByRole('button', { name: /Switch/ }).click()
  await page.locator('.dialog').getByRole('button', { name: 'Take a break' }).click()
  await page.locator('.dialog').getByRole('button', { name: /Start break/ }).click()
  await expectText('On a break')
})
await step('a missed block surfaces with start / reschedule / release', async () => {
  await page.clock.fastForward('04:00:00')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const missed = page.locator('.coach-title', { hasText: /Missed|started .* min ago/ })
  if (!(await missed.count())) {
    await page.getByRole('button', { name: /more from your coach/ }).click().catch(() => {})
  }
  await page.locator('.coach-title', { hasText: /Missed|started .* min ago/ }).first().waitFor({ timeout: 4000 })
  await shot('j5-coach')
  const card = page.locator('.coach', { has: page.locator('.coach-title', { hasText: /Missed|started .* min ago/ }) }).first()
  await card.getByRole('button', { name: 'Reschedule' }).click()
  await expectText(/Moved to|No free slot/)
})

console.log('Scenario 5b: hour by hour')
await step('hourly sheet flags a past hour that didn’t go to plan', async () => {
  await page.locator('.sidebar').getByRole('button', { name: 'Hours' }).click()
  await expectText('Today, hour by hour')
  const row = page.locator('.hour-row', { hasText: 'Workout' }).first()
  await row.waitFor({ timeout: 4000 })
  if (!(await row.evaluate(el => el.classList.contains('st-needs-log')))) throw new Error('workout hour not flagged')
  await row.getByPlaceholder(/What did you do instead/).fill('Slept in, walked 20 min instead')
  await page.locator('.page-title').click()
  await page.waitForFunction(() => document.querySelector('.hour-row.st-logged'))
})
await step('write a plan line for an hour and tick it', async () => {
  const row = page.locator('.hour-row').filter({ has: page.getByLabel('Plan for 3pm', { exact: true }) })
  await row.getByLabel('Plan for 3pm', { exact: true }).fill('Call Mom')
  await row.getByLabel('Plan for 3pm', { exact: true }).press('Enter')
  await row.getByLabel('Done: plan for 3pm').check()
  await page.waitForFunction(() => [...document.querySelectorAll('.hour-row.st-done')].some(r => r.querySelector('.hour-time b')?.textContent === '3pm'))
  await page.reload()
  await page.locator('.hour-row').filter({ has: page.getByLabel('Plan for 3pm', { exact: true }) }).getByLabel('Plan for 3pm', { exact: true }).evaluate(el => { if (el.value !== 'Call Mom') throw new Error('plan not saved') })
  await shot('j5b-hours')
})

console.log('Scenario 6: evening review and tomorrow')
await step('review shows a transparent score and plan vs actual', async () => {
  await page.locator('.sidebar').getByRole('button', { name: 'Review' }).click()
  await expectText('Execution score')
  await expectText('Outcomes delivered')
  await expectText('Plan vs actual')
  await expectText(/planned hours went to plan/)
  const num = await page.locator('.score-big .num').innerText()
  if (!/^\d+$/.test(num)) throw new Error(`score is ${num}`)
  await shot('j6-review')
})
await step('shutdown leads to tomorrow’s plan with open loops to decide', async () => {
  await page.getByRole('button', { name: /Shutdown complete/ }).click()
  await expectText('Plan tomorrow')
  await expectText('Close open loops')
  await expectText('Look into a new agent framework')
})

console.log('Scenario 7: next day, nothing rolls forward silently')
await step('carrying forward counts a postponement', async () => {
  await page.clock.fastForward('14:00:00') // into the next day
  await page.reload()
  await page.locator('.sidebar').getByRole('button', { name: 'Plan' }).click()
  await page.locator('.page-head .seg').getByRole('button', { name: 'Today' }).click()
  await expectText('Close open loops')
  const row = page.locator('.loop-row', { hasText: 'Solve one LeetCode problem' })
  await row.getByRole('button', { name: /Carry to/ }).click()
  await expectText('postponed 1×')
})
await step('backup export downloads JSON', async () => {
  await page.locator('.sidebar').getByRole('button', { name: 'Settings' }).click()
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export backup/ }).click()])
  if (!dl.suggestedFilename().endsWith('.json')) throw new Error('bad filename')
})

console.log('Mobile layout')
await step('bottom nav and capture button on a phone', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.bottom-nav').getByRole('button', { name: 'Today' }).click()
  await page.locator('.fab').click()
  await page.locator('.dialog input').fill('Call the plumber')
  await page.locator('.dialog').getByRole('button', { name: 'Park' }).click()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  if (overflow) throw new Error('horizontal overflow on mobile')
  await shot('j8-mobile')
})

if (errors.length) { console.log('Page errors:\n' + errors.join('\n')); process.exit(1) }
console.log(`\nAll ${passed} checks passed.`)
await browser.close()
