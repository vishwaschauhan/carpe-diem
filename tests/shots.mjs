import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
const out = process.argv[2]
const b = await chromium.launch({ executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined })
const errors = []
async function shoot(name, viewport, fn) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 1 })
  const p = await ctx.newPage()
  p.on('pageerror', e => errors.push(`${name}: ${e.message}`))
  p.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`) })
  await p.goto('http://localhost:4173/')
  await p.waitForTimeout(400)
  await fn(p)
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: true })
  await ctx.close()
}
await shoot('01-welcome', { width: 1360, height: 860 }, async () => {})
await shoot('02-today-empty', { width: 1360, height: 860 }, async p => { await p.click('text=Look around first') })
await shoot('03-plan', { width: 1360, height: 860 }, async p => { await p.click('.dialog >> text=Plan today'); await p.waitForTimeout(300) })
await shoot('04-mobile', { width: 390, height: 844 }, async p => { await p.click('text=Look around first') })
console.log(errors.join('\n') || 'no errors')
await b.close()
