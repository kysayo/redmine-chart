import type { DataGroup, DataItem } from 'vis-timeline'

// --- Redmine API 型定義 ---

export interface RedmineIssue {
  id: number
  subject: string
  start_date: string | null
  due_date: string | null
  status: { id: number; name: string }
  priority: { id: number; name: string }
  assigned_to?: { id: number; name: string }
  custom_fields?: Array<{ id: number; name: string; value: string | string[] }>
}

// ViewCustomize グローバル変数の型宣言
declare const ViewCustomize: {
  context: { user: { apiKey: string } }
}

// --- API 取得 ---

function getApiKey(): string {
  return ViewCustomize.context.user.apiKey
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(window.location.origin + path, {
    headers: { 'X-Redmine-API-Key': getApiKey() },
  })
  if (!res.ok) throw new Error(`Redmine API error: ${res.status}`)
  return res.json() as Promise<T>
}

export async function fetchChildIssues(parentId: number): Promise<RedmineIssue[]> {
  const data = await apiFetch<{ issues: RedmineIssue[] }>(
    `/issues.json?parent_id=${parentId}&limit=100`,
  )
  return data.issues
}

// 子チケット全件の子（孫）を並列取得。結果: Map<childId, grandChildren[]>
export async function fetchGrandChildren(
  children: RedmineIssue[],
): Promise<Map<number, RedmineIssue[]>> {
  const entries = await Promise.all(
    children.map(async child => {
      const data = await apiFetch<{ issues: RedmineIssue[] }>(
        `/issues.json?parent_id=${child.id}&limit=100`,
      )
      return [child.id, data.issues] as [number, RedmineIssue[]]
    }),
  )
  return new Map(entries)
}

// --- グルーピング型定義 ---

export type GroupField =
  | { type: 'standard'; key: 'status' | 'priority' | 'assigned_to' }
  | { type: 'custom'; id: number; name: string }

export interface GroupOption {
  value: string
  label: string
  field: GroupField
}

export function buildGroupOptions(children: RedmineIssue[]): GroupOption[] {
  const standard: GroupOption[] = [
    { value: 'status', label: 'ステータス', field: { type: 'standard', key: 'status' } },
    { value: 'priority', label: '優先度', field: { type: 'standard', key: 'priority' } },
    { value: 'assigned_to', label: '担当者', field: { type: 'standard', key: 'assigned_to' } },
  ]

  const cfMap = new Map<number, string>()
  for (const issue of children) {
    for (const cf of issue.custom_fields ?? []) {
      if (!cfMap.has(cf.id)) cfMap.set(cf.id, cf.name)
    }
  }

  const custom: GroupOption[] = Array.from(cfMap.entries()).map(([id, name]) => ({
    value: `cf_${id}`,
    label: name,
    field: { type: 'custom' as const, id, name },
  }))

  return [...standard, ...custom]
}

function getFieldValue(issue: RedmineIssue, field: GroupField): string {
  if (field.type === 'standard') {
    if (field.key === 'assigned_to') return issue.assigned_to?.name ?? '（未設定）'
    return issue[field.key].name
  }
  const cf = issue.custom_fields?.find(f => f.id === field.id)
  if (!cf) return '（未設定）'
  if (Array.isArray(cf.value)) return cf.value.length > 0 ? cf.value.join(', ') : '（未設定）'
  return cf.value || '（未設定）'
}

function pushChildEntry(
  groups: DataGroup[],
  items: DataItem[],
  child: RedmineIssue,
  subChildren: RedmineIssue[],
) {
  const subGroupIds = subChildren.map(gc => `g-${gc.id}`)
  groups.push({
    id: `g-${child.id}`,
    content: `#${child.id} ${child.subject}`,
    nestedGroups: subGroupIds.length > 0 ? subGroupIds : undefined,
    showNested: true,
  })
  if (child.start_date && child.due_date) {
    items.push({
      id: `i-${child.id}`,
      group: `g-${child.id}`,
      content: '',
      start: child.start_date,
      end: child.due_date,
      type: 'range',
    })
  }
  for (const gc of subChildren) {
    groups.push({
      id: `g-${gc.id}`,
      content: `#${gc.id} ${gc.subject}`,
    })
    if (gc.start_date && gc.due_date) {
      items.push({
        id: `i-${gc.id}`,
        group: `g-${gc.id}`,
        content: '',
        start: gc.start_date,
        end: gc.due_date,
        type: 'range',
      })
    }
  }
}

// --- vis-timeline 変換 ---

export function issuesToGantt(
  children: RedmineIssue[],
  grandChildren: Map<number, RedmineIssue[]>,
  groupByField?: GroupField,
): { groups: DataGroup[]; items: DataItem[] } {
  const groups: DataGroup[] = []
  const items: DataItem[] = []

  if (!groupByField) {
    // デフォルト: 子チケットをフラットに表示（孫ありはネスト）
    for (const child of children) {
      pushChildEntry(groups, items, child, grandChildren.get(child.id) ?? [])
    }
    return { groups, items }
  }

  // グルーピングあり: 子チケットのフィールド値で最上位グループを作る
  const uniqueValues = [...new Set(children.map(c => getFieldValue(c, groupByField)))]
  for (const value of uniqueValues) {
    const valueChildren = children.filter(c => getFieldValue(c, groupByField) === value)
    groups.push({
      id: `top-${value}`,
      content: value,
      nestedGroups: valueChildren.map(c => `g-${c.id}`),
      showNested: true,
    })
    for (const child of valueChildren) {
      pushChildEntry(groups, items, child, grandChildren.get(child.id) ?? [])
    }
  }

  return { groups, items }
}

// --- タイムライン表示範囲の計算 ---

export function computeDateRange(items: DataItem[]): { start: Date; end: Date } {
  const datedItems = items.filter(i => i.start && i.end)
  if (datedItems.length === 0) {
    const now = new Date()
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth() + 2, 1),
    }
  }
  const starts = datedItems.map(i => new Date(i.start as string).getTime())
  const ends = datedItems.map(i => new Date(i.end as string).getTime())
  const buffer = 14 * 24 * 60 * 60 * 1000 // 2週間
  return {
    start: new Date(Math.min(...starts) - buffer),
    end: new Date(Math.max(...ends) + buffer),
  }
}
