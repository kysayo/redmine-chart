export interface GanttTask {
  id: string
  name: string
  start: string
  end: string
  progress: number
  dependencies?: string
}

export const dummyTasks: GanttTask[] = [
  {
    id: '1',
    name: '要件定義',
    start: '2026-03-01',
    end: '2026-03-07',
    progress: 100,
  },
  {
    id: '2',
    name: '基本設計',
    start: '2026-03-05',
    end: '2026-03-14',
    progress: 60,
    dependencies: '1',
  },
  {
    id: '3',
    name: '詳細設計',
    start: '2026-03-10',
    end: '2026-03-20',
    progress: 30,
    dependencies: '2',
  },
  {
    id: '4',
    name: '実装',
    start: '2026-03-15',
    end: '2026-03-31',
    progress: 10,
    dependencies: '3',
  },
  {
    id: '5',
    name: 'テスト',
    start: '2026-03-25',
    end: '2026-04-07',
    progress: 0,
    dependencies: '4',
  },
]
