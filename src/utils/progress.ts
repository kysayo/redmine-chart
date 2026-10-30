import type { RedmineIssue } from '../types'

/**
 * チケットの進捗率(0-100)を返す。チケット自身の進捗率(done_ratio)は使わない。
 * 1. ステータス名が statusProgress に割り当てられていればその値
 * 2. 未割当: 終了済み(closed_on あり)なら 100、それ以外は 0
 */
export function getIssueProgress(issue: RedmineIssue, statusProgress: Record<string, number>): number {
  const mapped = statusProgress[issue.status.name]
  if (typeof mapped === 'number' && Number.isFinite(mapped)) {
    return clampPercent(mapped)
  }
  return issue.closed_on ? 100 : 0
}

export function clampPercent(n: number): number {
  return Math.min(100, Math.max(0, n))
}
