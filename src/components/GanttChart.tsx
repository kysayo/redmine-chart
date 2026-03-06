import { useEffect, useRef } from 'react'
import Gantt from 'frappe-gantt'
import '../styles/frappe-gantt.css'
import type { GanttTask } from '../utils/dummyData'

interface Props {
  tasks: GanttTask[]
}

export default function GanttChart({ tasks }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const ganttRef = useRef<Gantt | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    if (ganttRef.current) {
      ganttRef.current.refresh(tasks)
      return
    }

    ganttRef.current = new Gantt(containerRef.current, tasks, {
      view_mode: 'Week',
      language: 'ja',
    })

    return () => {
      ganttRef.current = null
    }
  }, [tasks])

  return <div ref={containerRef} style={{ overflowX: 'auto' }} />
}
