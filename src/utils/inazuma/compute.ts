import { parseDay, todayDay } from '../dateUtils'
import type { InazumaPoint } from './strategies'

/** 基準日(設定が空なら今日)の day number */
export function resolveBaseDay(baseDate: string): number {
  return parseDay(baseDate) ?? todayDay()
}

/**
 * イナズマ線の SVG polyline 用 points 文字列を作る。
 * 上端の基準線 → 各行の実績位置 → 下端の基準線 の順に結ぶ。
 */
export function buildInazumaPolyline(
  points: InazumaPoint[],
  baseX: number,
  pxPerDay: number,
  rowCenterY: (rowIndex: number) => number,
  topY: number,
  bottomY: number,
): string {
  if (points.length === 0) return ''
  const coords: string[] = [`${baseX},${topY}`]
  for (const p of points) {
    coords.push(`${baseX + p.offsetDays * pxPerDay},${rowCenterY(p.rowIndex)}`)
  }
  coords.push(`${baseX},${bottomY}`)
  return coords.join(' ')
}
