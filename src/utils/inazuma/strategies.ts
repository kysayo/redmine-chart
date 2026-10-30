import type { GanttRow, InazumaStrategyId } from '../../types'

/**
 * イナズマ線の計算戦略。
 * 「どの行を線で結ぶか」「各行の基準線からのずれ(日数)をどう決めるか」を戦略として分離してあり、
 * 将来「グループ行も含める」「親は子の均等重みで集計する」などを追加するときは、
 * ここに戦略を足して STRATEGIES に登録し、InazumaStrategyId(types) と設定パネルの選択肢を増やす。
 */

export interface InazumaContext {
  /** 基準日の day number */
  baseDay: number
}

export interface InazumaPoint {
  /** rows 内のインデックス */
  rowIndex: number
  /** 基準線からのずれ(日)。負=遅れ(左)、正=前倒し(右) */
  offsetDays: number
}

export interface InazumaStrategy {
  id: InazumaStrategyId
  label: string
  computePoints(rows: GanttRow[], ctx: InazumaContext): InazumaPoint[]
}

/**
 * 1行の予定位置と実績位置の差(日)を求める。
 * バーは [start, end+1) 日の区間。予定位置 = 基準日の中央までの経過、実績位置 = 進捗率 × 期間。
 */
export function offsetForSchedule(start: number, end: number, progress: number, baseDay: number): number {
  const duration = Math.max(1, end - start + 1)
  const planned = Math.min(duration, Math.max(0, baseDay + 0.5 - start))
  const actual = (progress / 100) * duration
  return actual - planned
}

/** リーフチケット(子を持たない・日付がある)の行だけを結ぶ */
const leafOnly: InazumaStrategy = {
  id: 'leafOnly',
  label: 'リーフチケットのみ',
  computePoints(rows, ctx) {
    const points: InazumaPoint[] = []
    rows.forEach((row, rowIndex) => {
      const node = row.node
      if (node.kind !== 'issue' || row.hasChildren) return
      if (node.start == null || node.end == null) return
      points.push({
        rowIndex,
        offsetDays: offsetForSchedule(node.start, node.end, node.progress, ctx.baseDay),
      })
    })
    return points
  },
}

export const STRATEGIES: Record<InazumaStrategyId, InazumaStrategy> = {
  leafOnly,
}

export const STRATEGY_LIST: InazumaStrategy[] = Object.values(STRATEGIES)
