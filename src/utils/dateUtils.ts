// 日付は「1970-01-01 からの経過日数(day number)」の整数で扱う。タイムゾーンずれを避けるため。

export const MS_DAY = 86400000

/** 'YYYY-MM-DD' → day number。不正・空は null */
export function parseDay(s: string | null | undefined): number | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (!m) return null
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_DAY)
}

function dayToUtcDate(n: number): Date {
  return new Date(n * MS_DAY)
}

export function formatDay(n: number): string {
  const d = dayToUtcDate(n)
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${mm}-${dd}`
}

/** ローカル(ブラウザ)の今日 */
export function todayDay(): number {
  const now = new Date()
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / MS_DAY)
}

/** 0=日 … 6=土 */
export function dayOfWeek(n: number): number {
  return dayToUtcDate(n).getUTCDay()
}

export function dayParts(n: number): { y: number; m: number; d: number } {
  const d = dayToUtcDate(n)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }
}

/** その日が属する月の 1 日の day number */
export function monthStart(n: number): number {
  const { y, m } = dayParts(n)
  return Math.floor(Date.UTC(y, m - 1, 1) / MS_DAY)
}

/** ISO日時文字列(UTC) → ローカル日付の 'YYYY-MM-DD' */
export function isoToLocalDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}
