import type { ChartSettings, GanttRow, GroupingDef, HierarchyLevel, RedmineIssue, TreeNode } from '../types'
import { getFieldValue, UNSET_LABEL } from './fields'
import { parseDay } from './dateUtils'
import { getIssueProgress } from './progress'

/** 階層レベルの値を決める。グルーピングがあればまとめ先のグループ名を返す */
function resolveGroupLabel(
  issue: RedmineIssue,
  level: Extract<HierarchyLevel, { type: 'field' }>,
  groupings: GroupingDef[],
): string {
  const raw = getFieldValue(issue, level.field)
  if (raw === '') return UNSET_LABEL
  const grouping = level.groupingId ? groupings.find(g => g.id === level.groupingId) : undefined
  if (!grouping) return raw
  const hit = grouping.groups.find(g => g.values.includes(raw))
  return hit ? hit.name : grouping.otherLabel || 'その他'
}

function compareIssues(a: RedmineIssue, b: RedmineIssue): number {
  const sa = parseDay(a.start_date) ?? Number.MAX_SAFE_INTEGER
  const sb = parseDay(b.start_date) ?? Number.MAX_SAFE_INTEGER
  return sa - sb || a.id - b.id
}

interface BuildContext {
  settings: ChartSettings
}

function issueNode(issue: RedmineIssue, depth: number, id: string, children: TreeNode[], ctx: BuildContext): TreeNode {
  const own = {
    start: parseDay(issue.start_date) ?? parseDay(issue.due_date),
    end: parseDay(issue.due_date) ?? parseDay(issue.start_date),
  }
  const node: TreeNode = {
    id,
    kind: 'issue',
    label: issue.subject,
    depth,
    issue,
    children,
    start: own.start,
    end: own.end,
    progress: getIssueProgress(issue, ctx.settings.statusProgress),
    issueCount: 1 + children.reduce((s, c) => s + c.issueCount, 0),
  }
  // 自身に日付が無い場合は子の範囲で補う
  if (node.start == null || node.end == null) {
    const range = rangeOf(children)
    node.start = node.start ?? range.start
    node.end = node.end ?? range.end
  }
  return node
}

function rangeOf(nodes: TreeNode[]): { start: number | null; end: number | null } {
  let start: number | null = null
  let end: number | null = null
  for (const n of nodes) {
    if (n.start != null && (start == null || n.start < start)) start = n.start
    if (n.end != null && (end == null || n.end > end)) end = n.end
  }
  return { start, end }
}

/** グループノードの進捗 = 配下リーフ(子を持たないチケット)の進捗の単純平均 */
function collectLeafProgress(node: TreeNode, out: number[]): void {
  if (node.kind === 'issue' && node.children.length === 0) {
    out.push(node.progress)
    return
  }
  node.children.forEach(c => collectLeafProgress(c, out))
}

function groupNode(label: string, depth: number, id: string, children: TreeNode[]): TreeNode {
  const range = rangeOf(children)
  const leaves: number[] = []
  children.forEach(c => collectLeafProgress(c, leaves))
  return {
    id,
    kind: 'group',
    label,
    depth,
    children,
    start: range.start,
    end: range.end,
    progress: leaves.length > 0 ? leaves.reduce((s, p) => s + p, 0) / leaves.length : 0,
    issueCount: children.reduce((s, c) => s + c.issueCount, 0),
  }
}

/** 親子関係で入れ子にする。issues の中に親がいないチケットがルートになる */
function buildChildrenNodes(issues: RedmineIssue[], depth: number, idPrefix: string, ctx: BuildContext): TreeNode[] {
  const idSet = new Set(issues.map(i => i.id))
  const byParent = new Map<number, RedmineIssue[]>()
  const roots: RedmineIssue[] = []
  for (const issue of issues) {
    const pid = issue.parent?.id
    if (pid != null && idSet.has(pid) && pid !== issue.id) {
      const list = byParent.get(pid) ?? []
      list.push(issue)
      byParent.set(pid, list)
    } else {
      roots.push(issue)
    }
  }
  const visited = new Set<number>()
  const build = (issue: RedmineIssue, d: number): TreeNode => {
    visited.add(issue.id)
    const kids = (byParent.get(issue.id) ?? [])
      .filter(k => !visited.has(k.id))
      .sort(compareIssues)
      .map(k => build(k, d + 1))
    return issueNode(issue, d, `${idPrefix}/i:${issue.id}`, kids, ctx)
  }
  const nodes = roots.sort(compareIssues).map(r => build(r, depth))
  // 親子が循環していて到達できなかったチケットはルートとして追加する
  for (const issue of issues) {
    if (!visited.has(issue.id)) nodes.push(build(issue, depth))
  }
  return nodes
}

function buildLevel(
  issues: RedmineIssue[],
  levels: HierarchyLevel[],
  levelIndex: number,
  depth: number,
  idPrefix: string,
  ctx: BuildContext,
): TreeNode[] {
  const level = levels[levelIndex]
  // 階層指定が尽きた、または 子チケット レベル → チケットを並べる
  if (!level || level.type === 'children') {
    if (level?.type === 'children') return buildChildrenNodes(issues, depth, idPrefix, ctx)
    return [...issues].sort(compareIssues).map(i => issueNode(i, depth, `${idPrefix}/i:${i.id}`, [], ctx))
  }

  const groupings = ctx.settings.groupings
  const buckets = new Map<string, RedmineIssue[]>()
  for (const issue of issues) {
    const label = resolveGroupLabel(issue, level, groupings)
    const list = buckets.get(label) ?? []
    list.push(issue)
    buckets.set(label, list)
  }

  const grouping = level.groupingId ? groupings.find(g => g.id === level.groupingId) : undefined
  const order = (label: string): number => {
    if (!grouping) return 0
    const idx = grouping.groups.findIndex(g => g.name === label)
    return idx >= 0 ? idx : grouping.groups.length // その他/未設定は後ろ
  }
  const labels = Array.from(buckets.keys()).sort((a, b) => {
    const d = order(a) - order(b)
    if (d !== 0) return d
    if (a === UNSET_LABEL) return 1
    if (b === UNSET_LABEL) return -1
    return a.localeCompare(b, 'ja', { numeric: true })
  })

  return labels.map(label => {
    const id = `${idPrefix}/g${levelIndex}:${label}`
    const kids = buildLevel(buckets.get(label)!, levels, levelIndex + 1, depth + 1, id, ctx)
    return groupNode(label, depth, id, kids)
  })
}

/** チケット群を設定の階層に従ってツリー化する */
export function buildTree(issues: RedmineIssue[], settings: ChartSettings): TreeNode[] {
  return buildLevel(issues, settings.levels, 0, 0, '', { settings })
}

/** 折り畳み状態を反映して、表示する行を上から順に平坦化する */
export function flattenTree(roots: TreeNode[], collapsedIds: Set<string>): GanttRow[] {
  const rows: GanttRow[] = []
  const walk = (node: TreeNode) => {
    const collapsed = collapsedIds.has(node.id)
    rows.push({ node, hasChildren: node.children.length > 0, collapsed })
    if (!collapsed) node.children.forEach(walk)
  }
  roots.forEach(walk)
  return rows
}

/** 子を持つノード(折り畳み可能)の id をすべて集める */
export function collectExpandableIds(roots: TreeNode[]): string[] {
  const ids: string[] = []
  const walk = (node: TreeNode) => {
    if (node.children.length > 0) ids.push(node.id)
    node.children.forEach(walk)
  }
  roots.forEach(walk)
  return ids
}
