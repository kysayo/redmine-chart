import type { FetchProgress, RedmineIssue, RedmineIssuesResponse } from '../types'

function buildHeaders(apiKey: string): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) {
    headers['X-Redmine-API-Key'] = apiKey
  }
  return headers
}

/**
 * 一覧ページのクエリ(フィルタ・query_id 等)をそのまま引き継ぎ、ページング用パラメータだけ上書きする。
 * status_id は上書きしない(一覧に表示されているチケットと同じ範囲を対象にするため)。
 */
function buildIssueQueryParams(rawSearch: string, offset: number, limit: number): URLSearchParams {
  const params = new URLSearchParams(rawSearch)
  params.delete('page')
  params.delete('per_page')
  params.set('limit', String(limit))
  params.set('offset', String(offset))
  return params
}

async function fetchIssuesPage(
  projectId: string,
  rawSearch: string,
  apiKey: string,
  offset: number,
  limit: number,
): Promise<RedmineIssuesResponse> {
  const params = buildIssueQueryParams(rawSearch, offset, limit)
  const base = projectId ? `/projects/${projectId}/issues.json` : '/issues.json'
  const response = await fetch(`${base}?${params.toString()}`, { headers: buildHeaders(apiKey) })
  if (!response.ok) {
    throw new Error(`Failed to fetch issues: ${response.status}`)
  }
  return (await response.json()) as RedmineIssuesResponse
}

/**
 * 全ページを自動取得してチケット一覧を返す
 * ページネーション: limit=100 で total_count に達するまで繰り返し取得
 */
export async function fetchAllIssues(
  projectId: string,
  rawSearch: string,
  apiKey: string,
  onProgress?: (progress: FetchProgress) => void,
): Promise<RedmineIssue[]> {
  const limit = 100
  let offset = 0
  const all: RedmineIssue[] = []

  while (true) {
    const data = await fetchIssuesPage(projectId, rawSearch, apiKey, offset, limit)
    all.push(...data.issues)
    onProgress?.({ fetched: all.length, total: data.total_count })
    if (all.length >= data.total_count || data.issues.length === 0) break
    offset += limit
  }

  return all
}

/** チケット一覧ページの availableFilters からステータス名の一覧を取得する。無ければ null */
export function getStatusNamesFromPage(): string[] | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const af = (window as any).availableFilters
  const values: unknown = af?.status_id?.values
  if (!Array.isArray(values) || values.length === 0) return null
  const names = values
    .filter((v): v is [string, string] => Array.isArray(v) && v.length >= 2)
    .map(([name]) => String(name))
  return names.length > 0 ? names : null
}
