import type { ChartSettings, TreeNode } from '../types'

export interface RowStyle {
  /** 背景(rgba) */
  bg: string
  /** 文字色。undefined なら変更しない */
  text?: string
}

/** 背景は薄く(濃い色でも文字が読めるように)重ねる */
const BG_ALPHA = 0.3
const MISSING_END_BG = 'rgba(221, 0, 0, 0.2)'

export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return `rgba(128, 128, 128, ${alpha})`
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`
}

/**
 * 行の色を決める。優先順位:
 * 1. 行の色ルール(上から順、最初に合致したもの)
 * 2. 「終了日が無い行を赤くする」
 * グループ行は対象外。
 */
export function resolveRowStyle(node: TreeNode, settings: ChartSettings): RowStyle | null {
  const issue = node.issue
  if (!issue) return null

  for (const rule of settings.rowColors) {
    const hit = rule.useClosed ? issue.status.is_closed === true : rule.statuses.includes(issue.status.name)
    if (hit) return { bg: hexToRgba(rule.bg, BG_ALPHA), text: rule.textColor || undefined }
  }
  if (settings.endDate.highlightMissing && node.endMissing) return { bg: MISSING_END_BG }
  return null
}
