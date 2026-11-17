import { DAY, TODAY, midnight, statusOf } from '../lib/todo.js'
import { best, counts, recent } from '../lib/heat.js'
import Heat from './Heat'
import type { Item } from '../lib/types'

export default function Progress({ items, onClear, onExportCSV, onExportPoster }: {
  items: Item[]
  onClear?: () => void
  onExportCSV?: () => void
  onExportPoster?: () => void
}) {
  const s0 = items.filter(i => statusOf(i) === 0).length
  const s1 = items.filter(i => statusOf(i) === 1).length
  const s2 = items.filter(i => statusOf(i) === 2).length
  const late = items.filter(i => statusOf(i) !== 2 && i.due && midnight(i.due) < TODAY).length

  const week: { d: number; n: number }[] = []
  for (let k = 6; k >= 0; k--) {
    const d = TODAY - k * DAY
    week.push({ d, n: items.filter(i => i.done && i.at && midnight(i.at) === d).length })
  }
  const max = Math.max(1, ...week.map(w => w.n))

  const c = counts(items)
  const groups = Object.entries(
    items.reduce((m: Record<string, { n: number; d: number }>, i) => {
      const g = m[i.g] || (m[i.g] = { n: 0, d: 0 }); g.n++; if (i.done) g.d++
      return m
    }, {})
  ).sort((a, b) => b[1].n - a[1].n)

  return (
    <div className="prog2">
      {/* 左侧主内容：热力 + 周统计 + 分组进度 */}
      <div className="prog-main">
        <div className="prog-note">历史记录为示例数据 · 今日完成实时更新</div>
        <Heat items={items} />
        <div className="grouphead"><span>这一周</span></div>
        <div className="wkstat">
          <div><b>{recent(c, 7)}</b><i>本周完成</i></div>
          <div><b>{(recent(c, 28) / 28).toFixed(1)}</b><i>日均</i></div>
          <div><b>{best(c)}</b><i>最长连续</i></div>
        </div>

        <div className="grouphead"><span>按分组</span><b>{items.filter(i => statusOf(i) !== 2 && i.due && midnight(i.due) <= TODAY + DAY * 7).length + ' 件待办在一周内'}</b></div>
        <div className="glist">
          {groups.map(([g, v]) => (
            <div className="grow" key={g}>
              <span className="nm">{g}</span>
              <span className="bar"><i style={{ width: (v.d / v.n * 100) + '%' }} /></span>
              <span className="v">{v.d + '/' + v.n}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧统计栏 */}
      <aside className="prog-side">
        <div className="pstats2">
          <div><div className="n">{items.length}</div><div className="l">全部</div></div>
          <div><div className="n">{s0 + s1}</div><div className="l">未完成</div></div>
          <div><div className="n">{s2}</div><div className="l">已完成</div></div>
          <div><div className="n" style={late ? { color: 'var(--neg)' } : undefined}>{late}</div><div className="l">逾期</div></div>
        </div>

        <div className="grouphead"><span>近 7 天完成</span></div>
        <div className="weekbar">
          {week.map(w => (
            <div className="d" key={w.d}>
              <div className="b" style={{ height: (w.n / max * 58 + 2) + 'px' }} />
              <div className="l">{'日一二三四五六'[new Date(w.d).getDay()]}</div>
            </div>
          ))}
        </div>

        <div className="grouphead"><span>按分组</span></div>
        <div className="pgroups2">
          {groups.map(([g, v]) => (
            <div className="pgroup" key={g}>
              <div className="pgt">
                <span className="pgn">{g}</span>
                <span className="pgv">{v.d + ' / ' + v.n + ' 已完成'}</span>
              </div>
              <div className="pgbar"><i style={{ width: (v.d / v.n * 100) + '%' }} /></div>
            </div>
          ))}
        </div>

        <div className="pactions">
          {onClear && <button className="btn" onClick={onClear}>清理已完成</button>}
          {onExportCSV && <button className="btn" onClick={onExportCSV}>导出 CSV</button>}
          {onExportPoster && <button className="btn" onClick={onExportPoster}>导出海报</button>}
          <button className="btn" onClick={() => window.print()}>打印 / PDF</button>
        </div>
      </aside>
    </div>
  )
}
