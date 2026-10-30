import type { FieldDef, RedmineIssue, ViewFilter } from '../types'
import { getFieldValues, UNSET_LABEL } from './fields'

/** 1つのフィルタ条件が有効(絞り込みに使える状態)か */
function isActive(filter: ViewFilter, field: FieldDef | undefined): boolean {
  if (!field) return false
  return field.kind === 'string' ? filter.text.trim() !== '' : filter.values.length > 0
}

function matches(issue: RedmineIssue, filter: ViewFilter, field: FieldDef): boolean {
  const values = getFieldValues(issue, filter.field)
  if (field.kind === 'string') {
    const needle = filter.text.trim().toLowerCase()
    return values.some(v => v.toLowerCase().includes(needle))
  }
  if (values.length === 0) return filter.values.includes(UNSET_LABEL)
  return values.some(v => filter.values.includes(v))
}

/** アプリ内フィルタ(すべて AND)を適用する。再取得はしない */
export function applyViewFilters(
  issues: RedmineIssue[],
  filters: ViewFilter[],
  fields: FieldDef[],
): RedmineIssue[] {
  const active = filters
    .map(f => ({ f, def: fields.find(d => d.key === f.field) }))
    .filter((x): x is { f: ViewFilter; def: FieldDef } => isActive(x.f, x.def))
  if (active.length === 0) return issues
  return issues.filter(issue => active.every(({ f, def }) => matches(issue, f, def)))
}
