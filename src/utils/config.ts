import type { ChartSettings, ColumnConfig, PresetSettings, TeamPreset } from '../types'

/** ラベル行の既定の色(淡い緑・橙・紫・青・黄・赤) */
export const DEFAULT_LABEL_COLORS = ['#c8e6c9', '#ffe0b2', '#e1bee7', '#b3e5fc', '#fff9c4', '#ffcdd2']

export const DEFAULT_COL_WIDTH = 100
export const DEFAULT_NAME_WIDTH = 300
const MIN_WIDTH = 30
const MAX_WIDTH = 800

function clampWidth(n: unknown, fallback: number): number {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(v))) : fallback
}

/** キーの配列から既定の列設定を作る */
export function toColumns(keys: string[]): ColumnConfig[] {
  return keys.map(key => ({ key, width: DEFAULT_COL_WIDTH, wrap: false, toggleGroup: null }))
}

/** 列設定を正規化する。旧形式(キーの文字列の配列)も受け付ける */
export function normalizeColumns(raw: unknown): ColumnConfig[] {
  if (!Array.isArray(raw)) return []
  const result: ColumnConfig[] = []
  for (const item of raw) {
    if (typeof item === 'string') {
      result.push({ key: item, width: DEFAULT_COL_WIDTH, wrap: false, toggleGroup: null })
    } else if (item && typeof item === 'object' && typeof (item as ColumnConfig).key === 'string') {
      const c = item as Partial<ColumnConfig> & { key: string }
      const group = Number(c.toggleGroup)
      result.push({
        key: c.key,
        width: clampWidth(c.width, DEFAULT_COL_WIDTH),
        wrap: c.wrap === true,
        toggleGroup: c.toggleGroup != null && Number.isFinite(group) ? group : null,
      })
    }
  }
  return result
}

/** 既定の設定。階層は「子チケット」のみ(親子ツリー) */
export function buildDefaultSettings(): ChartSettings {
  return {
    version: 1,
    levels: [{ id: 'lv-1', type: 'children' }],
    groupings: [],
    columns: toColumns(['status', 'assigned_to', 'start_date', 'due_date']),
    nameColumn: { width: DEFAULT_NAME_WIDTH, wrap: false },
    statusProgress: {},
    inazuma: { enabled: true, strategy: 'leafOnly', baseDate: '', includeLabels: false, onTrackStatuses: [], onTrackLatePercent: 10 },
    labelRows: { parentAsLabel: false, showBar: true },
    labelColors: [...DEFAULT_LABEL_COLORS],
    range: { mode: 'auto', beforeDays: 30, afterDays: 90, startDate: '', endDate: '' },
    rowColors: [],
    endDate: { field: '', highlightMissing: false },
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
    endDate: { ...base.endDate, ...(preset.endDate ?? {}) },
    labelRows: { ...base.labelRows, ...(preset.labelRows ?? {}) },
    labelColors:
      Array.isArray(preset.labelColors) && preset.labelColors.length > 0
        ? preset.labelColors.filter((c): c is string => typeof c === 'string')
        : base.labelColors,
    columns: preset.columns !== undefined ? normalizeColumns(preset.columns) : base.columns,
    nameColumn: {
      width: clampWidth(preset.nameColumn?.width, base.nameColumn.width),
      wrap: preset.nameColumn?.wrap ?? base.nameColumn.wrap,
    },
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
  // 改行なしの1行。View Customize のコードにそのまま貼れる
  return JSON.stringify({ name, settings: rest })
}
