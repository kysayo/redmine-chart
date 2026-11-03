import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChartSettings, RedmineIssue, TeamPreset, ViewFilter } from './types'
import ChartSettingsPanel from './components/ChartSettingsPanel'
import GanttChart from './components/GanttChart'
import ViewFilterBar from './components/ViewFilterBar'
import { buildDefaultSettings, mergePreset, readTeamPresets } from './utils/config'
import { getAvailableFields } from './utils/fields'
import { applyViewFilters } from './utils/filters'
import { buildTree, collectExpandableIds, flattenTree } from './utils/hierarchy'
import { resolveBaseDay } from './utils/inazuma/compute'
import { buildMockIssues, buildMockSettings, MOCK_EXTRA_FIELDS, MOCK_STATUS_NAMES } from './utils/mockIssues'
import { fetchAllIssues, fetchStatusNamesFromFilter, getStatusNamesFromPage } from './utils/redmineApi'
import { loadSettings, saveSettings } from './utils/storage'
import { resolveRowStyle } from './utils/rowStyle'
import { getProjectId } from './utils/urlParser'
import { isCustomFieldKey, loadLabelsFromPage, loadRemoteLabels } from './utils/valueLabels'
import './App.css'

interface Props {
  container: HTMLElement
}

interface IssueState {
  issues: RedmineIssue[] | null
  error: string | null
  fetchedCount: number
  totalCount: number | null
}

const SECTION_ID = 'chart-section'

function initSettings(presets: TeamPreset[]): ChartSettings {
  const saved = loadSettings()
  if (saved) return saved
  if (presets.length > 0) return mergePreset(buildDefaultSettings(), presets[0].settings, presets[0].name)
  return import.meta.env.DEV ? buildMockSettings() : buildDefaultSettings()
}

export default function App({ container }: Props) {
  const apiKey = container.dataset.apiKey ?? ''
  const projectId = getProjectId()
  const rawSearch = window.location.search

  const teamPresets = useMemo(() => readTeamPresets(container), [container])
  const [settings, setSettings] = useState<ChartSettings>(() => initSettings(teamPresets))
  const [showSettings, setShowSettings] = useState(false)
  // 値の表示名の読み込み回数。ページに埋め込まれた選択肢は、最初の描画の前に同期で登録しておく
  const [labelsVersion, setLabelsVersion] = useState(() => {
    loadLabelsFromPage()
    return 0
  })
  const [viewFilters, setViewFilters] = useState<ViewFilter[]>([])
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())

  const [issueState, setIssueState] = useState<IssueState>({
    issues: null,
    error: null,
    fetchedCount: 0,
    totalCount: null,
  })

  // Chart セクションが開かれたときにフェッチを開始するフラグ。
  // セクションが無い(開発環境)または最初から展開済みなら即フェッチする
  const [shouldFetch, setShouldFetch] = useState(() => {
    const fieldset = document.getElementById(SECTION_ID)
    return !fieldset || !fieldset.classList.contains('collapsed')
  })

  // fieldset#chart-section の折り畳み制御(Redmine の toggleFieldset に依存しない独自実装)
  useEffect(() => {
    const fieldset = document.getElementById(SECTION_ID)
    if (!fieldset || !fieldset.classList.contains('collapsed')) return

    const legend = fieldset.querySelector('legend')
    if (!legend) {
      const observer = new MutationObserver(() => {
        if (!fieldset.classList.contains('collapsed')) {
          setShouldFetch(true)
          observer.disconnect()
        }
      })
      observer.observe(fieldset, { attributes: true, attributeFilter: ['class'] })
      return () => observer.disconnect()
    }

    // onclick 属性(toggleFieldset(this))を退避して削除し、二重トグルを防ぐ
    const origOnclick = legend.getAttribute('onclick')
    legend.removeAttribute('onclick')

    let fetched = false
    const handleToggle = () => {
      const isCollapsed = fieldset.classList.contains('collapsed')
      fieldset.classList.toggle('collapsed')
      legend.classList.toggle('icon-collapsed', !isCollapsed)
      legend.classList.toggle('icon-expanded', isCollapsed)
      const div = fieldset.querySelector<HTMLElement>(':scope > div')
      if (div) {
        if (isCollapsed) {
          div.classList.remove('hidden')
          div.style.removeProperty('display')
          if (!fetched) {
            fetched = true
            setShouldFetch(true)
          }
        } else {
          div.classList.add('hidden')
        }
      }
    }

    legend.addEventListener('click', handleToggle)
    return () => {
      legend.removeEventListener('click', handleToggle)
      if (origOnclick) legend.setAttribute('onclick', origOnclick)
    }
  }, [])

  // チケット取得
  useEffect(() => {
    if (!shouldFetch) return
    fetchAllIssues(projectId, rawSearch, apiKey, progress => {
      setIssueState(prev => ({ ...prev, fetchedCount: progress.fetched, totalCount: progress.total }))
    })
      .then(issues =>
        setIssueState({ issues, error: null, fetchedCount: issues.length, totalCount: issues.length }),
      )
      .catch((e: Error) => {
        if (import.meta.env.DEV) {
          // ローカル開発では Redmine に接続できないためダミーデータで代替する
          const issues = buildMockIssues()
          setIssueState({ issues, error: null, fetchedCount: issues.length, totalCount: issues.length })
          return
        }
        setIssueState({ issues: null, error: e.message, fetchedCount: 0, totalCount: null })
      })
  }, [projectId, rawSearch, apiKey, shouldFetch])

  const handleSettingsChange = useCallback((next: ChartSettings) => {
    setSettings(next)
    saveSettings(next)
  }, [])

  const handleApplyTeamPreset = useCallback(
    (preset: TeamPreset) => handleSettingsChange(mergePreset(buildDefaultSettings(), preset.settings, preset.name)),
    [handleSettingsChange],
  )

  const handleReset = useCallback(() => {
    handleSettingsChange(import.meta.env.DEV ? buildMockSettings() : buildDefaultSettings())
  }, [handleSettingsChange])

  // ユーザー型などのカスタムフィールドの id → 表示名。remote の選択肢は取得後に再計算する
  const usedFieldKeys = useMemo(() => {
    const keys = new Set<string>(settings.columns.map(c => c.key))
    settings.levels.forEach(l => l.type === 'field' && keys.add(l.field))
    settings.groupings.forEach(g => keys.add(g.field))
    viewFilters.forEach(f => f.field && keys.add(f.field))
    if (settings.endDate.field) keys.add(settings.endDate.field)
    return Array.from(keys).filter(isCustomFieldKey).sort().join(',')
  }, [settings.columns, settings.levels, settings.groupings, settings.endDate.field, viewFilters])

  useEffect(() => {
    if (!shouldFetch || usedFieldKeys === '') return
    let cancelled = false
    void loadRemoteLabels(usedFieldKeys.split(','), apiKey).then(changed => {
      if (changed && !cancelled) setLabelsVersion(v => v + 1)
    })
    return () => {
      cancelled = true
    }
  }, [usedFieldKeys, apiKey, shouldFetch])

  const fields = useMemo(
    () => getAvailableFields(import.meta.env.DEV ? MOCK_EXTRA_FIELDS : []),
    // 取得開始後は一覧ページの DOM が確定しているので、そのタイミングで読み直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shouldFetch],
  )

  const allIssues = useMemo(() => issueState.issues ?? [], [issueState.issues])

  // サブプロジェクトのステータスも含む一覧(絞り込み用の選択肢から取得)
  const [filterStatusNames, setFilterStatusNames] = useState<string[]>([])
  useEffect(() => {
    if (!shouldFetch) return
    let cancelled = false
    void fetchStatusNamesFromFilter(apiKey).then(names => {
      if (names && !cancelled) setFilterStatusNames(names)
    })
    return () => {
      cancelled = true
    }
  }, [apiKey, shouldFetch])

  const statusNames = useMemo(() => {
    // ワークフローの並び(ページ・絞り込みの選択肢)を先に、実データと設定済みのものを後ろに足す
    const names = new Set<string>([
      ...(getStatusNamesFromPage() ?? (import.meta.env.DEV ? MOCK_STATUS_NAMES : [])),
      ...filterStatusNames,
    ])
    allIssues.forEach(i => names.add(i.status.name))
    Object.keys(settings.statusProgress).forEach(n => names.add(n))
    return Array.from(names)
  }, [allIssues, settings.statusProgress, filterStatusNames])

  // labelsVersion: 値の表示名(ユーザー名など)が読み込まれたら、絞り込み・階層を作り直す
  const filteredIssues = useMemo(
    () => applyViewFilters(allIssues, viewFilters, fields),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allIssues, viewFilters, fields, labelsVersion],
  )

  const tree = useMemo(
    () => buildTree(filteredIssues, settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredIssues, settings, labelsVersion],
  )
  const rows = useMemo(() => flattenTree(tree, collapsedIds), [tree, collapsedIds])
  const baseDay = resolveBaseDay(settings.inazuma.baseDate)

  const toggleNode = useCallback((id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const { issues: loadedIssues, error, fetchedCount, totalCount } = issueState
  const loading = shouldFetch && loadedIssues === null && error === null

  return (
    <div className="rc-root">
      <div className="rc-toolbar">
        <button type="button" className="rc-btn" onClick={() => setShowSettings(v => !v)}>
          {showSettings ? '設定を閉じる' : '設定'}
        </button>
        <button type="button" className="rc-btn" onClick={() => setCollapsedIds(new Set())}>すべて展開</button>
        <button type="button" className="rc-btn" onClick={() => setCollapsedIds(new Set(collectExpandableIds(tree)))}>
          すべて折り畳み
        </button>
        <span className="rc-note">
          {loading && `読み込み中… ${fetchedCount}${totalCount != null ? ` / ${totalCount}` : ''}件`}
          {!loading && issueState.issues && `${filteredIssues.length} / ${allIssues.length}件を表示`}
          {settings.appliedTeamPreset && ` ・ プリセット: ${settings.appliedTeamPreset}`}
        </span>
      </div>

      {showSettings && (
        <ChartSettingsPanel
          settings={settings}
          onChange={handleSettingsChange}
          fields={fields}
          issues={allIssues}
          labelsVersion={labelsVersion}
          statusNames={statusNames}
          teamPresets={teamPresets}
          onApplyTeamPreset={handleApplyTeamPreset}
          onReset={handleReset}
        />
      )}

      {issueState.issues && (
        <ViewFilterBar filters={viewFilters} fields={fields} issues={allIssues} onChange={setViewFilters} />
      )}

      {error && <p className="rc-error">チケットの取得に失敗しました: {error}</p>}
      {issueState.issues && rows.length === 0 && <p className="rc-note">表示するチケットがありません。</p>}
      {rows.length > 0 && (
        <GanttChart
          rows={rows}
          fields={fields}
          columns={settings.columns}
          nameColumn={settings.nameColumn}
          freezeAt={settings.freezeAt}
          scale={settings.scale}
          inazuma={settings.inazuma}
          range={settings.range}
          baseDay={baseDay}
          rowStyle={row => resolveRowStyle(row.node, settings)}
          onToggle={toggleNode}
        />
      )}
    </div>
  )
}
