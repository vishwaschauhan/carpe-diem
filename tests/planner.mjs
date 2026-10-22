// Checks the visual day planner on the Plan page: drag, click-to-schedule, overlap rules,
// several sessions per task, move, resize, remove, persistence, and the hand-off to Today.
// Usage: npm run build && npx vite preview --port 4173 & node tests/planner.mjs
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:4173/'
const SHOTS = process.env.SHOTS
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) })
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, timezoneId: 'UTC' })
let page = await ctx.newPage()
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
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/planner-fail-${passed}.png`, fullPage: true })
    await browser.close()
    process.exit(1)
  }
}
const expectText = async (text, opts = {}) => page.getByText(text, opts).first().waitFor({ timeout: 4000 })
const shot = async name => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) }
const card = title => page.locator('.tcard', { hasText: title })
const block = text => page.locator('.pblock:not(.ghost)', { hasText: text })

/** Viewport coordinates of a time on the day grid, scrolling it into view first. */
async function slot(min, xFrac = 0.5) {
  await page.evaluate(m => {
    const g = document.querySelector('.pgrid')
    const sc = document.querySelector('.grid-scroll')
    const y = (m - Number(g.dataset.from)) * Number(g.dataset.px)
    if (sc.scrollHeight > sc.clientHeight) sc.scrollTop = Math.max(0, y - sc.clientHeight / 2)
    else window.scrollTo(0, g.getBoundingClientRect().top + window.scrollY + y - window.innerHeight / 2)
  }, min)
  const box = await page.locator('.pgrid').boundingBox()
  const { from, px } = await page.locator('.pgrid').evaluate(g => ({ from: Number(g.dataset.from), px: Number(g.dataset.px) }))
  return { x: box.x + box.width * xFrac, y: box.y + (min - from) * px + 4 }
}
async function drag(locator, to) {
  const b = await locator.boundingBox()
  await page.mouse.move(b.x + 30, b.y + 12)
  await page.mouse.down()
  await page.mouse.move(b.x + 60, b.y + 40, { steps: 4 })
  const p = await to()
  await page.mouse.move(p.x, p.y, { steps: 8 })
  await page.mouse.up()
}
const H = h => h * 60

await page.clock.install({ time: new Date('2026-10-22T08:00:00Z') })
await page.goto(URL)
await page.clock.resume()
await page.getByRole('button', { name: 'Look around first' }).click()
await page.locator('.sidebar').getByRole('button', { name: 'Plan' }).click()

console.log('Planner: see the day, choose, place')
await step('the Plan page shows the whole day hour by hour with free time marked', async () => {
  await expectText('Place work on the calendar')
  await expectText('Workout')
  await page.locator('.hour-line', { hasText: '9am' }).waitFor()
  await page.locator('.free-band').first().waitFor()
  await page.locator('.now-line').waitFor()
})
await step('add a priority in one line and set its estimate', async () => {
  await page.getByLabel('New outcome').fill('Study AI architecture')
  await page.getByLabel('New outcome').press('Enter')
  await page.getByLabel('Estimate for Study AI architecture').selectOption('180')
  await card('Study AI architecture').getByText('3h left').waitFor()
})
await step('click a free slot to add a meeting', async () => {
  const p = await slot(H(10))
  await page.mouse.click(p.x, p.y)
  await page.locator('.pop.quick').getByRole('button', { name: '1h', exact: true }).click()
  await page.getByLabel('Block label').fill('Team sync')
  await page.locator('.pop.quick').getByRole('button', { name: 'Meeting' }).click()
  await block('Team sync').getByText('10am–11am').waitFor()
})
await step('drag a task from the tray onto free time; back-to-back is allowed', async () => {
  await drag(card('Study AI architecture'), () => slot(H(8.5)))
  await block('Study AI architecture').getByText('8:30am–10am').waitFor()
  await card('Study AI architecture').getByText('1h 30m left').waitFor()
})
await step('dropping onto a meeting is refused and the nearest free time is offered', async () => {
  await drag(card('Study AI architecture'), () => slot(H(10.25)))
  await page.locator('.pop.conflict').getByText(/overlaps “Team sync”/).waitFor()
  await shot('planner-conflict')
  await page.getByRole('button', { name: 'Use 11am instead' }).click()
  await block('Study AI architecture').getByText('11am–12:30pm').waitFor()
  await card('Study AI architecture').getByText(/Fully scheduled/).waitFor()
  if ((await page.locator('.tcard').count()) !== 1) throw new Error('a second session created a duplicate task')
})
await step('drag a session to move it', async () => {
  const b = block('11am–12:30pm')
  const box = await b.boundingBox()
  await page.mouse.move(box.x + 40, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + 40, box.y + 20 + 60 * 1.2, { steps: 8 })
  await page.mouse.up()
  await block('Study AI architecture').getByText('12pm–1:30pm').waitFor()
})
await step('moving a session into a meeting is blocked', async () => {
  const b = block('8:30am–10am')
  const box = await b.boundingBox()
  await page.mouse.move(box.x + 40, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + 40, box.y + 20 + 30 * 1.2, { steps: 8 })
  await page.mouse.up()
  await page.locator('.pop.conflict').waitFor()
  await page.locator('.pop.conflict').getByRole('button', { name: 'Cancel' }).click()
  await block('8:30am–10am').waitFor()
  const overlaps = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('carpe-diem-v2'))
    const m = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
    const bs = s.blocks.filter(b => b.date === '2026-10-22' && !b.decision && !b.shared)
    return bs.filter((a, i) => bs.some((b, j) => i !== j && m(a.start) < m(b.end) && m(b.start) < m(a.end))).length
  })
  if (overlaps) throw new Error(`${overlaps} overlapping blocks stored`)
})
await step('resize a session from its bottom edge', async () => {
  const rz = block('12pm–1:30pm').locator('.rz')
  const box = await rz.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 4)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + 4 - 30 * 1.2, { steps: 6 })
  await page.mouse.up()
  await block('Study AI architecture').getByText('12pm–1pm').waitFor()
  await card('Study AI architecture').getByText('30m left').waitFor()
})
await step('“+ Session” adds another session to the same task', async () => {
  await card('Study AI architecture').getByRole('button', { name: 'Session' }).click()
  await card('Study AI architecture').getByText(/Fully scheduled/).waitFor()
  const n = await card('Study AI architecture').locator('.sess').count()
  if (n !== 3) throw new Error(`expected 3 sessions on the card, saw ${n}`)
  await shot('planner-sessions')
})
await step('remove one session from its popover', async () => {
  await block('11:05am–11:35am').click()
  await page.locator('.pop.edit').getByRole('button', { name: 'Remove' }).click()
  await card('Study AI architecture').getByText('30m left').waitFor()
})
await step('capacity summary and suggestions reflect the plan', async () => {
  await page.locator('.capacity').getByText('free').waitFor()
  await expectText(/scheduled 2h 30m of the 3h estimated/)
  await page.locator('.sug').getByRole('button', { name: 'Find free time' }).click()
  await card('Study AI architecture').getByText(/Fully scheduled/).waitFor()
})
await step('the plan survives a refresh and shows on Today', async () => {
  await page.reload()
  await block('Team sync').waitFor()
  await page.locator('.sidebar').getByRole('button', { name: 'Today' }).click()
  await expectText('Team sync')
  await page.locator('.block', { hasText: 'Study AI architecture' }).first().waitFor()
})
await step('Start day goes straight to the next commitment', async () => {
  await page.locator('.sidebar').getByRole('button', { name: 'Plan' }).click()
  await page.getByRole('button', { name: /Start day/ }).click()
  await page.locator('.focus-title', { hasText: 'Study AI architecture' }).waitFor()
})

console.log('Planner on a phone')
await step('tap a task, then tap a slot, to schedule it', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.bottom-nav').getByRole('button', { name: 'Plan' }).click()
  await page.locator('.page-head .seg').getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByLabel('New outcome').fill('Write the blog post')
  await page.getByLabel('New outcome').press('Enter')
  await card('Write the blog post').getByRole('button', { name: 'Place' }).click()
  await expectText('Tap a free slot to place')
  const p = await slot(H(14))
  await page.mouse.click(p.x, p.y)
  await block('Write the blog post').getByText('2pm–3pm').waitFor()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  if (overflow) throw new Error('horizontal overflow on mobile')
  await shot('planner-mobile')
})

if (errors.length) { console.log('Page errors:\n' + errors.join('\n')); process.exit(1) }
console.log(`\nAll ${passed} planner checks passed.`)
await browser.close()
