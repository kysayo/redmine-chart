// ===== Redmine API =====

export interface RedmineRef {
  id: number
  name: string
}

export interface RedmineIssue {
  id: number
  subject: string
  project?: RedmineRef
  status: RedmineRef
  tracker: RedmineRef
  priority?: RedmineRef
  assigned_to?: RedmineRef
  category?: RedmineRef
  fixed_version?: RedmineRef
  author?: RedmineRef
  parent?: { id: number }
  created_on: string // UTC ISO文字列
  updated_on: string
  closed_on?: string | null
  start_date?: string | null // YYYY-MM-DD
  due_date?: string | null // YYYY-MM-DD
  done_ratio?: number
  estimated_hours?: number | null
  custom_fields?: Array<{ id: number; name: string; value: string | string[] | null }>
}

export interface RedmineIssuesResponse {
  issues: RedmineIssue[]
  total_count: number
  offset: number
  limit: number
}

export interface FetchProgress {
  fetched: number
  total: number
}

// ===== フィールド(列・階層・フィルタ共通) =====

export type FieldKind = 'list' | 'string' | 'date' | 'number'

export interface FieldDef {
  /** Redmine の列名。標準列は status / assigned_to など、カスタムフィールドは cf_N */
  key: string
  name: string
  kind: FieldKind
}

// ===== 設定 =====

/** 階層の1レベル。項目(フィールド値でグルーピング) か 子チケット(parent_id の入れ子) */
export type HierarchyLevel =
  | { id: string; type: 'field'; field: string; groupingId?: string }
  | { id: string; type: 'children' }

/** 値のまとめ定義(例: プログラム名100個 → 「会計」など) */
export interface GroupingDef {
  id: string
  name: string
  field: string
  groups: Array<{ name: string; values: string[] }>
  /** どのグループにも属さない値のまとめ先ラベル */
  otherLabel: string
}

export type TimelineScale = 'day' | 'week' | 'month'

export type InazumaStrategyId = 'leafOnly'

export interface InazumaSettings {
  enabled: boolean
  strategy: InazumaStrategyId
  /** 基準日 YYYY-MM-DD。空文字なら今日 */
  baseDate: string
}

export interface ChartSettings {
  version: 1
  levels: HierarchyLevel[]
  groupings: GroupingDef[]
  /** 左の表に表示する列(field key)。先頭の名称列(階層ツリー)は固定 */
  columns: string[]
  /** ステータス名 → 進捗率(0-100)。未設定のステータスは 完了=100 / それ以外=done_ratio */
  statusProgress: Record<string, number>
  inazuma: InazumaSettings
  scale: TimelineScale
  /** 最後に適用したチームプリセット名(表示用) */
  appliedTeamPreset?: string
}

export type PresetSettings = Omit<ChartSettings, 'version' | 'appliedTeamPreset'>

/** data-team-presets で配布するプリセット。足りない項目は既定値で補う */
export interface TeamPreset {
  name: string
  settings: Partial<PresetSettings>
}

// ===== アプリ内フィルタ(永続化しない) =====

export interface ViewFilter {
  id: string
  field: string
  /** list 型: 選択された値。'(未設定)' は値なしを表す */
  values: string[]
  /** string 型: 部分一致テキスト */
  text: string
}

// ===== 表示用行 =====

export interface TreeNode {
  id: string
  kind: 'group' | 'issue'
  label: string
  depth: number
  issue?: RedmineIssue
  children: TreeNode[]
  /** 配下(自身含む)の開始日・終了日の day number */
  start: number | null
  end: number | null
  /** 進捗率 0-100。グループは配下リーフの平均 */
  progress: number
  /** 配下のチケット数(グループのみ意味を持つ) */
  issueCount: number
}

export interface GanttRow {
  node: TreeNode
  /** 子ノードを持つか(折り畳み・イナズマ対象判定用。折り畳み中でも true) */
  hasChildren: boolean
  collapsed: boolean
}
