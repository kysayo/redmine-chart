import type { ChartSettings, PresetSettings, TeamPreset } from '../types'

/** 既定の設定。階層は「子チケット」のみ(親子ツリー) */
export function buildDefaultSettings(): ChartSettings {
  return {
    version: 1,
    levels: [{ id: 'lv-1', type: 'children' }],
    groupings: [],
    columns: ['status', 'assigned_to', 'start_date', 'due_date'],
    statusProgress: {},
    inazuma: { enabled: true, strategy: 'leafOnly', baseDate: '' },
    range: { mode: 'auto', beforeDays: 30, afterDays: 90, startDate: '', endDate: '' },
    scale: 'day',
  }
}

/** プリセット(一部の項目だけでも可)を既定値に重ねて完全な設定にする */
export function mergePreset(base: ChartSettings, preset: Partial<PresetSettings>, presetName?: string): ChartSettings {
  return {
    ...base,
    ...preset,
    inazuma: { ...base.inazuma, ...(preset.inazuma ?? {}) },
    range: { ...base.range, ...(preset.range ?? {}) },
    version: 1,
    appliedTeamPreset: presetName ?? base.appliedTeamPreset,
  }
}

/** data-team-presets 属性からチームプリセットを読み込む */
export function readTeamPresets(container: HTMLElement): TeamPreset[] {
  const raw = container.getAttribute('data-team-presets')
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    // 単一オブジェクトで貼られた場合も許容する
    const list = Array.isArray(parsed) ? parsed : [parsed]
    return list.filter(
      (p): p is TeamPreset => typeof p?.name === 'string' && p?.settings != null && typeof p.settings === 'object',
    )
  } catch {
    return []
  }
}

/** 設定 → 配布用プリセット JSON(version と適用済みプリセット名を除く) */
export function toPresetJson(name: string, settings: ChartSettings): string {
  const rest: Partial<ChartSettings> = { ...settings }
  delete rest.version
  delete rest.appliedTeamPreset
  return JSON.stringify({ name, settings: rest }, null, 2)
}
