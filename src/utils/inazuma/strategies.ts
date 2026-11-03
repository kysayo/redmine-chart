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
  /** ラベル行(グループ・ラベル扱いの親チケット)も結ぶ */
  includeLabels: boolean
  /** 「予定通り」とみなすステータス名 */
  onTrackStatuses: string[]
  /** 「予定通り」のステータスが期日を超えたときの遅れ(%) */
  onTrackLatePercent: number
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
 * 1行の、基準線からのずれ(日)を求める。負=遅れ(左)、正=前倒し(右)。
 * バーは [start, end+1) 日の区間。進捗の先端 = start + 進捗率 × 期間。基準日は日の中央(base + 0.5)で測る。
 *  - 未着手(基準日が開始日より前): 進捗した日数ぶんだけ右(0% なら基準線上)
 *  - 着手後: 進捗の先端と基準線の距離。期日を過ぎて未完了なら、先端が期日より左にあるぶん、
 *    基準線から大きく左に出る(遅れの大きさがそのまま見える)
 *  - 期日を過ぎて完了(進捗 100%): 基準線上(遅れではない)
 */
export function offsetForSchedule(start: number, end: number, progress: number, baseDay: number): number {
  const duration = Math.max(1, end - start + 1)
  const actual = (progress / 100) * duration
  const base = baseDay + 0.5
  if (base <= start) return actual
  if (progress >= 100 && base > end + 1) return 0
  return start + actual - base
}

/**
 * リーフチケット(子を持たない・日付がある)の行を結ぶ。
 * includeLabels のときは、ラベル行(配下のリーフの平均進捗)も結ぶ。バー付きの親チケットは結ばない。
 */
const leafOnly: InazumaStrategy = {
  id: 'leafOnly',
  label: 'リーフチケット中心',
  computePoints(rows, ctx) {
    const points: InazumaPoint[] = []
    rows.forEach((row, rowIndex) => {
      const node = row.node
      const target = row.isLabel ? ctx.includeLabels : node.kind === 'issue' && !row.hasChildren
      if (!target) return
      if (node.start == null || node.end == null) return
      let offsetDays: number
      if (node.endMissing) {
        // 終了日が無いチケットは、いつまでに終わる予定か分からないので、遅れ・前倒しを判定せず基準線上に置く
        offsetDays = 0
      } else if (!row.isLabel && node.issue && ctx.onTrackStatuses.includes(node.issue.status.name)) {
        // 「予定通り」のステータス: 期日(終了日)を超えていなければ予定通り(基準線上)。
        // 超えていれば、進捗が(100 - 遅れ)% のものとして、バーの先端の位置に遅れで出す
        const late = Math.min(100, Math.max(0, ctx.onTrackLatePercent))
        offsetDays =
          ctx.baseDay <= node.end ? 0 : offsetForSchedule(node.start, node.end, 100 - late, ctx.baseDay)
      } else {
        offsetDays = offsetForSchedule(node.start, node.end, row.progress, ctx.baseDay)
      }
      points.push({ rowIndex, offsetDays })
    })
    return points
  },
}

export const STRATEGIES: Record<InazumaStrategyId, InazumaStrategy> = {
  leafOnly,
}

export const STRATEGY_LIST: InazumaStrategy[] = Object.values(STRATEGIES)
