import type { RedmineIssue } from '../types'

/**
 * チケットの進捗率(0-100)を返す。
 * 1. ステータス名が statusProgress に割り当てられていればその値
 * 2. 未割当: 終了済み(closed_on あり)なら 100、それ以外はチケットの done_ratio
 */
export function getIssueProgress(issue: RedmineIssue, statusProgress: Record<string, number>): number {
  const mapped = statusProgress[issue.status.name]
  if (typeof mapped === 'number' && Number.isFinite(mapped)) {
    return clampPercent(mapped)
  }
  if (issue.closed_on) return 100
  return clampPercent(issue.done_ratio ?? 0)
}

export function clampPercent(n: number): number {
  return Math.min(100, Math.max(0, n))
}
