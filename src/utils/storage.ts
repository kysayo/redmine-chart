import type { ChartSettings } from '../types'
import { buildDefaultSettings, mergePreset } from './config'
import { getProjectId } from './urlParser'

function buildStorageKey(): string {
  return `redmine-chart:settings:${getProjectId() || 'all'}`
}

/** 保存済み設定を読む。無ければ null。足りない項目は既定値で補う */
export function loadSettings(): ChartSettings | null {
  try {
    const raw = localStorage.getItem(buildStorageKey())
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ChartSettings>
    return mergePreset(buildDefaultSettings(), parsed, parsed.appliedTeamPreset)
  } catch {
    return null
  }
}

export function saveSettings(settings: ChartSettings): void {
  try {
    localStorage.setItem(buildStorageKey(), JSON.stringify(settings))
  } catch {
    // 保存できなくても動作は継続する
  }
}
