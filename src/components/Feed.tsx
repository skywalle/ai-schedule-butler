import { useMemo, useState } from 'react'
import { DAY, TODAY, fmtDayCn, fmtTime, midnight, statusOf, tagListOf } from '../lib/todo.js'
import { gcolor } from './Sidebar'
import type { Emp, Item } from '../lib/types'

const CHECK = <svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" /></svg>
const TOMATO = (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 6.5c0-1.6 1-2.6 2.4-3.1M12 6.5c-.4-1.4-1.8-2-3.2-2.1M12 6.5v1.8" />
  </svg>
)

/* 一条完成动态：谁、哪件、完成当天、完成质量（相对到期日提前/逾期几天）。 */
interface Ev {
  item: Item
  who: string
  empId: number
  day: number
  diff: number
}

/* 头像：姓名首字 + 按名散列的稳定底色，与关键字色同一套色板。 */
function Ava({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <span className="fdava" style={{ width: size, height: size, background: gcolor(name), fontSize: size * .44 }}>
      {name.slice(0, 1)}
    </span>
  )
}

/* 完成质量徽标：提前绿 / 当天 accent / 逾期红 / 未排期灰。 */
function badgeOf(e: Ev) {
  if (Number.isNaN(e.diff)) return <span className="fdb none">未排期</span>
  if (e.diff < 0) return <span className="fdb early">{'提前 ' + -e.diff + ' 天'}</span>
  if (e.diff > 0) return <span className="fdb late">{'逾期 ' + e.diff + ' 天'}</span>
  return <span className="fdb ontime">当天完成</span>
}

/* 完成动态：按天分组的时间线流 + 右侧本周概览与近 7 天完成榜。
   只认带完成时刻的已完成项，新的在最上面。 */
export default function Feed({ items, empList, empMap, deptMap, onEdit }: {
  items: Item[]
  empList: Emp[]
  empMap: Map<number, string>
  deptMap: Map<number, string>
  onEdit: (i: Item) => void
}) {
  const [who, setWho] = useState(0) // 0 = 全部人员

  const evList = useMemo<Ev[]>(() => {
    const list = items.filter(i => statusOf(i) === 2 && i.at).map(i => {
      const who = i.empId ? empMap.get(i.empId) || '未指派'
        : i.deptId ? deptMap.get(i.deptId) || '未指派' : '未指派'
      return { item: i, who, empId: i.empId || 0,
        day: midnight(i.at!), diff: i.due ? (midnight(i.at!) - midnight(i.due)) / DAY : NaN }
    })
    list.sort((a, b) => b.item.at! - a.item.at!)
    return list
  }, [items, empMap, deptMap])

  const shown = useMemo(() => who ? evList.filter(e => e.empId === who) : evList, [evList, who])

  /* 按完成当天分组；evList 已按时刻倒序，Map 插入序即组序。 */
  const dayGroupList = useMemo(() => {
    const m = new Map<number, Ev[]>()
    for (const e of shown) {
      const arr = m.get(e.day) || []
      arr.push(e)
      m.set(e.day, arr)
    }
    return [...m.entries()]
  }, [shown])

  /* 近 7 天完成榜：按人聚合，条长按最高值拉满。 */
  const rankList = useMemo(() => {
    const since = TODAY - 6 * DAY
    const m = new Map<string, number>()
    for (const e of evList) {
      if (e.day < since) continue
      m.set(e.who, (m.get(e.who) || 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [evList])
  const rankMax = Math.max(1, ...rankList.map(r => r[1]))

  /* 本周概览：近 7 天件数、日均、最长连续（往前看 10 周）。 */
  const stat = useMemo(() => {
    const cnt = new Map<number, number>()
    for (const e of evList) cnt.set(e.day, (cnt.get(e.day) || 0) + 1)
    let weekN = 0
    for (let k = 0; k < 7; k++) weekN += cnt.get(TODAY - k * DAY) || 0
    let run = 0, bestN = 0
    for (let k = 70; k >= 0; k--) {
      if (cnt.has(TODAY - k * DAY)) { run++; if (run > bestN) bestN = run } else run = 0
    }
    return { weekN, avg: (weekN / 7).toFixed(1), bestN }
  }, [evList])

  const dayLabel = (d: number) =>
    d === TODAY ? '今天' : d === TODAY - DAY ? '昨天' : fmtDayCn(d)

  if (!evList.length) return (
    <div className="empty">
      {CHECK}
      <div>还没有完成记录。<br />去「清单」勾掉一件事，这里就会出现第一条动态。</div>
    </div>
  )

  return (
    <div className="feed2">
      <div className="feed-main">
        <div className="chiprow feed-filter">
          <button className={'chip' + (!who ? ' on' : '')} onClick={() => setWho(0)}>全部</button>
          {empList.map(e => (
            <button key={e.id} className={'chip' + (who === e.id ? ' on' : '')}
                    onClick={() => setWho(who === e.id ? 0 : e.id)}>{e.n}</button>
          ))}
        </div>

        {!shown.length && <div className="feed-none">这个人还没有完成记录。</div>}

        {dayGroupList.map(([d, list]) => (
          <div key={d}>
            <div className="grouphead feed-dayhead">
              <span>{dayLabel(d)}</span>
              <span className="n">{list.length + ' 件'}</span>
            </div>
            <div className="fdlist">
              {list.map(e => (
                <div className="fdrow" key={e.item.id} onClick={() => onEdit(e.item)}>
                  <Ava name={e.who} />
                  <div className="fdbody">
                    <div className="fdline">
                      <b>{e.who}</b>
                      <span className="fdact">完成了</span>
                      <span className="fdt">{e.item.t}</span>
                      <span className="fdtime">{fmtTime(e.item.at!)}</span>
                    </div>
                    <div className="meta">
                      {badgeOf(e)}
                      {tagListOf(e.item).map((kw: string) => <span className="tag" key={kw}>{kw}</span>)}
                      {e.item.pomo ? (
                        <span className="fdpomo">{TOMATO}{e.item.pomo + ' 个番茄'}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <aside className="feed-side">
        <div className="grouphead"><span>这一周</span></div>
        <div className="wkstat">
          <div><b>{stat.weekN}</b><i>本周完成</i></div>
          <div><b>{stat.avg}</b><i>日均</i></div>
          <div><b>{stat.bestN}</b><i>最长连续</i></div>
        </div>

        <div className="grouphead"><span>近 7 天完成榜</span></div>
        {!rankList.length && <div className="feed-none">近 7 天还没有人完成事项。</div>}
        <div className="fdranks">
          {rankList.map(([name, n]) => (
            <div className="fdrank" key={name}>
              <Ava name={name} size={20} />
              <span className="fdnm">{name}</span>
              <span className="bar"><i style={{ width: (n / rankMax * 100) + '%' }} /></span>
              <span className="v">{n}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
