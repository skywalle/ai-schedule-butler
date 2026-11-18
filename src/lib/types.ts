export interface Item {
  id: number
  t: string
  due: number
  tagList: string[]
  /** 旧版单值分组，仅供 norm 迁移成 tagList 时读取，新代码一律用 tagList。 */
  g?: string
  deptId?: number
  empId?: number
  quad?: 1 | 2 | 3 | 4
  status?: 0 | 1 | 2
  done: boolean
  at?: number
  note?: string
  /** 已完成番茄数。 */
  pomo?: number
}

/** 全局唯一的番茄钟会话：存进整状态，刷新与换标签页可续跑。 */
export interface PomoRun {
  itemId: number
  kind: 'focus' | 'break'
  /** 未暂停时的截止时刻；暂停时以 leftMs 为准。 */
  endAt: number
  leftMs: number
  /** 本链条已完成的专注数：每 4 个来一次长休。 */
  cycle: number
  paused: boolean
}

export interface Dept {
  id: number
  n: string
}

export interface Emp {
  id: number
  n: string
  deptId: number
}

export interface State {
  items: Item[]
  sort: 'manual' | 'due' | 'group'
  nid: number
  deptList?: Dept[]
  empList?: Emp[]
  pomoRun?: PomoRun
  titles?: {
    quad?: Record<number, string>
    col?: Record<number, string>
  }
}
