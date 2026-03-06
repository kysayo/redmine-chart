import type { DataGroup, DataItem } from 'vis-timeline'

export const dummyGroups: DataGroup[] = [
  {
    id: 'g-p1',
    content: '#46043 保守高度化施策',
    nestedGroups: ['g-c1', 'g-c2', 'g-c3'],
    showNested: true,
  },
  { id: 'g-c1', content: '#46044 WFの通知機能' },
  { id: 'g-c2', content: '#46045 BP申請機能' },
  { id: 'g-c3', content: '#46049 保守チケット完了' },
  {
    id: 'g-p2',
    content: '#46050 別の親チケット',
    nestedGroups: ['g-c4'],
    showNested: true,
  },
  { id: 'g-c4', content: '#46051 子チケット' },
]

export const dummyItems: DataItem[] = [
  { id: 'i-p1', group: 'g-p1', content: '', start: '2026-03-01', end: '2026-04-07', type: 'range' },
  { id: 'i-c1', group: 'g-c1', content: '', start: '2026-03-02', end: '2026-03-14', type: 'range' },
  { id: 'i-c2', group: 'g-c2', content: '', start: '2026-03-02', end: '2026-03-31', type: 'range' },
  // g-c3 は日付なしのため items に含めない
  { id: 'i-c4', group: 'g-c4', content: '', start: '2026-03-15', end: '2026-03-31', type: 'range' },
]
