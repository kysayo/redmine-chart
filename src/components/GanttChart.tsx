import { useEffect, useRef } from 'react'
import { Timeline } from 'vis-timeline/standalone'
import { DataSet } from 'vis-data/standalone'
import type { DataGroup, DataItem, TimelineOptions } from 'vis-timeline'
import { computeDateRange } from '../utils/redmine'

interface Props {
  groups: DataGroup[]
  items: DataItem[]
}

export default function GanttChart({ groups, items }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<Timeline | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const { start, end } = computeDateRange(items)
    const options: TimelineOptions = {
      type: 'range',
      orientation: { axis: 'top' },
      stack: false,
      groupOrder: 'id',
      start,
      end,
    }

    if (timelineRef.current) {
      timelineRef.current.setGroups(new DataSet(groups))
      timelineRef.current.setItems(new DataSet(items))
      return
    }

    timelineRef.current = new Timeline(
      containerRef.current,
      new DataSet(items),
      new DataSet(groups),
      options,
    )

    return () => {
      timelineRef.current?.destroy()
      timelineRef.current = null
    }
  }, [groups, items])

  return <div ref={containerRef} style={{ overflowX: 'auto' }} />
}
