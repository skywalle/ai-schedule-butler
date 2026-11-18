import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import List from './List'
import type { PomoCtl } from './PomoDock'
import type { Item, State } from '../lib/types'

const PLUS = <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>

/* 今日待办页：页内输入回车即添加，不弹面板。
   提交走原生 form：IME 组字中的回车被浏览器吞掉，不会误提交半成品。 */
export default function Today({ items, sort, empMap, deptMap, doneCount, emptyHint, onAdd, onToggle, onEdit, onPomo, pomoId, pomo, onInlineMount, onReorder }: {
  items: Item[]
  sort: State['sort']
  empMap: Map<number, string>
  deptMap: Map<number, string>
  doneCount: number
  emptyHint?: ReactNode
  onAdd: (text: string) => void
  onToggle: (i: Item) => void
  onEdit: (i: Item) => void
  onPomo: (i: Item) => void
  pomoId: number
  pomo: PomoCtl
  onInlineMount: (v: boolean) => void
  onReorder: (fromId: number, toId: number) => void
}) {
  const [text, setText] = useState('')
  const inputEl = useRef<HTMLInputElement>(null)

  const submit = () => {
    const t = text.trim()
    if (!t) return
    onAdd(t)
    setText('')
    inputEl.current?.focus()
  }

  return (
    <div className="todaypage">
      <form className="composer" onSubmit={e => { e.preventDefault(); submit() }}>
        <label className="visually-hidden" htmlFor="today-new">添加今日任务</label>
        <input id="today-new" ref={inputEl} type="text" value={text}
               placeholder="想做点什么？回车直接添加" enterKeyHint="done"
               autoComplete="off" onChange={e => setText(e.target.value)} />
        <button className="addbtn" type="submit" aria-label="添加">{PLUS}</button>
      </form>
      <div className="todaymeta">
        <span>{doneCount + ' / ' + items.length + ' 已完成'}</span>
        <span>可带 重要 紧急 进行中 #关键字，不写日期就记到今天</span>
      </div>
      <div className="listwrap">
        <List items={items} filter="all" sort={sort} empMap={empMap} deptMap={deptMap}
              emptyHint={emptyHint} onToggle={onToggle} onEdit={onEdit}
              onPomo={onPomo} pomoId={pomoId}
              pomo={pomo} onInlineMount={onInlineMount} onReorder={onReorder} />
      </div>
    </div>
  )
}
