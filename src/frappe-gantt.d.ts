declare module 'frappe-gantt' {
  export interface Task {
    id: string
    name: string
    start: string
    end: string
    progress: number
    dependencies?: string
    custom_class?: string
  }

  export interface GanttOptions {
    view_mode?: string
    date_format?: string
    language?: string
    on_click?: (task: Task) => void
    on_date_change?: (task: Task, start: Date, end: Date) => void
    on_progress_change?: (task: Task, progress: number) => void
    on_view_change?: (mode: string) => void
    popup_trigger?: string
    custom_popup_html?: ((task: Task) => string) | null
    bar_height?: number
    padding?: number
    view_modes?: string[]
    header_height?: number
    column_width?: number
    step?: number
    snap_at?: string
    scroll_to?: string
    lines?: string
    auto_move_label?: boolean
    today_button?: boolean
    edit_mode?: boolean
    infinite_padding?: boolean
    readonly?: boolean
    move_dependencies?: boolean
    container_height?: number
  }

  export default class Gantt {
    constructor(wrapper: HTMLElement | string, tasks: Task[], options?: GanttOptions)
    change_view_mode(mode?: string): void
    refresh(tasks: Task[]): void
    destroy(): void
  }
}
