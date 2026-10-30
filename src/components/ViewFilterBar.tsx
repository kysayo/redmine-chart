import Select from 'react-select'
import type { FieldDef, RedmineIssue, ViewFilter } from '../types'
import { collectDistinctValues, UNSET_LABEL } from '../utils/fields'

interface Props {
  filters: ViewFilter[]
  fields: FieldDef[]
  issues: RedmineIssue[]
  onChange: (next: ViewFilter[]) => void
}

interface Opt {
  value: string
  label: string
}

let seq = 0
const newId = () => `vf-${Date.now()}-${seq++}`

export default function ViewFilterBar({ filters, fields, issues, onChange }: Props) {
  // フィルタに使えるのは リスト型 と 文字列型 のみ
  const filterable = fields.filter(f => f.kind === 'list' || f.kind === 'string')
  const fieldOptions: Opt[] = filterable.map(f => ({ value: f.key, label: f.name }))

  const update = (id: string, patch: Partial<ViewFilter>) =>
    onChange(filters.map(f => (f.id === id ? { ...f, ...patch } : f)))

  return (
    <div className="rc-filters">
      <span className="rc-label">絞り込み:</span>
      {filters.map(f => {
        const def = filterable.find(d => d.key === f.field)
        const valueOptions: Opt[] =
          def?.kind === 'list'
            ? [UNSET_LABEL, ...collectDistinctValues(issues, f.field)].map(v => ({ value: v, label: v }))
            : []
        return (
          <div key={f.id} className="rc-filter">
            <div className="rc-filter-field">
              <Select<Opt>
                value={fieldOptions.find(o => o.value === f.field) ?? null}
                options={fieldOptions}
                placeholder="項目"
                onChange={o => update(f.id, { field: o?.value ?? '', values: [], text: '' })}
                menuPortalTarget={document.body}
                styles={{ menuPortal: base => ({ ...base, zIndex: 10000 }) }}
              />
            </div>
            <div className="rc-filter-value">
              {def?.kind === 'string' ? (
                <input
                  type="text"
                  value={f.text}
                  placeholder="含むテキスト"
                  onChange={e => update(f.id, { text: e.target.value })}
                />
              ) : (
                <Select<Opt, true>
                  isMulti
                  value={f.values.map(v => ({ value: v, label: v }))}
                  options={valueOptions}
                  placeholder={def ? '値を選択' : '先に項目を選択'}
                  isDisabled={!def}
                  noOptionsMessage={() => '該当なし'}
                  onChange={opts => update(f.id, { values: opts.map(o => o.value) })}
                  menuPortalTarget={document.body}
                  styles={{ menuPortal: base => ({ ...base, zIndex: 10000 }) }}
                />
              )}
            </div>
            <button type="button" className="rc-btn" onClick={() => onChange(filters.filter(x => x.id !== f.id))}>
              ✕
            </button>
          </div>
        )
      })}
      <button
        type="button"
        className="rc-btn"
        onClick={() => onChange([...filters, { id: newId(), field: '', values: [], text: '' }])}
      >
        ＋ 条件を追加
      </button>
      {filters.length > 0 && (
        <button type="button" className="rc-btn" onClick={() => onChange([])}>
          すべてクリア
        </button>
      )}
    </div>
  )
}
