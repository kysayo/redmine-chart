// ===== Redmine API =====

export interface RedmineRef {
  id: number
  name: string
}

export interface RedmineIssue {
  id: number
  subject: string
  project?: RedmineRef
  /** is_closed は Redmine のバージョンによっては返らない */
  status: RedmineRef & { is_closed?: boolean }

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

/** 表示する日付範囲。auto=チケットの日付に合わせる / relative=今日からの相対 / fixed=日付指定 */
export interface RangeSettings {
  mode: 'auto' | 'relative' | 'fixed'
  /** relative: 今日の何日前から表示するか */
  beforeDays: number
  /** relative: 今日の何日後まで表示するか */
  afterDays: number
  /** fixed: YYYY-MM-DD。空欄の側は auto と同じ(チケットの日付に合わせる) */
  startDate: string
  endDate: string
}

/** 左の表の列設定 */
export interface ColumnConfig {
  /** フィールドのキー(status / assigned_to / cf_N など) */
  key: string
  /** 列幅(px) */
  width: number
  /** 折り返して全文を表示する(行の高さが内容に合わせて広がる) */
  wrap: boolean
  /** 表示切替グループ。同じ値の列は、見出しの ＋/－ ボタンで同時に表示・非表示になる。null=切替なし */
  toggleGroup: number | null
}

/** 先頭の「チケット」(階層ツリー)列の設定 */
export interface NameColumnConfig {
  width: number
  wrap: boolean
}

/**
 * 行の色ルール。上から順に評価し、最初に合致したルールを適用する。
 * useClosed が true のときは statuses ではなく、ステータスの「終了」属性(is_closed)で判定する。
 */
export interface RowColorRule {
  id: string
  useClosed: boolean
  /** 対象のステータス名(複数可)。useClosed のときは無視 */
  statuses: string[]
  /** 行の背景色(#rrggbb) */
  bg: string
  /** 文字色(#rrggbb)。空文字なら変更しない */
  textColor: string
}

/** タスクの終了日(バーの右端)に使う項目 */
export interface EndDateSettings {
  /** 日付項目のキー。空文字なら期日(due_date) */
  field: string
  /** 終了日が無い行を赤くする */
  highlightMissing: boolean
}

export interface ChartSettings {
  version: 1
  levels: HierarchyLevel[]
  groupings: GroupingDef[]
  /** 左の表に表示する列。先頭の「チケット」列(階層ツリー)は常に表示 */
  columns: ColumnConfig[]
  nameColumn: NameColumnConfig
  /**
   * 横スクロールしても固定する範囲の、右端の列のキー。空文字=「チケット」列のみ。
   * 未設定(undefined)=すべての列を固定(従来の動作)
   */
  freezeAt?: string
  /** ステータス名 → 進捗率(0-100)。未設定のステータスは 完了=100 / それ以外=done_ratio */
  statusProgress: Record<string, number>
  inazuma: InazumaSettings
  range: RangeSettings
  rowColors: RowColorRule[]
  endDate: EndDateSettings
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
  /** チケット自身に終了日(設定の終了日項目の値)が無い */
  endMissing?: boolean
}

export interface GanttRow {
  node: TreeNode
  /** 子ノードを持つか(折り畳み・イナズマ対象判定用。折り畳み中でも true) */
  hasChildren: boolean
  collapsed: boolean
}
