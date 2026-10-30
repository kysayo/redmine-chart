import { useMemo, useState } from 'react'
import Select from 'react-select'
import type {
  ChartSettings,
  FieldDef,
  GroupingDef,
  HierarchyLevel,
  RangeSettings,
  RedmineIssue,
  TeamPreset,
  TimelineScale,
} from '../types'
import { collectDistinctValues } from '../utils/fields'
import { toPresetJson } from '../utils/config'
import { STRATEGY_LIST } from '../utils/inazuma/strategies'

interface Props {
  settings: ChartSettings
  onChange: (next: ChartSettings) => void
  fields: FieldDef[]
  issues: RedmineIssue[]
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
  statusNames,
  teamPresets,
  onApplyTeamPreset,
  onReset,
}: Props) {
  const [presetName, setPresetName] = useState(settings.appliedTeamPreset ?? 'preset')
  const [presetJson, setPresetJson] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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

  // ===== 列 =====
  const unselectedColumnOpts = fieldOpts.filter(o => !settings.columns.includes(o.value))
  const columnsEditor = (
    <section className="rc-sec">
      <h4>表示する列</h4>
      {settings.columns.map((key, i) => (
        <div key={key} className="rc-line">
          <span className="rc-grow">{fieldName(key)}</span>
          <button type="button" className="rc-btn" onClick={() => set({ columns: move(settings.columns, i, -1) })}>↑</button>
          <button type="button" className="rc-btn" onClick={() => set({ columns: move(settings.columns, i, 1) })}>↓</button>
          <button type="button" className="rc-btn" onClick={() => set({ columns: settings.columns.filter(c => c !== key) })}>✕</button>
        </div>
      ))}
      <div className="rc-line">
        <div className="rc-grow">
          <Select<Opt>
            value={null}
            options={unselectedColumnOpts}
            placeholder="列を追加…"
            onChange={o => o && set({ columns: [...settings.columns, o.value] })}
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
      <p className="rc-note">空欄のステータスは「終了済みなら100%、それ以外はチケットの進捗率」になります。</p>
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

  // ===== プリセット =====
  const presetEditor = (
    <section className="rc-sec">
      <h4>プリセット</h4>
      {teamPresets.length > 0 && (
        <div className="rc-line">
          <span>チームプリセット:</span>
          {teamPresets.map(p => (
            <button
              key={p.name}
              type="button"
              className={`rc-btn${settings.appliedTeamPreset === p.name ? ' rc-btn-on' : ''}`}
              onClick={() => onApplyTeamPreset(p)}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      <div className="rc-line">
        <input type="text" value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="プリセット名" />
        <button
          type="button"
          className="rc-btn"
          onClick={() => {
            setPresetJson(toPresetJson(presetName || 'preset', settings))
            setCopied(false)
          }}
        >
          Preset JSON を出力
        </button>
        <button type="button" className="rc-btn" onClick={onReset}>設定をリセット</button>
      </div>
      {presetJson != null && (
        <div>
          <p className="rc-note">
            View Customize の <code>data-team-presets</code> に <code>[</code> この JSON <code>]</code> の形で貼り付けると、全員がプリセットとして使えます。
          </p>
          <textarea className="rc-json" readOnly value={presetJson} rows={12} onFocus={e => e.currentTarget.select()} />
          <div className="rc-line">
            <button
              type="button"
              className="rc-btn"
              onClick={() => {
                void navigator.clipboard.writeText(presetJson).then(() => setCopied(true))
              }}
            >
              {copied ? 'コピーしました' : 'コピー'}
            </button>
            <button
              type="button"
              className="rc-btn"
              onClick={() => {
                const blob = new Blob([presetJson], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'redmine-chart-preset.json'
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              ダウンロード
            </button>
            <button type="button" className="rc-btn" onClick={() => setPresetJson(null)}>閉じる</button>
          </div>
        </div>
      )}
    </section>
  )

  return (
    <div className="rc-settings">
      {levelsEditor}
      {groupingsEditor}
      {columnsEditor}
      {progressEditor}
      {displayEditor}
      {presetEditor}
    </div>
  )
}

// ---------------------------------------------------------------------------

interface GroupingEditorProps {
  grouping: GroupingDef
  listFieldOpts: Opt[]
  issues: RedmineIssue[]
  fieldName: (key: string) => string
  onChange: (patch: Partial<GroupingDef>) => void
  onDelete: () => void
}

function GroupingEditor({ grouping, listFieldOpts, issues, fieldName, onChange, onDelete }: GroupingEditorProps) {
  // 取得済みチケットに現れる値 + すでに割り当て済みの値(今は現れない値も保持するため)
  const pool = useMemo(() => {
    const set = new Set(collectDistinctValues(issues, grouping.field))
    grouping.groups.forEach(g => g.values.forEach(v => set.add(v)))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }))
  }, [issues, grouping.field, grouping.groups])

  const assigned = new Set(grouping.groups.flatMap(g => g.values))
  const unassignedCount = pool.filter(v => !assigned.has(v)).length

  const setGroup = (index: number, patch: Partial<GroupingDef['groups'][number]>) =>
    onChange({ groups: grouping.groups.map((g, i) => (i === index ? { ...g, ...patch } : g)) })

  return (
    <div className="rc-card">
      <div className="rc-line">
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

      {grouping.groups.map((g, i) => {
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
    </div>
  )
}
