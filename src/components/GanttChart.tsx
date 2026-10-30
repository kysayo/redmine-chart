import { useMemo } from 'react'
import type { FieldDef, GanttRow, InazumaSettings, TimelineScale } from '../types'
import { dayOfWeek, dayParts, formatDay, monthStart, todayDay } from '../utils/dateUtils'
import { getFieldValue } from '../utils/fields'
import { buildInazumaPolyline } from '../utils/inazuma/compute'
import { STRATEGIES } from '../utils/inazuma/strategies'

const ROW_H = 26
const HEAD_H = 40
const NAME_W = 300
const COL_W = 100
const PX_PER_DAY: Record<TimelineScale, number> = { day: 24, week: 9, month: 3 }

interface Props {
  rows: GanttRow[]
  fields: FieldDef[]
  columns: string[]
  scale: TimelineScale
  inazuma: InazumaSettings
  baseDay: number
  onToggle: (nodeId: string) => void
}

interface MonthSeg {
  from: number
  to: number // 排他
  label: string
}

function computeRange(rows: GanttRow[], extraDays: number[]): { minDay: number; maxDay: number } {
  const days = [...extraDays]
  for (const r of rows) {
    if (r.node.start != null) days.push(r.node.start)
    if (r.node.end != null) days.push(r.node.end)
  }
  const lo = Math.min(...days) - 7
  const hi = Math.max(...days) + 14
  // 週の頭(月曜)に揃える
  const minDay = lo - ((dayOfWeek(lo) + 6) % 7)
  return { minDay, maxDay: hi }
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

export default function GanttChart({ rows, fields, columns, scale, inazuma, baseDay, onToggle }: Props) {
  const px = PX_PER_DAY[scale]
  const today = todayDay()

  const { minDay, maxDay } = useMemo(() => computeRange(rows, [today, baseDay]), [rows, today, baseDay])
  const monthSegs = useMemo(() => buildMonthSegments(minDay, maxDay), [minDay, maxDay])

  const fieldName = (key: string) => fields.find(f => f.key === key)?.name ?? key
  const leftW = NAME_W + COL_W * columns.length
  const days = maxDay - minDay + 1
  const timeW = days * px
  const bodyH = rows.length * ROW_H
  const x = (day: number) => (day - minDay) * px

  const inazumaLine = useMemo(() => {
    if (!inazuma.enabled) return ''
    const strategy = STRATEGIES[inazuma.strategy]
    if (!strategy) return ''
    const points = strategy.computePoints(rows, { baseDay })
    return buildInazumaPolyline(
      points,
      (baseDay - minDay) * px + px / 2,
      px,
      i => i * ROW_H + ROW_H / 2,
      0,
      bodyH,
    )
  }, [inazuma, rows, baseDay, minDay, px, bodyH])

  // 週末の網掛け(日・週スケール)
  const weekendDays: number[] = []
  if (scale !== 'month') {
    for (let d = minDay; d <= maxDay; d++) {
      const w = dayOfWeek(d)
      if (w === 0 || w === 6) weekendDays.push(d)
    }
  }

  return (
    <div className="rc-scroll">
      <div className="rc-inner" style={{ width: leftW + timeW }}>
        {/* ヘッダ */}
        <div className="rc-head" style={{ height: HEAD_H }}>
          <div className="rc-left rc-left-head" style={{ width: leftW }}>
            <div className="rc-cell rc-name" style={{ width: NAME_W }}>チケット</div>
            {columns.map(c => (
              <div key={c} className="rc-cell" style={{ width: COL_W }}>{fieldName(c)}</div>
            ))}
          </div>
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
          {rows.map(row => (
            <div key={row.node.id} className="rc-row" style={{ height: ROW_H }}>
              <div className="rc-left" style={{ width: leftW }}>
                <div className="rc-cell rc-name" style={{ width: NAME_W, paddingLeft: 4 + row.node.depth * 16 }}>
                  {row.hasChildren ? (
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
                  )}
                  {row.node.kind === 'issue' && row.node.issue ? (
                    <a href={`/issues/${row.node.issue.id}`} target="_blank" rel="noopener noreferrer" title={row.node.label}>
                      <span className="rc-id">#{row.node.issue.id}</span> {row.node.label}
                    </a>
                  ) : (
                    <span className="rc-group-label" title={row.node.label}>
                      {row.node.label}
                      <span className="rc-meta">
                        {' '}({row.node.issueCount}件・{Math.round(row.node.progress)}%)
                      </span>
                    </span>
                  )}
                </div>
                {columns.map(c => (
                  <div key={c} className="rc-cell" style={{ width: COL_W }} title={row.node.issue ? getFieldValue(row.node.issue, c) : ''}>
                    {row.node.issue ? getFieldValue(row.node.issue, c) : ''}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <svg className="rc-overlay" style={{ left: leftW }} width={timeW} height={bodyH}>
            {weekendDays.map(d => (
              <rect key={d} x={x(d)} y={0} width={px} height={bodyH} className="rc-weekend" />
            ))}
            {monthSegs.map(s => (
              <line key={s.from} x1={x(s.from)} x2={x(s.from)} y1={0} y2={bodyH} className="rc-grid" />
            ))}
            {rows.map((_, i) => (
              <line key={i} x1={0} x2={timeW} y1={(i + 1) * ROW_H} y2={(i + 1) * ROW_H} className="rc-grid-h" />
            ))}

            {/* 今日 */}
            <line x1={x(today) + px / 2} x2={x(today) + px / 2} y1={0} y2={bodyH} className="rc-today" />

            {/* バー */}
            {rows.map((row, i) => {
              const { node } = row
              if (node.start == null || node.end == null) return null
              const bx = x(node.start)
              const bw = (node.end - node.start + 1) * px
              const isGroup = node.kind === 'group'
              const isParent = node.kind === 'issue' && row.hasChildren
              const h = isGroup ? 6 : isParent ? 8 : 12
              const y = i * ROW_H + (ROW_H - h) / 2
              const cls = isGroup ? 'rc-bar-group' : isParent ? 'rc-bar-parent' : 'rc-bar'
              const tip = node.issue
                ? `#${node.issue.id} ${node.label}\n${formatDay(node.start)} 〜 ${formatDay(node.end)}\n進捗 ${Math.round(node.progress)}%`
                : `${node.label}\n${formatDay(node.start)} 〜 ${formatDay(node.end)}\n進捗 ${Math.round(node.progress)}%`
              return (
                <g key={node.id} className="rc-bar-wrap">
                  <title>{tip}</title>
                  <rect x={bx} y={y} width={bw} height={h} rx={2} className={`${cls} rc-bar-bg`} />
                  <rect x={bx} y={y} width={(bw * node.progress) / 100} height={h} rx={2} className={`${cls} rc-bar-fill`} />
                </g>
              )
            })}

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
  )
}
