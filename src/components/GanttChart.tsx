import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ColumnConfig,
  FieldDef,
  GanttRow,
  InazumaSettings,
  LabelRowSettings,
  NameColumnConfig,
  RangeSettings,
  TimelineScale,
} from '../types'
import { dayOfWeek, dayParts, formatDay, monthStart, parseDay, todayDay } from '../utils/dateUtils'
import { getFieldValue } from '../utils/fields'
import { buildInazumaPolyline } from '../utils/inazuma/compute'
import { STRATEGIES } from '../utils/inazuma/strategies'
import { DEFAULT_LABEL_COLORS } from '../utils/config'
import { mixWithWhite, type RowStyle } from '../utils/rowStyle'

/** 行の最小の高さ。折り返しのある行はこれより高くなる */
const ROW_H = 26
const HEAD_H = 40
/** 畳んだ列グループの目印(＋ボタン)の幅 */
const PLACEHOLDER_W = 26
/** ラベル行の色帯1本の幅(階層が1つ深くなるごとに左へ積む) */
const BAND_W = 20
/** ラベル行のタイムライン側の色の濃さ(ラベル色の割合。残りは白) */
const TIMELINE_TINT = 0.55
const PX_PER_DAY: Record<TimelineScale, number> = { day: 24, week: 9, month: 3 }

interface Props {
  rows: GanttRow[]
  fields: FieldDef[]
  columns: ColumnConfig[]
  nameColumn: NameColumnConfig
  /** 固定する範囲の右端の列のキー。''=「チケット」列のみ、undefined=すべて固定 */
  freezeAt: string | undefined
  scale: TimelineScale
  inazuma: InazumaSettings
  range: RangeSettings
  baseDay: number
  /** 行の色(ステータス別ルールなど)。色なしは null */
  rowStyle: (row: GanttRow) => RowStyle | null
  labelRows: LabelRowSettings
  labelColors: string[]
  onToggle: (nodeId: string) => void
}

interface MonthSeg {
  from: number
  to: number // 排他
  label: string
}

/** 左の表に並べる列。表示切替グループが畳まれている間は、先頭の列の位置に目印だけを置く */
interface ColLayout {
  kind: 'data' | 'placeholder'
  key: string
  width: number
  wrap: boolean
  /** placeholder のとき、展開するグループ */
  group: number | null
  /** data のとき、この列の見出しに「－」ボタンを出すグループ(グループの先頭の列のみ) */
  minusGroup: number | null
  frozen: boolean
}

/** 表示する日付範囲(day number)を決める。範囲外のバーは見切れる */
function computeRange(
  rows: GanttRow[],
  range: RangeSettings,
  today: number,
  baseDay: number,
): { minDay: number; maxDay: number } {
  if (range.mode === 'relative') {
    const before = Math.max(0, Math.floor(range.beforeDays))
    const after = Math.max(0, Math.floor(range.afterDays))
    return { minDay: today - before, maxDay: today + after }
  }

  // 自動: チケットの日付 + 今日 + 基準日が収まる範囲。週の頭(月曜)に揃える
  const days = [today, baseDay]
  for (const r of rows) {
    if (r.node.start != null) days.push(r.node.start)
    if (r.node.end != null) days.push(r.node.end)
  }
  const lo = Math.min(...days) - 7
  const auto = { minDay: lo - ((dayOfWeek(lo) + 6) % 7), maxDay: Math.max(...days) + 14 }

  if (range.mode === 'fixed') {
    // 空欄(または不正)の側は自動と同じ
    const minDay = parseDay(range.startDate) ?? auto.minDay
    const maxDay = parseDay(range.endDate) ?? auto.maxDay
    return maxDay >= minDay ? { minDay, maxDay } : auto
  }
  return auto
}

function buildMonthSegments(minDay: number, maxDay: number): MonthSeg[] {
  const segs: MonthSeg[] = []
  let cursor = monthStart(minDay)
  while (cursor <= maxDay) {
    const next = monthStart(cursor + 31)
    const { y, m } = dayParts(cursor)
    segs.push({ from: Math.max(cursor, minDay), to: Math.min(next, maxDay + 1), label: `${y}/${m}` })
    cursor = next
  }
  return segs
}

export default function GanttChart({
  rows,
  fields,
  columns,
  nameColumn,
  freezeAt,
  scale,
  inazuma,
  range,
  baseDay,
  rowStyle,
  labelRows,
  labelColors,
  onToggle,
}: Props) {
  const px = PX_PER_DAY[scale]
  const today = todayDay()

  const wrapRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const stickyRef = useRef<HTMLDivElement>(null)
  const navLeftRef = useRef<HTMLButtonElement>(null)
  const navRightRef = useRef<HTMLButtonElement>(null)
  const rowEls = useRef(new Map<string, HTMLDivElement>())

  // 画面上部に追従させる親行(rows のインデックス。上位の階層から順)
  const [stickyIdx, setStickyIdx] = useState<number[]>([])
  // 畳まれている列の表示切替グループ(個人の表示状態。設定には保存しない)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set())
  // 各行の実測の高さ(折り返しで行が高くなるため)。キーは行ノードの id
  const [heights, setHeights] = useState<Record<string, number>>({})

  const { minDay, maxDay } = useMemo(
    () => computeRange(rows, range, today, baseDay),
    [rows, range, today, baseDay],
  )
  const monthSegs = useMemo(() => buildMonthSegments(minDay, maxDay), [minDay, maxDay])

  // ===== 列の配置 =====
  const layouts = useMemo<ColLayout[]>(() => {
    const freezeIdx = freezeAt === undefined ? columns.length - 1 : columns.findIndex(c => c.key === freezeAt)
    const seen = new Set<number>()
    const result: ColLayout[] = []
    columns.forEach((c, idx) => {
      const frozen = idx <= freezeIdx
      const g = c.toggleGroup
      if (g == null) {
        result.push({ kind: 'data', key: c.key, width: c.width, wrap: c.wrap, group: null, minusGroup: null, frozen })
        return
      }
      const first = !seen.has(g)
      seen.add(g)
      if (collapsedGroups.has(g)) {
        if (first) {
          result.push({ kind: 'placeholder', key: `ph-${g}`, width: PLACEHOLDER_W, wrap: false, group: g, minusGroup: null, frozen })
        }
        return
      }
      result.push({ kind: 'data', key: c.key, width: c.width, wrap: c.wrap, group: g, minusGroup: first ? g : null, frozen })
    })
    return result
  }, [columns, freezeAt, collapsedGroups])

  const frozenCols = layouts.filter(c => c.frozen)
  const scrollCols = layouts.filter(c => !c.frozen)
  const frozenW = nameColumn.width + frozenCols.reduce((s, c) => s + c.width, 0)
  const scrollW = scrollCols.reduce((s, c) => s + c.width, 0)
  const leftW = frozenW + scrollW

  const toggleGroup = (g: number) =>
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })

  const fieldName = (key: string) => fields.find(f => f.key === key)?.name ?? key
  const days = maxDay - minDay + 1
  const timeW = days * px
  const x = (day: number) => (day - minDay) * px

  // ===== 行の高さ・位置 =====
  const rowHeights = useMemo(() => rows.map(r => Math.max(ROW_H, heights[r.node.id] ?? ROW_H)), [rows, heights])
  const rowTops = useMemo(() => {
    const tops: number[] = [0]
    rowHeights.forEach(h => tops.push(tops[tops.length - 1] + h))
    return tops
  }, [rowHeights])
  const bodyH = rowTops[rowTops.length - 1]

  // 行の高さを実測する。折り返し・列幅の変更で高さが変わったときも ResizeObserver が拾う
  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      setHeights(prev => {
        let next = prev
        for (const e of entries) {
          const el = e.target as HTMLElement
          const id = el.dataset.rowId
          if (!id) continue
          const h = Math.round(el.offsetHeight)
          if (prev[id] !== h) {
            if (next === prev) next = { ...prev }
            next[id] = h
          }
        }
        return next
      })
    })
    rowEls.current.forEach(el => ro.observe(el))
    return () => ro.disconnect()
  }, [rows])

  // 各行の上の罫線の種類。ラベルの範囲の境(ラベル行の上、ラベル行の直後、範囲を抜けた行の上)は濃い実線、
  // 同じグループ内のチケット間は薄い破線
  const topKinds = useMemo<Array<'none' | 'dark' | 'dash'>>(
    () =>
      rows.map((row, i) => {
        if (i === 0) return 'none'
        const prev = rows[i - 1]
        return row.isLabel || prev.isLabel || row.labelDepth < prev.labelDepth ? 'dark' : 'dash'
      }),
    [rows],
  )

  // ラベル行の色(深さ順。足りない分は先頭から繰り返す)
  const labelColor = (depth: number) => {
    const palette = labelColors.length > 0 ? labelColors : DEFAULT_LABEL_COLORS
    return palette[depth % palette.length]
  }

  const inazumaLine = useMemo(() => {
    if (!inazuma.enabled) return ''
    const strategy = STRATEGIES[inazuma.strategy]
    if (!strategy) return ''
    const points = strategy.computePoints(rows, {
      baseDay,
      includeLabels: inazuma.includeLabels,
      onTrackStatuses: inazuma.onTrackStatuses ?? [],
      onTrackLatePercent: inazuma.onTrackLatePercent ?? 10,
    })
    return buildInazumaPolyline(
      points,
      (baseDay - minDay) * px + px / 2,
      px,
      i => rowTops[i] + rowHeights[i] / 2,
      0,
      bodyH,
      0,
      timeW,
    )
  }, [inazuma, rows, baseDay, minDay, px, bodyH, timeW, rowTops, rowHeights])


  // 各行の親行のインデックス(深さの連なりから求める)。-1 は親なし
  const parentIdx = useMemo(() => {
    const stack: number[] = []
    return rows.map((r, i) => {
      const d = r.node.depth
      stack.length = d
      const parent = d > 0 ? (stack[d - 1] ?? -1) : -1
      stack[d] = i
      return parent
    })
  }, [rows])

  // ページのスクロールに合わせて、見出し・親階層の追従行・左右の移動ボタンを更新する
  useEffect(() => {
    const ancestorsOf = (idx: number): number[] => {
      const chain: number[] = []
      for (let p = parentIdx[idx]; p != null && p >= 0; p = parentIdx[p]) chain.unshift(p)
      return chain
    }
    // y(チャート本体の上端からの距離)にある行のインデックス
    const rowIndexAt = (y: number): number => {
      let lo = 0
      let hi = rows.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (rowTops[mid] <= y) lo = mid
        else hi = mid - 1
      }
      return lo
    }

    const update = () => {
      const inner = innerRef.current
      if (!inner) return
      // 見出しがビューポート上端に固定されたときの、チャート上端からのずれ(px)
      const sy = Math.min(Math.max(0, -inner.getBoundingClientRect().top), bodyH)
      const t = `translateY(${sy}px)`
      if (headRef.current) headRef.current.style.transform = t
      if (stickyRef.current) stickyRef.current.style.transform = t

      // 追従行を除いた先頭の行 → その親を追従させる。追従行の高さで先頭が変わるので収束するまで繰り返す
      let chain: number[] = []
      if (sy > 0 && rows.length > 0) {
        for (let n = 0; n < 5; n++) {
          const covered = chain.reduce((s, r) => s + rowHeights[r], 0)
          const next = ancestorsOf(rowIndexAt(sy + covered))
          const stable = next.length === chain.length
          chain = next
          if (stable) break
        }
      }
      setStickyIdx(prev =>
        prev.length === chain.length && prev.every((v, i) => v === chain[i]) ? prev : chain,
      )

      // 左右の移動ボタン: 画面に見えている部分の縦の中央に置く。端まで来たら隠す
      const wrap = wrapRef.current
      const scroll = scrollRef.current
      if (wrap && scroll) {
        const r = wrap.getBoundingClientRect()
        const visTop = Math.max(r.top, 0)
        const visBottom = Math.min(r.bottom, window.innerHeight)
        const center = visBottom > visTop ? (visTop + visBottom) / 2 - r.top : r.height / 2
        const canLeft = scroll.scrollLeft > 1
        const canRight = scroll.scrollLeft + scroll.clientWidth < scroll.scrollWidth - 1
        if (navLeftRef.current) {
          navLeftRef.current.style.top = `${center}px`
          navLeftRef.current.style.display = canLeft ? '' : 'none'
        }
        if (navRightRef.current) {
          navRightRef.current.style.top = `${center}px`
          navRightRef.current.style.display = canRight ? '' : 'none'
        }
      }
    }

    // どの要素がスクロールしても拾えるよう capture で購読する
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    const raf = requestAnimationFrame(update)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [rows, parentIdx, bodyH, rowTops, rowHeights, leftW, timeW])

  const scrollByPage = (dir: -1 | 1) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(200, (el.clientWidth - frozenW) * 0.8), behavior: 'smooth' })
  }

  // 週末の網掛け(日・週スケール)
  const weekendDays: number[] = []
  if (scale !== 'month') {
    for (let d = minDay; d <= maxDay; d++) {
      const w = dayOfWeek(d)
      if (w === 0 || w === 6) weekendDays.push(d)
    }
  }

  // ===== 描画部品 =====
  const renderHeadCell = (c: ColLayout) =>
    c.kind === 'placeholder' ? (
      <div key={c.key} className="rc-cell rc-ph" style={{ width: c.width }}>
        <button
          type="button"
          className="rc-gtoggle"
          title={`列グループ ${c.group} を表示`}
          onClick={() => c.group != null && toggleGroup(c.group)}
        >
          ＋
        </button>
      </div>
    ) : (
      <div key={c.key} className="rc-cell" style={{ width: c.width }} title={fieldName(c.key)}>
        {c.minusGroup != null && (
          <button
            type="button"
            className="rc-gtoggle"
            title={`列グループ ${c.minusGroup} を非表示`}
            onClick={() => toggleGroup(c.minusGroup!)}
          >
            －
          </button>
        )}
        {fieldName(c.key)}
      </div>
    )

  const renderBodyCell = (row: GanttRow, c: ColLayout) =>
    c.kind === 'placeholder' ? (
      <div key={c.key} className="rc-cell rc-ph" style={{ width: c.width }} />
    ) : (
      <div
        key={c.key}
        className={`rc-cell${c.wrap ? ' rc-wrap-cell' : ''}`}
        style={{ width: c.width }}
        title={row.node.issue ? getFieldValue(row.node.issue, c.key) : ''}
      >
        {row.node.issue ? getFieldValue(row.node.issue, c.key) : ''}
      </div>
    )

  // 折り畳み(▶/▼)ボタン。子が無い行は同じ幅の空きを置く
  const renderToggle = (row: GanttRow) =>
    row.hasChildren ? (
      <button
        type="button"
        className="rc-toggle"
        onClick={() => onToggle(row.node.id)}
        aria-label={row.collapsed ? '展開' : '折り畳み'}
      >
        {row.collapsed ? '▶' : '▼'}
      </button>
    ) : (
      <span className="rc-toggle-space" />
    )

  // 左の表の1行分(固定部分 + スクロール部分)。tint=false は追従行(背景色は固定)
  const renderLeft = (row: GanttRow, tint = true) => {
    // 祖先のラベル行の色帯。下の階層の行が続く間、同じ色で縦につながる
    const bandsW = row.labelDepth * BAND_W
    const bands = Array.from({ length: row.labelDepth }, (_, k) => (
      <div key={k} className="rc-band" style={{ width: BAND_W, background: labelColor(k) }} />
    ))

    // ラベル行(グループ・ラベル扱いの親チケット): 列は出さず、右端まで同じ色で塗る
    if (row.isLabel) {
      const color = labelColor(row.labelDepth)
      const issue = row.node.issue
      return (
        <>
          <div className="rc-left" style={{ width: frozenW }}>
            {bands}
            <div
              className={`rc-labelcell${scrollCols.length === 0 ? ' rc-edge' : ''}`}
              style={{ width: Math.max(0, frozenW - bandsW), background: color }}
            >
              {renderToggle(row)}
              {issue ? (
                <a href={`/issues/${issue.id}`} target="_blank" rel="noopener noreferrer" title={row.node.label}>
                  <span className="rc-id">#{issue.id}</span> {row.node.label}
                </a>
              ) : (
                <span title={row.node.label}>{row.node.label}</span>
              )}
              <span className="rc-meta">
                {' '}({issue ? row.node.issueCount - 1 : row.node.issueCount}件・{Math.round(row.progress)}%)
              </span>
            </div>
          </div>
          {scrollCols.length > 0 && <div className="rc-lscroll rc-edge" style={{ width: scrollW, background: color }} />}
        </>
      )
    }

    const style = tint ? rowStyle(row) : null
    // 横スクロール時に背面が透けないよう、固定部分は白の上に色を重ねる
    const tintImage = style ? { backgroundImage: `linear-gradient(${style.bg}, ${style.bg})`, color: style.text } : {}
    return (
      <>
        <div
          className="rc-left"
          style={{ width: frozenW, ...(style ? { backgroundColor: '#fff', ...tintImage } : {}) }}
        >
          {bands}
          <div
            className={`rc-cell rc-name${nameColumn.wrap ? ' rc-wrap-cell' : ''}`}
            style={{ width: Math.max(60, nameColumn.width - bandsW), paddingLeft: 4 + row.plainDepth * 16 }}
          >
            {renderToggle(row)}
            {row.node.issue && (
              <a
                href={`/issues/${row.node.issue.id}`}
                target="_blank"
                rel="noopener noreferrer"
                title={row.node.label}
                style={style?.text ? { color: style.text } : undefined}
              >
                <span className="rc-id">#{row.node.issue.id}</span> {row.node.label}
              </a>
            )}
          </div>
          {frozenCols.map(c => renderBodyCell(row, c))}
        </div>
        {scrollCols.length > 0 && (
          <div className="rc-lscroll" style={{ width: scrollW, ...tintImage }}>
            {scrollCols.map(c => renderBodyCell(row, c))}
          </div>
        )}
      </>
    )
  }

  // 1行分のバー。rowTop はその行の上端の y 座標、rowHeight はその行の高さ
  const renderBar = (row: GanttRow, rowTop: number, rowHeight: number) => {
    const { node } = row
    if (node.start == null || node.end == null) return null
    // ラベル行のバーは設定で出し分ける(ラベルとして完全に扱うときは出さない)
    if (row.isLabel && !labelRows.showBar) return null
    const bx = x(node.start)
    const bw = (node.end - node.start + 1) * px
    const isGroup = node.kind === 'group'
    const isParent = node.kind === 'issue' && row.hasChildren
    const h = isGroup ? 6 : isParent ? 8 : 12
    const y = rowTop + (rowHeight - h) / 2
    const cls = isGroup ? 'rc-bar-group' : isParent ? 'rc-bar-parent' : 'rc-bar'
    const tip = node.issue
      ? `#${node.issue.id} ${node.label}\n${formatDay(node.start)} 〜 ${formatDay(node.end)}\n進捗 ${Math.round(row.progress)}%`
      : `${node.label}\n${formatDay(node.start)} 〜 ${formatDay(node.end)}\n進捗 ${Math.round(row.progress)}%`
    return (
      <g key={node.id} className="rc-bar-wrap">
        <title>{tip}</title>
        <rect x={bx} y={y} width={bw} height={h} rx={2} className={`${cls} rc-bar-bg`} />
        <rect x={bx} y={y} width={(bw * row.progress) / 100} height={h} rx={2} className={`${cls} rc-bar-fill`} />
      </g>
    )
  }

  return (
    <div ref={wrapRef} className="rc-wrap">
      <div ref={scrollRef} className="rc-scroll">
        <div ref={innerRef} className="rc-inner" style={{ width: leftW + timeW }}>
          {/* ヘッダ(ページのスクロールに追従: transform は ref 経由で更新) */}
          <div ref={headRef} className="rc-head" style={{ height: HEAD_H }}>
            <div className="rc-left rc-left-head" style={{ width: frozenW }}>
              <div className="rc-cell rc-name" style={{ width: nameColumn.width }}>チケット</div>
              {frozenCols.map(renderHeadCell)}
            </div>
            {scrollCols.length > 0 && (
              <div className="rc-lscroll rc-left-head" style={{ width: scrollW }}>
                {scrollCols.map(renderHeadCell)}
              </div>
            )}
            <svg width={timeW} height={HEAD_H} className="rc-head-svg">
              {monthSegs.map(s => (
                <g key={s.from}>
                  <rect x={x(s.from)} y={0} width={(s.to - s.from) * px} height={HEAD_H / 2} className="rc-head-month" />
                  <text x={x(s.from) + 4} y={14} className="rc-head-text">{s.label}</text>
                </g>
              ))}
              {scale === 'day' &&
                Array.from({ length: days }, (_, i) => minDay + i).map(d => {
                  const w = dayOfWeek(d)
                  return (
                    <text
                      key={d}
                      x={x(d) + px / 2}
                      y={34}
                      textAnchor="middle"
                      className={`rc-head-text rc-head-day${w === 0 ? ' rc-sun' : w === 6 ? ' rc-sat' : ''}`}
                    >
                      {dayParts(d).d}
                    </text>
                  )
                })}
              {scale === 'week' &&
                Array.from({ length: days }, (_, i) => minDay + i)
                  .filter(d => dayOfWeek(d) === 1)
                  .map(d => (
                    <g key={d}>
                      <line x1={x(d)} x2={x(d)} y1={HEAD_H / 2} y2={HEAD_H} className="rc-grid" />
                      <text x={x(d) + 2} y={34} className="rc-head-text rc-head-day">
                        {dayParts(d).m}/{dayParts(d).d}
                      </text>
                    </g>
                  ))}
            </svg>
          </div>

          {/* 本体 */}
          <div className="rc-body" style={{ height: bodyH }}>
            {rows.map((row, i) => (
              <div
                key={row.node.id}
                data-row-id={row.node.id}
                ref={el => {
                  if (el) rowEls.current.set(row.node.id, el)
                  else rowEls.current.delete(row.node.id)
                }}
                className={`rc-row${topKinds[i] === 'dark' ? ' rc-top-dark' : topKinds[i] === 'dash' ? ' rc-top-dash' : ''}${
                  i === rows.length - 1 ? ' rc-last' : ''
                }`}
                style={{ minHeight: ROW_H }}
              >
                {renderLeft(row)}
              </div>
            ))}

            {/* 画面上部に追従する親階層の行(スクロール位置は ref 経由で更新) */}
            <div ref={stickyRef} className="rc-sticky" style={{ width: leftW + timeW }}>
              {stickyIdx.map(ri => {
                const row = rows[ri]
                if (!row) return null
                const h = rowHeights[ri]
                return (
                  <div key={row.node.id} className="rc-row rc-sticky-row" style={{ height: h }}>
                    {renderLeft(row, false)}
                    <svg
                      width={timeW}
                      height={h}
                      className="rc-sticky-svg"
                      style={row.isLabel ? { background: mixWithWhite(labelColor(row.labelDepth), TIMELINE_TINT) } : undefined}
                    >
                      {renderBar(row, 0, h)}
                    </svg>
                  </div>
                )
              })}
            </div>

            <svg className="rc-overlay" style={{ left: leftW }} width={timeW} height={bodyH}>
              {/* 土日の網掛け。行の色より下に描くので、ラベル行は土日でもラベルの色になる */}
              {weekendDays.map(d => (
                <rect key={d} x={x(d)} y={0} width={px} height={bodyH} className="rc-weekend" />
              ))}
              {/* 行の色(左の表と同じ色を右側にも敷く)。ラベル行は階層の色を薄くしたもの(不透明) */}
              {rows.map((row, i) => {
                const fill = row.isLabel
                  ? mixWithWhite(labelColor(row.labelDepth), TIMELINE_TINT)
                  : rowStyle(row)?.bg
                return fill ? (
                  <rect key={row.node.id} x={0} y={rowTops[i]} width={timeW} height={rowHeights[i]} fill={fill} />
                ) : null
              })}
              {monthSegs.map(s => (
                <line key={s.from} x1={x(s.from)} x2={x(s.from)} y1={0} y2={bodyH} className="rc-grid" />
              ))}
              {/* 行の区切り線: ラベルの範囲の境は濃い実線、同じグループ内のチケット間は薄い破線 */}
              {rows.map((row, i) =>
                topKinds[i] === 'none' ? null : (
                  <line
                    key={row.node.id}
                    x1={0}
                    x2={timeW}
                    y1={rowTops[i] + 0.5}
                    y2={rowTops[i] + 0.5}
                    className={topKinds[i] === 'dark' ? 'rc-line-dark' : 'rc-line-dash'}
                  />
                ),
              )}
              <line x1={0} x2={timeW} y1={bodyH - 0.5} y2={bodyH - 0.5} className="rc-line-dark" />

              {/* 今日 */}
              <line x1={x(today) + px / 2} x2={x(today) + px / 2} y1={0} y2={bodyH} className="rc-today" />

              {/* バー */}
              {rows.map((row, i) => renderBar(row, rowTops[i], rowHeights[i]))}

              {/* イナズマ線 */}
              {inazuma.enabled && (
                <>
                  <line
                    x1={(baseDay - minDay) * px + px / 2}
                    x2={(baseDay - minDay) * px + px / 2}
                    y1={0}
                    y2={bodyH}
                    className="rc-base"
                  />
                  {inazumaLine && <polyline points={inazumaLine} className="rc-inazuma" />}
                </>
              )}
            </svg>
          </div>
        </div>
      </div>

      {/* 左右にスクロールするボタン(画面に見えている部分の縦の中央。位置は ref 経由で更新) */}
      <button
        ref={navLeftRef}
        type="button"
        className="rc-nav rc-nav-left"
        style={{ left: frozenW + 4, display: 'none' }}
        aria-label="左へスクロール"
        onClick={() => scrollByPage(-1)}
      >
        ＜
      </button>
      <button
        ref={navRightRef}
        type="button"
        className="rc-nav rc-nav-right"
        style={{ display: 'none' }}
        aria-label="右へスクロール"
        onClick={() => scrollByPage(1)}
      >
        ＞
      </button>
    </div>
  )
}
