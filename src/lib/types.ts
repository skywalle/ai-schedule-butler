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
  titles?: {
    quad?: Record<number, string>
    col?: Record<number, string>
  }
}
