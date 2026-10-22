// Cross-device sync checks against the Auth + Firestore emulators.
// Run with: npm run build:emulators && npm run test:sync
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4174
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-emu', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise(r => setTimeout(r, 2500))
const URL = `http://localhost:${PORT}/`
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) })

let passed = 0
async function done(code) { await browser.close(); server.kill(); process.exit(code) }
async function step(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.log(`  ✗ ${name}\n    ${e.message.split('\n')[0]}`); await done(1) }
}
async function device(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log(`    [${name} error] ${e.message}`))
  page.on('dialog', d => d.accept())
  await page.goto(URL)
  await page.getByRole('button', { name: 'Look around first' }).click()
  return { ctx, page }
}
const signIn = (page, email) => page.evaluate(([e]) => window.__cdTest.signIn(e, 'secret123'), [email])
const synced = page => page.locator('.sidebar .sync-badge.s-synced').waitFor({ timeout: 10000 })
const go = (page, label) => page.locator('.sidebar').getByRole('button', { name: label }).click()

const A = await device('laptop')
const B = await device('phone')
let uidA

await step('laptop signs in; its local data becomes the account’s data', async () => {
  await A.page.locator('.sidebar .sync-badge.s-signed-out').waitFor()
  uidA = await signIn(A.page, 'vishwas@example.com')
  await synced(A.page)
  await go(A.page, 'Plan')
  await A.page.getByPlaceholder('Anything on your mind…').fill('Synced item from laptop')
  await A.page.getByPlaceholder('Anything on your mind…').press('Enter')
  await A.page.waitForTimeout(800)
})

await step('phone signs in and follows the cloud, without duplicating seed data', async () => {
  await signIn(B.page, 'vishwas@example.com')
  await synced(B.page)
  await go(B.page, 'Plan')
  await B.page.getByText('Synced item from laptop').first().waitFor({ timeout: 8000 })
  const n = await B.page.locator('.bl-row', { hasText: 'Sobha payment to SBI' }).count()
  if (n !== 1) throw new Error(`expected the seed item once in the backlog, saw ${n}`)
})

await step('an outcome added on the phone appears on the laptop', async () => {
  await B.page.locator('.page-head .seg').getByRole('button', { name: 'Today' }).click()
  await B.page.getByRole('button', { name: 'With details…' }).click()
  await B.page.getByPlaceholder('e.g. Ship the review').fill('Outcome from phone')
  await B.page.getByPlaceholder('Open the PR and read').fill('Open the editor')
  await B.page.locator('.dialog').getByRole('button', { name: 'Add', exact: true }).click()
  await go(A.page, 'Today')
  await A.page.locator('.outcome-title', { hasText: 'Outcome from phone' }).waitFor({ timeout: 8000 })
})

await step('starting focus on the laptop shows the running timer on the phone', async () => {
  await A.page.getByRole('button', { name: 'Just 5 min' }).click()
  await A.page.locator('.dialog').getByRole('button', { name: /Start 5 min/ }).click()
  await go(B.page, 'Today')
  await B.page.getByText('Focusing', { exact: true }).first().waitFor({ timeout: 8000 })
})

await step('changes made offline sync when the connection returns', async () => {
  await A.ctx.setOffline(true)
  await go(A.page, 'Plan')
  await A.page.getByPlaceholder('Anything on your mind…').fill('Written while offline')
  await A.page.getByPlaceholder('Anything on your mind…').press('Enter')
  await A.page.getByText('Written while offline').first().waitFor()
  await A.ctx.setOffline(false)
  await go(B.page, 'Plan')
  await B.page.getByText('Written while offline').first().waitFor({ timeout: 15000 })
})

await step('another account cannot read this account’s data', async () => {
  const C = await device('stranger')
  await signIn(C.page, 'stranger@example.com')
  await synced(C.page)
  const own = await C.page.evaluate(async () => window.__cdTest.probe(`users/${(await window.__cdTest.signIn('stranger@example.com', 'secret123'))}`))
  const other = await C.page.evaluate(p => window.__cdTest.probe(p), `users/${uidA}`)
  const otherTask = await C.page.evaluate(p => window.__cdTest.probe(p), `users/${uidA}/tasks/x`)
  if (own !== 'allowed') throw new Error(`own data: ${own}`)
  if (other !== 'permission-denied' || otherTask !== 'permission-denied') throw new Error(`other user: ${other}, ${otherTask}`)
})

console.log(`\nAll ${passed} sync checks passed.`)
await done(0)
