// Date and time helpers. Days are local-calendar strings (YYYY-MM-DD) and
// block times are local "HH:MM" strings, so plans survive time zone changes.

export const MIN = 60_000

export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d + n))
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function fromMin(min: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function nowMin(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

/** Timestamp for a local HH:MM on a given day. */
export function stampAt(day: string, hhmm: string): number {
  const d = parseDay(day)
  const mins = toMin(hhmm)
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
  return d.getTime()
}

export function minutesOfStamp(ts: number): number {
  const d = new Date(ts)
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

export function clock(hhmm: string): string {
  const mins = toMin(hhmm)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

export function clockOf(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function countdown(ms: number): string {
  const secs = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function duration(mins: number): string {
  const m = Math.round(mins)
  if (m < 60) return `${m}m`
  return m % 60 === 0 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 60)}h ${m % 60}m`
}

export function longDate(key: string): string {
  return parseDay(key).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}

export function shortDate(key: string): string {
  return parseDay(key).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

export function relativeDay(key: string, today = dayKey()): string {
  if (key === today) return 'Today'
  if (key === addDays(today, 1)) return 'Tomorrow'
  if (key === addDays(today, -1)) return 'Yesterday'
  return shortDate(key)
}

/** Monday of the week containing `key`. */
export function weekStart(key: string): string {
  const d = parseDay(key)
  const offset = (d.getDay() + 6) % 7
  return addDays(key, -offset)
}

export function greeting(d = new Date()): string {
  const h = d.getHours()
  if (h < 5) return 'Up early. Make it count.'
  if (h < 12) return 'Good morning. Let’s make today count.'
  if (h < 17) return 'Good afternoon. Protect what matters.'
  if (h < 21) return 'Good evening. Finish well.'
  return 'Wind down. Tomorrow starts tonight.'
}
