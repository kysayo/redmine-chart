import type { FieldDef, FieldKind, RedmineIssue } from '../types'
import { isoToLocalDate } from './dateUtils'

export const UNSET_LABEL = '(未設定)'

// 対応している標準列(Redmine の列名)と表示名・種別
const STANDARD_FIELDS: FieldDef[] = [
  { key: 'id', name: '#', kind: 'string' },
  { key: 'project', name: 'プロジェクト', kind: 'list' },
  { key: 'tracker', name: 'トラッカー', kind: 'list' },
  { key: 'status', name: 'ステータス', kind: 'list' },
  { key: 'priority', name: '優先度', kind: 'list' },
  { key: 'subject', name: '題名', kind: 'string' },
  { key: 'author', name: '作成者', kind: 'list' },
  { key: 'assigned_to', name: '担当者', kind: 'list' },
  { key: 'category', name: 'カテゴリ', kind: 'list' },
  { key: 'fixed_version', name: '対象バージョン', kind: 'list' },
  { key: 'parent', name: '親チケット', kind: 'string' },
  { key: 'start_date', name: '開始日', kind: 'date' },
  { key: 'due_date', name: '期日', kind: 'date' },
  { key: 'done_ratio', name: '進捗率', kind: 'number' },
  { key: 'estimated_hours', name: '予定工数', kind: 'number' },
  { key: 'created_on', name: '作成日', kind: 'date' },
  { key: 'updated_on', name: '更新日', kind: 'date' },
  { key: 'closed_on', name: '終了日', kind: 'date' },
]

const STANDARD_BY_KEY = new Map(STANDARD_FIELDS.map(f => [f.key, f]))

function isCustomFieldKey(key: string): boolean {
  return /^cf_\d+$/.test(key)
}

function kindOf(key: string): FieldKind {
  return STANDARD_BY_KEY.get(key)?.kind ?? 'list'
}

/**
 * 利用可能なフィールド(列)の一覧を返す。
 * チケット一覧ページの「利用可能な列」「選択された列」から取得し、取得できない場合(開発環境)は標準列のみ。
 * extra はフォールバック(開発用ダミーのカスタムフィールド等)として追加する。
 */
export function getAvailableFields(extra: FieldDef[] = []): FieldDef[] {
  const result: FieldDef[] = []
  const seen = new Set<string>()
  const push = (f: FieldDef) => {
    if (seen.has(f.key)) return
    seen.add(f.key)
    result.push(f)
  }

  const options = document.querySelectorAll<HTMLOptionElement>('#available_c option, #selected_c option')
  if (options.length === 0) {
    STANDARD_FIELDS.forEach(push)
    extra.forEach(push)
    return result
  }

  // id と題名は列候補に出てこないことがあるので必ず含める
  push(STANDARD_BY_KEY.get('id')!)
  push(STANDARD_BY_KEY.get('subject')!)
  options.forEach(opt => {
    const key = opt.value
    const name = opt.textContent?.trim() || key
    if (STANDARD_BY_KEY.has(key)) {
      push({ key, name, kind: kindOf(key) })
    } else if (isCustomFieldKey(key)) {
      push({ key, name, kind: 'list' })
    }
  })
  return result
}

function refName(ref: { name: string } | undefined): string[] {
  return ref ? [ref.name] : []
}

/** チケットのフィールド値を文字列配列で返す(複数値カスタムフィールドは複数要素)。値なしは空配列 */
export function getFieldValues(issue: RedmineIssue, key: string): string[] {
  switch (key) {
    case 'id': return [String(issue.id)]
    case 'project': return refName(issue.project)
    case 'tracker': return refName(issue.tracker)
    case 'status': return refName(issue.status)
    case 'priority': return refName(issue.priority)
    case 'subject': return issue.subject ? [issue.subject] : []
    case 'author': return refName(issue.author)
    case 'assigned_to': return refName(issue.assigned_to)
    case 'category': return refName(issue.category)
    case 'fixed_version': return refName(issue.fixed_version)
    case 'parent': return issue.parent ? [String(issue.parent.id)] : []
    case 'start_date': return issue.start_date ? [issue.start_date] : []
    case 'due_date': return issue.due_date ? [issue.due_date] : []
    case 'done_ratio': return issue.done_ratio != null ? [`${issue.done_ratio}%`] : []
    case 'estimated_hours': return issue.estimated_hours != null ? [String(issue.estimated_hours)] : []
    case 'created_on': return issue.created_on ? [isoToLocalDate(issue.created_on)] : []
    case 'updated_on': return issue.updated_on ? [isoToLocalDate(issue.updated_on)] : []
    case 'closed_on': return issue.closed_on ? [isoToLocalDate(issue.closed_on)] : []
  }
  if (isCustomFieldKey(key)) {
    const id = Number(key.slice(3))
    const cf = issue.custom_fields?.find(c => c.id === id)
    if (!cf || cf.value == null) return []
    const vals = Array.isArray(cf.value) ? cf.value : [cf.value]
    return vals.filter(v => v !== '')
  }
  return []
}

/** 表示・グルーピング用の単一文字列。値なしは空文字 */
export function getFieldValue(issue: RedmineIssue, key: string): string {
  return getFieldValues(issue, key).join(', ')
}

/** チケット群から、あるフィールドの値の種類(重複なし・日本語順)を集める */
export function collectDistinctValues(issues: RedmineIssue[], key: string): string[] {
  const set = new Set<string>()
  for (const issue of issues) {
    for (const v of getFieldValues(issue, key)) set.add(v)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }))
}
