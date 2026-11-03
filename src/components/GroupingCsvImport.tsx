import { useMemo, useRef, useState } from 'react'
import type { FieldDef, GroupingDef, RedmineIssue } from '../types'
import { buildGroupingsFromCsv, decodeCsv, parseCsv, type CsvGroupingResult } from '../utils/csvGrouping'
import { collectDistinctValues } from '../utils/fields'

interface Props {
  /** グルーピングの対象にできる項目(リスト型) */
  listFields: FieldDef[]
  issues: RedmineIssue[]
  /** 値の表示名(ユーザー名など)の読み込み回数。変わったら突き合わせを作り直す */
  labelsVersion: number
  groupings: GroupingDef[]
  onApply: (next: GroupingDef[]) => void
}

let seq = 0
const uid = () => `gr-${Date.now().toString(36)}-${seq++}`

/** 未分類の値のまとめ先。「その他」という名前のグループが CSV にあっても混ざらないようにする */
const OTHER_LABEL = '(未分類)'

export default function GroupingCsvImport({ listFields, issues, labelsVersion, groupings, onApply }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<CsvGroupingResult | null>(null)
  const [fieldKey, setFieldKey] = useState('')
  const [error, setError] = useState('')

  const handleFile = async (file: File) => {
    setError('')
    setResult(null)
    try {
      const parsed = buildGroupingsFromCsv(parseCsv(decodeCsv(await file.arrayBuffer())))
      if (!parsed) {
        setError('CSV を読み取れませんでした。1列目に項目の値、2列目以降にグループ名を入れ、1行目にヘッダーを付けてください。')
        return
      }
      setFileName(file.name)
      setResult(parsed)
      // ヘッダー1列目の名前と一致する項目があれば自動で選ぶ
      const header = parsed.fieldHeader.toLowerCase()
      const hit = listFields.find(f => f.name.toLowerCase() === header || f.key.toLowerCase() === header)
      setFieldKey(hit?.key ?? '')
    } catch {
      setError('CSV の読み込みに失敗しました。')
    }
  }

  // チケット側の値との突き合わせ(CSV の値がチケットの選択肢と一致しているかの確認用)
  const match = useMemo(() => {
    if (!result || !fieldKey) return null
    const csvValues = new Set(result.drafts[0]?.groups.flatMap(g => g.values) ?? [])
    // 1列目の全値は drafts のどれかに入っているとは限らないため、全ドラフトの和集合を取る
    result.drafts.forEach(d => d.groups.forEach(g => g.values.forEach(v => csvValues.add(v))))
    const ticketValues = collectDistinctValues(issues, fieldKey)
    const ticketSet = new Set(ticketValues)
    return {
      ticketTotal: ticketValues.length,
      matched: ticketValues.filter(v => csvValues.has(v)).length,
      ticketOnly: ticketValues.filter(v => !csvValues.has(v)),
      csvOnly: Array.from(csvValues).filter(v => !ticketSet.has(v)).length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, fieldKey, issues, labelsVersion])

  const close = () => {
    setResult(null)
    setFileName('')
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const apply = () => {
    if (!result || !fieldKey) return
    const next = [...groupings]
    for (const draft of result.drafts) {
      const built: Omit<GroupingDef, 'id'> = {
        name: draft.name,
        field: fieldKey,
        groups: draft.groups,
        otherLabel: OTHER_LABEL,
      }
      // 同じ名前・同じ項目のグルーピングは置き換える(階層からの参照を保つため id は維持)
      const idx = next.findIndex(g => g.name === draft.name && g.field === fieldKey)
      if (idx >= 0) next[idx] = { ...built, id: next[idx].id }
      else next.push({ ...built, id: uid() })
    }
    onApply(next)
    close()
  }

  return (
    <div className="rc-line rc-top">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
        }}
      />
      <button type="button" className="rc-btn" onClick={() => inputRef.current?.click()}>
        CSV から取り込み
      </button>
      <span className="rc-note">1列目=項目の値 / 2列目以降=グルーピング(ヘッダーが名前、セルがグループ名)。UTF-8・Shift-JIS 対応</span>
      {error && <span className="rc-error">{error}</span>}

      {result && (
        <div className="rc-card" style={{ width: '100%' }}>
          <div>
            <strong>{fileName}</strong>: 値 {result.valueCount}件 → グルーピング {result.drafts.length}件
            {result.drafts.map(d => (
              <span key={d.name}> ・{d.name}({d.groups.length}グループ)</span>
            ))}
          </div>
          <div className="rc-line">
            <span>対象項目:</span>
            <select value={fieldKey} onChange={e => setFieldKey(e.target.value)}>
              <option value="">選択してください</option>
              {listFields.map(f => (
                <option key={f.key} value={f.key}>{f.name}</option>
              ))}
            </select>
            <span className="rc-note">(CSV のヘッダー: {result.fieldHeader})</span>
          </div>

          {match && (
            <p className="rc-note">
              チケットに現れる値 {match.ticketTotal}件のうち {match.matched}件が CSV と一致。
              {match.ticketOnly.length > 0 && (
                <span className="rc-warn">
                  {' '}CSV に無い値が {match.ticketOnly.length}件あり、「{OTHER_LABEL}」になります
                  {match.ticketOnly.length <= 5 ? `(${match.ticketOnly.join(' / ')})` : `(例: ${match.ticketOnly.slice(0, 3).join(' / ')} ほか)`}。
                </span>
              )}
              {match.csvOnly > 0 && ` 取得済みのチケットに無い CSV の値: ${match.csvOnly}件(そのまま保持します)。`}
            </p>
          )}
          {result.conflicts.length > 0 && (
            <p className="rc-warn">
              矛盾 {result.conflicts.length}件: {result.conflicts.slice(0, 3).join(' / ')}
              {result.conflicts.length > 3 && ' ほか'}
            </p>
          )}
          {result.skippedRows > 0 && <p className="rc-note">1列目が空の {result.skippedRows}行を読み飛ばしました。</p>}
          {result.drafts.some(d => groupings.some(g => g.name === d.name && g.field === fieldKey)) && (
            <p className="rc-note">同じ名前・同じ項目のグルーピングは置き換えます。</p>
          )}

          <div className="rc-line">
            <button type="button" className="rc-btn rc-btn-on" disabled={!fieldKey} onClick={apply}>取り込む</button>
            <button type="button" className="rc-btn" onClick={close}>キャンセル</button>
          </div>
        </div>
      )}
    </div>
  )
}
