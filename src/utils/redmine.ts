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

export async function fetchIssue(id: number): Promise<RedmineIssue> {
  const data = await apiFetch<{ issue: RedmineIssue }>(`/issues/${id}.json`)
  return data.issue
}

export async function fetchChildIssues(parentId: number): Promise<RedmineIssue[]> {
  const data = await apiFetch<{ issues: RedmineIssue[] }>(
    `/issues.json?parent_id=${parentId}&limit=100`,
  )
  return data.issues
}

// --- vis-timeline 変換 ---

export function issuesToGantt(
  parent: RedmineIssue,
  children: RedmineIssue[],
): { groups: DataGroup[]; items: DataItem[] } {
  const groups: DataGroup[] = []
  const items: DataItem[] = []

  const childGroupIds = children.map(c => `g-${c.id}`)

  groups.push({
    id: `g-${parent.id}`,
    content: `#${parent.id} ${parent.subject}`,
    nestedGroups: childGroupIds.length > 0 ? childGroupIds : undefined,
    showNested: true,
  })

  if (parent.start_date && parent.due_date) {
    items.push({
      id: `i-${parent.id}`,
      group: `g-${parent.id}`,
      content: '',
      start: parent.start_date,
      end: parent.due_date,
      type: 'range',
    })
  }

  for (const child of children) {
    groups.push({
      id: `g-${child.id}`,
      content: `#${child.id} ${child.subject}`,
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
