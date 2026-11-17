export interface Item {
  id: number
  t: string
  p: number
  due: number
  g: string
  quad?: 1 | 2 | 3 | 4
  status?: 0 | 1 | 2
  done: boolean
  at?: number
  note?: string
}

export interface State {
  items: Item[]
  sort: 'manual' | 'due' | 'pri' | 'group'
  nid: number
  titles?: {
    quad?: Record<number, string>
    col?: Record<number, string>
  }
}
