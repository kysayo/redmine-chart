// ローカル開発(npm run dev)専用のダミーデータ。本番ビルドでは import.meta.env.DEV が false になり含まれない。
import type { ChartSettings, FieldDef, RedmineIssue } from '../types'
import { buildDefaultSettings } from './config'
import { formatDay, todayDay } from './dateUtils'

export const MOCK_STATUS_NAMES = ['新規', '進行中', 'フィードバック', '解決', 'Closed', 'Dropped']

const MOCK_STATUS_PROGRESS: Record<string, number> = {
  新規: 0,
  進行中: 50,
  フィードバック: 70,
  解決: 90,
  Closed: 100,
  Dropped: 100,
}

export const MOCK_EXTRA_FIELDS: FieldDef[] = [
  { key: 'cf_1', name: '機能', kind: 'list' },
  { key: 'cf_2', name: 'プログラム名', kind: 'list' },
]

const FUNCTIONS = ['画面', '帳票', 'バッチ', 'インタフェース']
const DOMAINS: Array<{ prefix: string; label: string }> = [
  { prefix: 'ACC', label: '会計' },
  { prefix: 'SAL', label: '販売' },
  { prefix: 'INV', label: '在庫' },
  { prefix: 'HR', label: '人事' },
]
const PEOPLE = ['佐藤', '鈴木', '高橋', '田中', '伊藤']

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildMockIssues(): RedmineIssue[] {
  const rand = mulberry32(42)
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
  const today = todayDay()
  const issues: RedmineIssue[] = []
  let nextId = 1000

  const statusWeights = ['新規', '新規', '進行中', '進行中', 'フィードバック', '解決', 'Closed', 'Closed', 'Closed']

  const makeIssue = (
    subject: string,
    tracker: string,
    fn: string,
    program: string,
    start: number,
    length: number,
    parentId?: number,
  ): RedmineIssue => {
    const statusName = pick(statusWeights)
    const person = pick(PEOPLE)
    const closed = statusName === 'Closed'
    const issue: RedmineIssue = {
      id: nextId++,
      subject,
      project: { id: 1, name: 'デモ案件' },
      tracker: { id: 1, name: tracker },
      status: { id: MOCK_STATUS_NAMES.indexOf(statusName) + 1, name: statusName },
      priority: { id: 2, name: '通常' },
      assigned_to: { id: PEOPLE.indexOf(person) + 1, name: person },
      author: { id: 1, name: '管理者' },
      created_on: '2026-01-05T00:00:00Z',
      updated_on: '2026-01-05T00:00:00Z',
      closed_on: closed ? '2026-01-20T00:00:00Z' : null,
      start_date: formatDay(start),
      due_date: formatDay(start + length - 1),
      done_ratio: Math.floor(rand() * 5) * 25,
      custom_fields: [
        { id: 1, name: '機能', value: fn },
        { id: 2, name: 'プログラム名', value: program },
      ],
    }
    if (parentId != null) issue.parent = { id: parentId }
    return issue
  }

  for (const domain of DOMAINS) {
    // 各ドメイン25本のうち、チケット化するのは約6割
    for (let n = 1; n <= 25; n++) {
      if (rand() < 0.4) continue
      const program = `${domain.prefix}-${String(n).padStart(3, '0')}`
      const fn = pick(FUNCTIONS)
      const start = today - 25 + Math.floor(rand() * 40)
      const parent = makeIssue(`${program} 開発`, 'プログラム', fn, program, start, 25 + Math.floor(rand() * 15))
      issues.push(parent)
      const designLen = 5 + Math.floor(rand() * 5)
      const buildLen = 8 + Math.floor(rand() * 6)
      issues.push(makeIssue(`${program} 設計`, '作成', fn, program, start, designLen, parent.id))
      issues.push(makeIssue(`${program} 製造`, '作成', fn, program, start + designLen, buildLen, parent.id))
      issues.push(makeIssue(`${program} テスト`, 'テスト', fn, program, start + designLen + buildLen, 6, parent.id))
    }
  }
  // 日付が未設定のチケット(表示確認用)
  const noDate = makeIssue('日付未定のタスク', '作成', FUNCTIONS[0], 'ACC-001', today, 1)
  noDate.start_date = null
  noDate.due_date = null
  issues.push(noDate)
  return issues
}

/** 開発時の既定設定: 機能 > プログラム名(ドメインでグルーピング) > 子チケット */
export function buildMockSettings(): ChartSettings {
  return {
    ...buildDefaultSettings(),
    levels: [
      { id: 'lv-1', type: 'field', field: 'cf_1' },
      { id: 'lv-2', type: 'field', field: 'cf_2', groupingId: 'gr-1' },
      { id: 'lv-3', type: 'children' },
    ],
    groupings: [
      {
        id: 'gr-1',
        name: 'プログラム名の業務区分',
        field: 'cf_2',
        otherLabel: 'その他',
        groups: DOMAINS.map(d => ({
          name: d.label,
          values: Array.from({ length: 25 }, (_, i) => `${d.prefix}-${String(i + 1).padStart(3, '0')}`),
        })),
      },
    ],
    columns: ['status', 'assigned_to', 'start_date', 'due_date'],
    statusProgress: MOCK_STATUS_PROGRESS,
  }
}
