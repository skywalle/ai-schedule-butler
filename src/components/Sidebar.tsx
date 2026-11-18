import Kit from '../lib/kit.js'
import { statusOf, tagListOf } from '../lib/todo.js'
import type { Item } from '../lib/types'

const ICO = {
  board: <svg viewBox="0 0 24 24"><path d="M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z"/></svg>,
  list: <svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>,
  cal: <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>,
  prog: <svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>,
  team: <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M16 5.2a3 3 0 1 1 0 5.8M17.6 14.8c2 .4 3.1 1.8 3.4 4.2"/></svg>,
  check: <svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg>,
  moon: <svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>,
}
const NAV = [
  { id: 'board', n: '看板' },
  { id: 'list', n: '清单' },
  { id: 'cal', n: '日历' },
  { id: 'prog', n: '进度' },
  { id: 'team', n: '人员' },
]
/* 分组色板：按名字散列取色，同一分组颜色稳定。不用存进数据。 */
const PALETTE = ['#5b8ec4', '#b3402c', '#a97516', '#5b9a7e', '#8d6bb5', '#b5668c', '#4a9e9e']
export const gcolor = (g: string) => {
  let h = 0
  for (const c of g) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export default function Sidebar({ items, view, tag, onNav, onTag, themeHost }: {
  items: Item[]
  view: string
  tag: string
  onNav: (v: string) => void
  onTag: (g: string) => void
  themeHost: React.RefObject<HTMLDivElement | null>
}) {
  const open = items.filter(i => statusOf(i) !== 2).length
  /* 关键字聚合：多关键字的 todo 在每个关键字下都计数。 */
  const tagEntryList = Object.entries(
    items.reduce((m: Record<string, number>, i) => {
      for (const kw of tagListOf(i)) m[kw] = (m[kw] || 0) + 1
      return m
    }, {})
  ).sort((a, b) => b[1] - a[1])

  return (
    <aside className="side">
      <div className="sidebrand">
        <span className="mark">{ICO.check}</span>
        <div>
          <b>AI日程大管家</b>
          <span>任务与日历</span>
        </div>
      </div>

      <nav className="sidenav">
        {NAV.map(v => (
          <button key={v.id} className={'snav' + (view === v.id ? ' on' : '')}
                  onClick={() => onNav(v.id)}>
            {ICO[v.id as keyof typeof ICO]}
            <span>{v.n}</span>
            {v.id === 'list' ? <i className="cnt">{open}</i> : null}
          </button>
        ))}
      </nav>

      <div className="sidegroups">
        <div className="sidelabel">关键字</div>
        <button className={'snav sm' + (!tag ? ' on' : '')} onClick={() => onTag('')}>
          {ICO.check}<span>全部关键字</span><i className="cnt">{items.length}</i>
        </button>
        {tagEntryList.map(([kw, n]) => (
          <button key={kw} className={'snav sm' + (tag === kw ? ' on' : '')}
                  onClick={() => onTag(tag === kw ? '' : kw)}>
            <i className="gdot" style={{ background: gcolor(kw) }} />
            <span>{kw}</span><i className="cnt">{n}</i>
          </button>
        ))}
      </div>

      <div className="sidefoot" ref={themeHost} />
    </aside>
  )
}
