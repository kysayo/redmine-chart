/**
 * URLパスから Redmine のプロジェクト識別子を取得する
 * 例: /projects/europe/issues → "europe"。プロジェクト横断の /issues では空文字
 */
export function getProjectId(): string {
  const match = window.location.pathname.match(/\/projects\/([^/]+)\//)
  return match?.[1] ?? ''
}
