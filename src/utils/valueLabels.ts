import { getProjectId } from './urlParser'

/**
 * カスタムフィールドの値(id)→ 表示名 の対応。
 * ユーザー型・バージョン型・キー/値リスト型のカスタムフィールドは、チケットの API では id が返るため、
 * チケット一覧ページの絞り込み用の選択肢(Redmine 標準。管理者権限は不要)から名前を引く。
 *  - 選択肢が少ない: window.availableFilters[cf_N].values に [名前, id] の組が入っている
 *  - 選択肢が多い(remote): /queries/filter?name=cf_N で取得する
 */
const labels = new Map<string, Map<string, string>>()
/** 取得済み(または取得を試みた)フィールド。取得失敗時に再試行を繰り返さない */
const resolved = new Set<string>()

export function isCustomFieldKey(key: string): boolean {
  return /^cf_\d+$/.test(key)
}

/** 値を表示名にする。対応が無ければそのまま */
export function getValueLabel(fieldKey: string, value: string): string {
  return labels.get(fieldKey)?.get(value) ?? value
}

/** [名前, 値] の組から対応を登録する。名前と値が同じもの(普通のリスト)や、「自分」(me)は登録しない。登録したら true */
function register(fieldKey: string, pairs: unknown[]): boolean {
  let map: Map<string, string> | undefined
  for (const p of pairs) {
    if (!Array.isArray(p) || p.length < 2) continue
    const label = String(p[0])
    const value = String(p[1])
    if (label === value || value === 'me' || value === 'none') continue
    map ??= new Map()
    map.set(value, label)
  }
  if (!map) return false
  labels.set(fieldKey, map)
  return true
}

/** ページに埋め込まれた選択肢から登録する(同期)。新しく登録したものがあれば true */
export function loadLabelsFromPage(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const af: Record<string, any> | undefined = (window as any).availableFilters
  if (!af) return false
  let changed = false
  for (const [key, f] of Object.entries(af)) {
    if (!isCustomFieldKey(key) || resolved.has(key)) continue
    if (f?.remote || !Array.isArray(f?.values)) continue
    resolved.add(key)
    if (register(key, f.values)) changed = true
  }
  return changed
}

/** 選択肢が remote のカスタムフィールドを、/queries/filter から取得して登録する。新しく登録したものがあれば true */
export async function loadRemoteLabels(fieldKeys: string[], apiKey: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const af: Record<string, any> | undefined = (window as any).availableFilters
  const targets = Array.from(new Set(fieldKeys)).filter(
    k => isCustomFieldKey(k) && !resolved.has(k) && af?.[k]?.remote,
  )
  if (targets.length === 0) return false

  const headers: Record<string, string> = {}
  if (apiKey) headers['X-Redmine-API-Key'] = apiKey
  const results = await Promise.all(
    targets.map(async key => {
      resolved.add(key)
      try {
        const params = new URLSearchParams({ project_id: getProjectId(), type: 'IssueQuery', name: key })
        const res = await fetch(`/queries/filter?${params}`, { headers })
        if (!res.ok) return false
        const data: unknown = await res.json()
        return Array.isArray(data) && register(key, data)
      } catch {
        return false
      }
    }),
  )
  return results.some(Boolean)
}
