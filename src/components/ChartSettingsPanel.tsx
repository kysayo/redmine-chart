import { useMemo, useState } from 'react'
import Select from 'react-select'
import type {
  ChartSettings,
  ColumnConfig,
  FieldDef,
  GroupingDef,
  HierarchyLevel,
  RangeSettings,
  RedmineIssue,
  RowColorRule,
  TeamPreset,
  TimelineScale,
} from '../types'
import { collectDistinctValues } from '../utils/fields'
import ColorPicker from './ColorPicker'
import GroupingCsvImport from './GroupingCsvImport'
import { DEFAULT_COL_WIDTH, DEFAULT_LABEL_COLORS, toPresetJson } from '../utils/config'
import { STRATEGY_LIST } from '../utils/inazuma/strategies'

interface Props {
  settings: ChartSettings
  onChange: (next: ChartSettings) => void
  fields: FieldDef[]
  issues: RedmineIssue[]
  /** 値の表示名(ユーザー名など)の読み込み回数。変わったら値の一覧を作り直す */
  labelsVersion: number
  statusNames: string[]
  teamPresets: TeamPreset[]
  onApplyTeamPreset: (preset: TeamPreset) => void
  onReset: () => void
}

interface Opt {
  value: string
  label: string
}

let seq = 0
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${seq++}`

const portal = {
  menuPortalTarget: document.body,
  styles: { menuPortal: (base: object) => ({ ...base, zIndex: 10000 }) },
}

function move<T>(arr: T[], index: number, delta: number): T[] {
  const to = index + delta
  if (to < 0 || to >= arr.length) return arr
  const next = [...arr]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

export default function ChartSettingsPanel({
  settings,
  onChange,
  fields,
  issues,
  labelsVersion,
  statusNames,
  teamPresets,
  onApplyTeamPreset,
  onReset,
}: Props) {
  const [presetName, setPresetName] = useState(settings.appliedTeamPreset ?? '設定')

  const fieldOpts: Opt[] = fields.map(f => ({ value: f.key, label: f.name }))
  const listFieldOpts: Opt[] = fields.filter(f => f.kind === 'list').map(f => ({ value: f.key, label: f.name }))
  const fieldName = (key: string) => fields.find(f => f.key === key)?.name ?? key

  const set = (patch: Partial<ChartSettings>) => onChange({ ...settings, ...patch })

  // ===== 階層 =====
  const setLevel = (index: number, level: HierarchyLevel) =>
    set({ levels: settings.levels.map((l, i) => (i === index ? level : l)) })

  const levelsEditor = (
    <section className="rc-sec">
      <h4>階層(上から順に入れ子になります)</h4>
      {settings.levels.map((level, i) => (
        <div key={level.id} className="rc-line">
          <span className="rc-num">{i + 1}</span>
          <select
            value={level.type}
            onChange={e =>
              setLevel(
                i,
                e.target.value === 'children'
                  ? { id: level.id, type: 'children' }
                  : { id: level.id, type: 'field', field: listFieldOpts[0]?.value ?? 'status' },
              )
            }
          >
            <option value="field">項目</option>
            <option value="children">子チケット</option>
          </select>
          {level.type === 'field' && (
            <>
              <div className="rc-grow">
                <Select<Opt>
                  value={fieldOpts.find(o => o.value === level.field) ?? null}
                  options={fieldOpts}
                  onChange={o => setLevel(i, { ...level, field: o?.value ?? level.field, groupingId: undefined })}
                  {...portal}
                />
              </div>
              <select
                value={level.groupingId ?? ''}
                onChange={e => setLevel(i, { ...level, groupingId: e.target.value || undefined })}
              >
                <option value="">グルーピングしない</option>
                {settings.groupings
                  .filter(g => g.field === level.field)
                  .map(g => (
                    <option key={g.id} value={g.id}>グルーピング: {g.name}</option>
                  ))}
              </select>
            </>
          )}
          {level.type === 'children' && i < settings.levels.length - 1 && (
            <span className="rc-warn">※「子チケット」より下の階層は無視されます</span>
          )}
          <button type="button" className="rc-btn" onClick={() => set({ levels: move(settings.levels, i, -1) })}>↑</button>
          <button type="button" className="rc-btn" onClick={() => set({ levels: move(settings.levels, i, 1) })}>↓</button>
          <button type="button" className="rc-btn" onClick={() => set({ levels: settings.levels.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      <button
        type="button"
        className="rc-btn"
        onClick={() =>
          set({ levels: [...settings.levels, { id: uid('lv'), type: 'field', field: listFieldOpts[0]?.value ?? 'status' }] })
        }
      >
        ＋ 階層を追加
      </button>
    </section>
  )

  // ===== グルーピング =====
  const setGrouping = (id: string, patch: Partial<GroupingDef>) =>
    set({ groupings: settings.groupings.map(g => (g.id === id ? { ...g, ...patch } : g)) })

  const groupingsEditor = (
    <section className="rc-sec">
      <h4>グルーピング(多数の値を「会計」などにまとめる)</h4>
      {settings.groupings.map(g => (
        <GroupingEditor
          key={g.id}
          grouping={g}
          listFieldOpts={listFieldOpts}
          issues={issues}
          labelsVersion={labelsVersion}
          fieldName={fieldName}
          onChange={patch => setGrouping(g.id, patch)}
          onDelete={() =>
            set({
              groupings: settings.groupings.filter(x => x.id !== g.id),
              // 削除したグルーピングを参照している階層は「グルーピングしない」に戻す
              levels: settings.levels.map(l =>
                l.type === 'field' && l.groupingId === g.id ? { ...l, groupingId: undefined } : l,
              ),
            })
          }
        />
      ))}
      <GroupingCsvImport
        listFields={fields.filter(f => f.kind === 'list')}
        issues={issues}
        labelsVersion={labelsVersion}
        groupings={settings.groupings}
        onApply={next => set({ groupings: next })}
      />
      <button
        type="button"
        className="rc-btn"
        onClick={() =>
          set({
            groupings: [
              ...settings.groupings,
              {
                id: uid('gr'),
                name: `グルーピング${settings.groupings.length + 1}`,
                field: listFieldOpts[0]?.value ?? 'status',
                groups: [],
                otherLabel: 'その他',
              },
            ],
          })
        }
      >
        ＋ グルーピングを追加
      </button>
    </section>
  )

  // ===== ラベル行(階層の見出し) =====
  const LABEL_COLOR_SLOTS = 6
  const labelPalette = settings.labelColors.length > 0 ? settings.labelColors : DEFAULT_LABEL_COLORS
  const effectiveLabelColors = Array.from(
    { length: LABEL_COLOR_SLOTS },
    (_, i) => labelPalette[i % labelPalette.length],
  )
  const labelEditor = (
    <section className="rc-sec">
      <h4>ラベル行(階層の見出し)</h4>
      <div className="rc-line">
        <span>色(階層の深さ順):</span>
        {effectiveLabelColors.map((c, i) => (
          <span key={i} className="rc-inline">
            {i + 1}
            <ColorPicker
              label={`${i + 1}段目の色`}
              value={c}
              onChange={next => set({ labelColors: effectiveLabelColors.map((v, j) => (j === i ? next : v)) })}
            />
          </span>
        ))}
      </div>
      <div className="rc-line">
        <label>
          <input
            type="checkbox"
            checked={settings.labelRows.parentAsLabel}
            onChange={e => set({ labelRows: { ...settings.labelRows, parentAsLabel: e.target.checked } })}
          />{' '}
          子を持つチケットをラベルとして扱う
        </label>
        <span className="rc-note">
          (オフ: 親チケットも通常のチケット行で、バーを出す / オン: グループと同じ色帯の見出しになり、列は出ない)
        </span>
      </div>
      <div className="rc-line">
        <label>
          <input
            type="checkbox"
            checked={settings.labelRows.showBar}
            onChange={e => set({ labelRows: { ...settings.labelRows, showBar: e.target.checked } })}
          />{' '}
          ラベル行に期間・進捗のバーを表示する
        </label>
        <span className="rc-note">(グループ行と、ラベル扱いの親チケットが対象。進捗は配下のチケットの平均)</span>
      </div>
    </section>
  )

  // ===== 列 =====
  const unselectedColumnOpts = fieldOpts.filter(o => !settings.columns.some(c => c.key === o.value))
  const setColumn = (index: number, patch: Partial<ColumnConfig>) =>
    set({ columns: settings.columns.map((c, i) => (i === index ? { ...c, ...patch } : c)) })

  // 固定の範囲の右端。未設定(undefined)は従来どおり「すべての列を固定」= 最後の列
  const lastKey = settings.columns[settings.columns.length - 1]?.key ?? ''
  const freezeValue = settings.freezeAt ?? lastKey

  const removeColumn = (index: number) => {
    const key = settings.columns[index].key
    const columns = settings.columns.filter((_, i) => i !== index)
    // 固定の右端の列を消したときは、ひとつ前の列(なければ「チケット」列のみ)にする
    const freezeAt = freezeValue === key ? (settings.columns[index - 1]?.key ?? '') : settings.freezeAt
    set({ columns, freezeAt })
  }

  const columnsEditor = (
    <section className="rc-sec">
      <h4>表示する列</h4>
      <p className="rc-note">
        幅の単位は px。「折り返し」にすると全文を表示し、行の高さが内容に合わせて広がります。
        「切替」に同じ数字を入れた列は、見出しの＋/－ボタンで同時に表示・非表示になります。
        「固定」を選んだ列より左は、横スクロールしても常に表示されます。
      </p>
      <div className="rc-line rc-colhead">
        <span className="rc-grow">列</span>
        <span className="rc-c-w">幅</span>
        <span className="rc-c-wrap">折り返し</span>
        <span className="rc-c-grp">切替</span>
        <span className="rc-c-frz">固定</span>
        <span className="rc-c-btn" />
      </div>
      <div className="rc-line">
        <span className="rc-grow">チケット(階層ツリー・常に表示)</span>
        <input
          type="number"
          className="rc-c-w"
          min={30}
          max={800}
          value={settings.nameColumn.width}
          onChange={e => set({ nameColumn: { ...settings.nameColumn, width: Number(e.target.value) } })}
        />
        <span className="rc-c-wrap">
          <input
            type="checkbox"
            checked={settings.nameColumn.wrap}
            onChange={e => set({ nameColumn: { ...settings.nameColumn, wrap: e.target.checked } })}
          />
        </span>
        <span className="rc-c-grp" />
        <span className="rc-c-frz">
          <input type="radio" name="rc-freeze" checked={freezeValue === ''} onChange={() => set({ freezeAt: '' })} />
        </span>
        <span className="rc-c-btn" />
      </div>
      {settings.columns.map((col, i) => (
        <div key={col.key} className="rc-line">
          <span className="rc-grow">{fieldName(col.key)}</span>
          <input
            type="number"
            className="rc-c-w"
            min={30}
            max={800}
            value={col.width}
            onChange={e => setColumn(i, { width: Number(e.target.value) })}
          />
          <span className="rc-c-wrap">
            <input type="checkbox" checked={col.wrap} onChange={e => setColumn(i, { wrap: e.target.checked })} />
          </span>
          <input
            type="number"
            className="rc-c-grp"
            min={1}
            placeholder="-"
            value={col.toggleGroup ?? ''}
            onChange={e => setColumn(i, { toggleGroup: e.target.value === '' ? null : Math.max(1, Math.floor(Number(e.target.value))) })}
          />
          <span className="rc-c-frz">
            <input
              type="radio"
              name="rc-freeze"
              checked={freezeValue === col.key}
              onChange={() => set({ freezeAt: col.key })}
            />
          </span>
          <span className="rc-c-btn">
            <button type="button" className="rc-btn" onClick={() => set({ columns: move(settings.columns, i, -1) })}>↑</button>
            <button type="button" className="rc-btn" onClick={() => set({ columns: move(settings.columns, i, 1) })}>↓</button>
            <button type="button" className="rc-btn" onClick={() => removeColumn(i)}>✕</button>
          </span>
        </div>
      ))}
      <div className="rc-line">
        <div className="rc-grow">
          <Select<Opt>
            value={null}
            options={unselectedColumnOpts}
            placeholder="列を追加…"
            onChange={o =>
              o &&
              set({ columns: [...settings.columns, { key: o.value, width: DEFAULT_COL_WIDTH, wrap: false, toggleGroup: null }] })
            }
            {...portal}
          />
        </div>
      </div>
    </section>
  )

  // ===== ステータス → 進捗率 =====
  const setProgress = (status: string, raw: string) => {
    const next = { ...settings.statusProgress }
    if (raw === '') delete next[status]
    else next[status] = Math.min(100, Math.max(0, Number(raw)))
    set({ statusProgress: next })
  }
  const progressEditor = (
    <section className="rc-sec">
      <h4>ステータス別の進捗率(イナズマ線・バーの塗りに使用)</h4>
      <p className="rc-note">空欄のステータスは「終了系のステータスなら100%、それ以外は0%」になります(チケットの「進捗率」欄は使いません)。</p>
      <div className="rc-grid-2">
        {statusNames.map(name => (
          <label key={name} className="rc-line">
            <span className="rc-grow">{name}</span>
            <input
              type="number"
              min={0}
              max={100}
              step={5}
              value={settings.statusProgress[name] ?? ''}
              onChange={e => setProgress(name, e.target.value)}
            />
            <span>%</span>
          </label>
        ))}
      </div>
    </section>
  )

  // ===== 行の色 =====
  const statusOpts: Opt[] = statusNames.map(n => ({ value: n, label: n }))
  const setRule = (index: number, patch: Partial<RowColorRule>) =>
    set({ rowColors: settings.rowColors.map((r, i) => (i === index ? { ...r, ...patch } : r)) })

  const rowColorEditor = (
    <section className="rc-sec">
      <h4>行の色(ステータス別)</h4>
      <p className="rc-note">
        上のルールから順に判定し、最初に合致したものを適用します。「完了扱い」にチェックを入れると、ステータス名ではなく、
        ステータスの「終了」属性(is_closed)で判定します。
      </p>
      {settings.rowColors.map((rule, i) => (
        <div key={rule.id} className="rc-line rc-top">
          <span className="rc-num">{i + 1}</span>
          <label>
            <input
              type="checkbox"
              checked={rule.useClosed}
              onChange={e => setRule(i, { useClosed: e.target.checked })}
            />{' '}
            完了扱い
          </label>
          <div className="rc-grow">
            <Select<Opt, true>
              isMulti
              isDisabled={rule.useClosed}
              value={rule.statuses.map(s => ({ value: s, label: s }))}
              options={statusOpts}
              placeholder={rule.useClosed ? '(「終了」属性のステータスすべて)' : 'ステータスを選択(複数可)…'}
              closeMenuOnSelect={false}
              onChange={opts => setRule(i, { statuses: opts.map(o => o.value) })}
              {...portal}
            />
          </div>
          <span className="rc-inline">
            背景色 <ColorPicker label="背景色" value={rule.bg} onChange={c => setRule(i, { bg: c })} />
          </span>
          <span className="rc-inline">
            <label>
              <input
                type="checkbox"
                checked={rule.textColor !== ''}
                onChange={e => setRule(i, { textColor: e.target.checked ? '#888888' : '' })}
              />{' '}
              文字色
            </label>
            <ColorPicker
              label="文字色"
              disabled={rule.textColor === ''}
              value={rule.textColor || '#888888'}
              onChange={c => setRule(i, { textColor: c })}
            />
          </span>
          <button type="button" className="rc-btn" onClick={() => set({ rowColors: move(settings.rowColors, i, -1) })}>↑</button>
          <button type="button" className="rc-btn" onClick={() => set({ rowColors: move(settings.rowColors, i, 1) })}>↓</button>
          <button type="button" className="rc-btn" onClick={() => set({ rowColors: settings.rowColors.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      <button
        type="button"
        className="rc-btn"
        onClick={() =>
          set({
            rowColors: [
              ...settings.rowColors,
              { id: uid('rc'), useClosed: true, statuses: [], bg: '#999999', textColor: '#888888' },
            ],
          })
        }
      >
        ＋ ルールを追加
      </button>
    </section>
  )

  // ===== タスクの終了日 =====
  const dateFieldOpts = fields.filter(f => f.kind === 'date' && f.key !== 'due_date')
  const endDateEditor = (
    <section className="rc-sec">
      <h4>タスクの終了日</h4>
      <div className="rc-line">
        <label>
          終了日に使う項目:{' '}
          <select
            value={settings.endDate.field}
            onChange={e => set({ endDate: { ...settings.endDate, field: e.target.value } })}
          >
            <option value="">期日(due_date)</option>
            {dateFieldOpts.map(f => (
              <option key={f.key} value={f.key}>{f.name}</option>
            ))}
          </select>
        </label>
        <span className="rc-note">(バーの右端に使います。無い場合は開始日で代用)</span>
      </div>
      <div className="rc-line">
        <label>
          <input
            type="checkbox"
            checked={settings.endDate.highlightMissing}
            onChange={e => set({ endDate: { ...settings.endDate, highlightMissing: e.target.checked } })}
          />{' '}
          終了日がない場合は行を赤色にする
        </label>
        <span className="rc-note">(行の色ルールに合致した行は、ルールの色が優先されます)</span>
      </div>
    </section>
  )

  // ===== イナズマ線・表示 =====
  const displayEditor = (
    <section className="rc-sec">
      <h4>イナズマ線・表示</h4>
      <div className="rc-line">
        <label>
          <input
            type="checkbox"
            checked={settings.inazuma.enabled}
            onChange={e => set({ inazuma: { ...settings.inazuma, enabled: e.target.checked } })}
          />{' '}
          イナズマ線を表示
        </label>
        <select
          value={settings.inazuma.strategy}
          onChange={e => set({ inazuma: { ...settings.inazuma, strategy: e.target.value as ChartSettings['inazuma']['strategy'] } })}
        >
          {STRATEGY_LIST.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <label>
          基準日:{' '}
          <input
            type="date"
            value={settings.inazuma.baseDate}
            onChange={e => set({ inazuma: { ...settings.inazuma, baseDate: e.target.value } })}
          />
        </label>
        <span className="rc-note">(空欄=今日)</span>
      </div>
      <div className="rc-line">
        <label>
          <input
            type="checkbox"
            checked={settings.inazuma.includeLabels}
            onChange={e => set({ inazuma: { ...settings.inazuma, includeLabels: e.target.checked } })}
          />{' '}
          ラベル行(グループ・ラベル扱いの親)も線で結ぶ
        </label>
        <span className="rc-note">(ラベル行の進捗は配下のチケットの平均。バー付きの親チケットは結びません)</span>
      </div>
      <div className="rc-line">
        <label>
          表示範囲:{' '}
          <select
            value={settings.range.mode}
            onChange={e => set({ range: { ...settings.range, mode: e.target.value as RangeSettings['mode'] } })}
          >
            <option value="auto">自動(チケットの日付に合わせる)</option>
            <option value="relative">今日からの相対</option>
            <option value="fixed">日付を指定</option>
          </select>
        </label>
        {settings.range.mode === 'relative' && (
          <>
            <span>今日の</span>
            <input
              type="number"
              min={0}
              value={settings.range.beforeDays}
              onChange={e => set({ range: { ...settings.range, beforeDays: Number(e.target.value) } })}
            />
            <span>日前から</span>
            <input
              type="number"
              min={0}
              value={settings.range.afterDays}
              onChange={e => set({ range: { ...settings.range, afterDays: Number(e.target.value) } })}
            />
            <span>日後まで</span>
          </>
        )}
        {settings.range.mode === 'fixed' && (
          <>
            <input
              type="date"
              value={settings.range.startDate}
              onChange={e => set({ range: { ...settings.range, startDate: e.target.value } })}
            />
            <span>〜</span>
            <input
              type="date"
              value={settings.range.endDate}
              onChange={e => set({ range: { ...settings.range, endDate: e.target.value } })}
            />
            <span className="rc-note">(空欄の側は自動)</span>
          </>
        )}
      </div>
      <div className="rc-line">
        <label>
          目盛り:{' '}
          <select value={settings.scale} onChange={e => set({ scale: e.target.value as TimelineScale })}>
            <option value="day">日</option>
            <option value="week">週</option>
            <option value="month">月</option>
          </select>
        </label>
      </div>
    </section>
  )

  // ===== プリセット(選択)=====
  // 管理者が data-team-presets で配布したプリセットを、画面で選んで適用する。設定パネルの一番上に置く
  const presetPicker = (
    <section className="rc-sec">
      <h4>プリセット選択</h4>
      <div className="rc-line">
        {teamPresets.map(pr => (
          <button
            key={pr.name}
            type="button"
            className={`rc-btn${settings.appliedTeamPreset === pr.name ? ' rc-btn-on' : ''}`}
            onClick={() => onApplyTeamPreset(pr)}
          >
            {pr.name}
          </button>
        ))}
      </div>
      {settings.appliedTeamPreset && (
        <div className="rc-note">適用中: {settings.appliedTeamPreset}</div>
      )}
    </section>
  )

  // ===== プリセット(出力)=====
  // 姉妹プロジェクト(redmine-graph)と同じ。名前を付けて、改行のない1行の JSON をダウンロードする
  const handleDownloadPresetJson = () => {
    const json = toPresetJson(presetName.trim() || '設定', settings)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'redmine-chart-preset.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const presetOutput = (
    <section className="rc-sec">
      <h4>プリセット出力</h4>
      <div className="rc-line">
        <input
          type="text"
          value={presetName}
          onChange={e => setPresetName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleDownloadPresetJson()
          }}
          placeholder="プリセット名"
        />
        <button type="button" className="rc-btn" onClick={handleDownloadPresetJson}>Preset JSON DL</button>
        <button type="button" className="rc-btn" onClick={onReset}>設定をリセット</button>
      </div>
      <p className="rc-note">
        改行のない1行の JSON をダウンロードします。View Customize の <code>data-team-presets</code> に、
        <code>[</code> この JSON <code>]</code> の形で貼り付けると、全員がプリセットとして使えます。
      </p>
    </section>
  )

  return (
    <div className="rc-settings">
      {teamPresets.length > 0 && presetPicker}
      {presetOutput}
      {levelsEditor}
      {groupingsEditor}
      {labelEditor}
      {columnsEditor}
      {progressEditor}
      {rowColorEditor}
      {endDateEditor}
      {displayEditor}
    </div>
  )
}

// ---------------------------------------------------------------------------

interface GroupingEditorProps {
  grouping: GroupingDef
  listFieldOpts: Opt[]
  issues: RedmineIssue[]
  labelsVersion: number
  fieldName: (key: string) => string
  onChange: (patch: Partial<GroupingDef>) => void
  onDelete: () => void
}

function GroupingEditor({ grouping, listFieldOpts, issues, labelsVersion, fieldName, onChange, onDelete }: GroupingEditorProps) {
  // 取得済みチケットに現れる値 + すでに割り当て済みの値(今は現れない値も保持するため)
  const pool = useMemo(() => {
    const set = new Set(collectDistinctValues(issues, grouping.field))
    grouping.groups.forEach(g => g.values.forEach(v => set.add(v)))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues, labelsVersion, grouping.field, grouping.groups])

  const assigned = new Set(grouping.groups.flatMap(g => g.values))
  const unassignedCount = pool.filter(v => !assigned.has(v)).length

  const setGroup = (index: number, patch: Partial<GroupingDef['groups'][number]>) =>
    onChange({ groups: grouping.groups.map((g, i) => (i === index ? { ...g, ...patch } : g)) })

  // グループ数が多いと縦に長くなるので、内容は既定で閉じておく
  const [open, setOpen] = useState(false)

  return (
    <div className="rc-card">
      <div className="rc-line">
        <button
          type="button"
          className="rc-toggle"
          onClick={() => setOpen(v => !v)}
          aria-label={open ? '内容を折り畳む' : '内容を展開'}
          aria-expanded={open}
        >
          {open ? '▼' : '▶'}
        </button>
        <input
          type="text"
          value={grouping.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="グルーピング名"
        />
        <span>対象項目:</span>
        <div className="rc-grow">
          <Select<Opt>
            value={listFieldOpts.find(o => o.value === grouping.field) ?? { value: grouping.field, label: fieldName(grouping.field) }}
            options={listFieldOpts}
            onChange={o => o && onChange({ field: o.value, groups: [] })}
            {...portal}
          />
        </div>
        <button type="button" className="rc-btn" onClick={onDelete}>このグルーピングを削除</button>
      </div>

      {!open && (
        <div className="rc-note">
          {grouping.groups.length}グループ・割当済みの値 {assigned.size}件・未割当 {unassignedCount}件
        </div>
      )}

      {open && grouping.groups.map((g, i) => {
        const options: Opt[] = pool
          .filter(v => !assigned.has(v) || g.values.includes(v))
          .map(v => ({ value: v, label: v }))
        return (
          <div key={i} className="rc-line rc-top">
            <input
              type="text"
              value={g.name}
              onChange={e => setGroup(i, { name: e.target.value })}
              placeholder="グループ名(例: 会計)"
            />
            <div className="rc-grow">
              <Select<Opt, true>
                isMulti
                value={g.values.map(v => ({ value: v, label: v }))}
                options={options}
                placeholder="含める値を選択…"
                closeMenuOnSelect={false}
                onChange={opts => setGroup(i, { values: opts.map(o => o.value) })}
                {...portal}
              />
            </div>
            <button type="button" className="rc-btn" onClick={() => onChange({ groups: move(grouping.groups, i, -1) })}>↑</button>
            <button type="button" className="rc-btn" onClick={() => onChange({ groups: move(grouping.groups, i, 1) })}>↓</button>
            <button type="button" className="rc-btn" onClick={() => onChange({ groups: grouping.groups.filter((_, j) => j !== i) })}>✕</button>
          </div>
        )
      })}

      {open && (
        <div className="rc-line">
          <button
            type="button"
            className="rc-btn"
            onClick={() => onChange({ groups: [...grouping.groups, { name: `グループ${grouping.groups.length + 1}`, values: [] }] })}
          >
            ＋ グループを追加
          </button>
          <span>未割当の値のまとめ先:</span>
          <input type="text" value={grouping.otherLabel} onChange={e => onChange({ otherLabel: e.target.value })} />
          <span className="rc-note">未割当の値: {unassignedCount}件</span>
        </div>
      )}
    </div>
  )
}
