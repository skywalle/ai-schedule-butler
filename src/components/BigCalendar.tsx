import { useState } from 'react'
import Tool from '../lib/tool.js'
import { DAY, TODAY, WD, dayTs, fmtDate, midnight, quadOf, shYmd, statusOf, tagListOf, wdOf } from '../lib/todo.js'
import type { Item } from '../lib/types'

const GRIP = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01"
          strokeLinecap="round" strokeWidth="2.4" />
  </svg>
)

/* 日历条拖拽：抓起一条任务，拖到别的日期格子松手即改期。
   ghost 浮层跟手，格子实时高亮。 */
function dragStrip(item: Item, onReschedule: (id: number, ts: number) => void) {
  return (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const handle = e.currentTarget
    const strip = handle.closest('.bcstrip') as HTMLElement
    handle.setPointerCapture(e.pointerId)
    Tool.haptic(8)
    const rect = strip.getBoundingClientRect()
    const offX = e.clientX - rect.left, offY = e.clientY - rect.top
    const ghost = strip.cloneNode(true) as HTMLElement
    ghost.className = strip.className + ' ghost'
    ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;z-index:60;pointer-events:none;margin:0;transition:left .08s var(--ease),top .08s var(--ease)`
    document.body.appendChild(ghost)
    strip.classList.add('ph')
    let overCell: HTMLElement | null = null
    let raf = 0
    let lastX = 0, lastY = 0
    const setOver = (el: HTMLElement | null) => {
      if (overCell === el) return
      overCell?.classList.remove('over')
      overCell = el
      overCell?.classList.add('over')
    }
    const paint = () => {
      raf = 0
      ghost.style.left = lastX - offX + 'px'
      ghost.style.top = lastY - offY + 'px'
    }
    const move = (ev: PointerEvent) => {
      lastX = ev.clientX; lastY = ev.clientY
      if (!raf) raf = requestAnimationFrame(paint)
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
        ?.closest('.bccell') as HTMLElement | null
      setOver(el)
    }
    const up = (ev: PointerEvent) => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      if (raf) { cancelAnimationFrame(raf); raf = 0 }
      const cell = document.elementFromPoint(ev.clientX, ev.clientY)
        ?.closest('.bccell') as HTMLElement | null
      setOver(null)
      ghost.style.transition = 'left .15s var(--ease),top .15s var(--ease),opacity .15s var(--ease)'
      ghost.style.left = rect.left + 'px'
      ghost.style.top = rect.top + 'px'
      ghost.style.opacity = '0'
      setTimeout(() => ghost.remove(), 160)
      strip.classList.remove('ph')
      if (cell) {
        const idx = [...document.querySelectorAll('.bccell')].indexOf(cell)
        const ts = daysRef.current[idx]
        if (ts && ts !== midnight(item.due || 0)) {
          onReschedule(item.id, ts)
          Tool.sound.tick()
        }
      }
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }
}
/* 日期面板内的行排序拖拽：上下拖动调整当天任务的顺序。 */
function dragRow(item: Item, onReorder: (fromId: number, toId: number) => void) {
  return (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const handle = e.currentTarget
    const row = handle.closest('.item') as HTMLElement
    handle.setPointerCapture(e.pointerId)
    Tool.haptic(8)
    let marker: HTMLElement | null = null
    const move = (ev: PointerEvent) => {
      const rows = [...document.querySelectorAll('.bcpanel .item')].filter(r => r !== row) as HTMLElement[]
      if (marker) marker.classList.remove('dropbefore')
      marker = rows.find(r => {
        const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2
      }) || null
      if (marker) marker.classList.add('dropbefore')
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      if (marker) {
        marker.classList.remove('dropbefore')
        onReorder(item.id, +marker.dataset.id!)
        Tool.sound.tick()
      }
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
  }
}
/* days 数组在渲染时填充，拖拽回调里通过 ref 取，避免闭包捕获旧值。 */
let daysRef: { current: number[] } = { current: [] }

/* 大日历网格：七列月历，格子内直接排任务条。桌面端全宽，手机上横滑。
   选中某天 → 下方弹层显示当天全部任务。 */
export default function BigCalendar({ items, empMap, deptMap, onEdit, onReschedule, onReorder }: {
  items: Item[]
  empMap: Map<number, string>
  deptMap: Map<number, string>
  onEdit: (i: Item) => void
  onReschedule: (id: number, ts: number) => void
  onReorder: (fromId: number, toId: number) => void
}) {
  /* cur 是上海当月一号的零点时间戳（number），不再用 Date 对象避免本地时区干扰。 */
  const [cur, setCur] = useState(() => { const [y, m] = shYmd(TODAY); return dayTs(y, m, 1) })
  const [sel, setSel] = useState(TODAY)

  const [y, m] = shYmd(cur)
  const start = cur - ((wdOf(cur) + 6) % 7) * DAY   // 网格从当月首个周一拉起
  const days: number[] = []
  for (let k = 0; k < 42; k++) days.push(start + k * DAY)
  daysRef.current = days

  const onDay = (ts: number) => items
    .filter(i => i.due && midnight(i.due) === ts)
    .sort((a, b) => statusOf(a) - statusOf(b) || quadOf(a) - quadOf(b))
  const todayList = onDay(sel)
  const other = todayList.filter(i => statusOf(i) !== 2)
  const thisM = (ts: number) => shYmd(ts)[1] === m

  return (
    <div className="bigcal">
      <div className="bchead">
        <b>{y + ' 年 ' + (m + 1) + ' 月'}</b>
        <span className="spacer" />
        <button className="miniib" onClick={() => setCur(dayTs(y, m - 1, 1))}>‹</button>
        <button className="chip" onClick={() => { const [ty, tm] = shYmd(TODAY); setCur(dayTs(ty, tm, 1)); setSel(TODAY) }}>今天</button>
        <button className="miniib" onClick={() => setCur(dayTs(y, m + 1, 1))}>›</button>
      </div>

      <div className="bcgridwrap">
        <div className="bcgrid">
          {WD.map((w, k) => <div className="bcwd" key={k}>{w}</div>)}
          {days.map(ts => {
            const list = onDay(ts)
            const over = list.filter(i => statusOf(i) !== 2).length
            return (
              <div key={ts}
                   className={'bccell' + (ts === TODAY ? ' today' : '') + (ts === sel ? ' sel' : '') + (!thisM(ts) ? ' out' : '')}
                   onClick={() => setSel(ts)}>
                <div className="bcd">{shYmd(ts)[2]}</div>
                <div className="bcs">
                  {list.slice(0, 3).map(i => (
                    <div key={i.id} className={'bcstrip' + (statusOf(i) === 2 ? ' done' : '')}>
                      <button className="bcstrip-txt" onClick={e => { e.stopPropagation(); onEdit(i) }}>
                        {i.t}
                      </button>
                      <span className="grip" title="拖到别的日期改期"
                            onPointerDown={dragStrip(i, onReschedule)}>{GRIP}</span>
                    </div>
                  ))}
                  {list.length > 3 ? <div className="bcmore">+{list.length - 3} 项</div> : null}
                </div>
                {over > 0 ? <i className="bcbadge">{over}</i> : null}
              </div>
            )
          })}
        </div>
      </div>

      <div className="bcpanel">
        <div className="bcphead">
          <b>{fmtDate(sel)}</b>
          <span className="spacer" />
          <span className="n">{other.length ? other.length + ' 件待办' : '这一天没有待办'}</span>
        </div>
        {todayList.map(i => {
          const who = i.empId ? empMap.get(i.empId) : i.deptId ? deptMap.get(i.deptId) : ''
          return (
          <div key={i.id} className={'item' + (statusOf(i) === 2 ? ' done' : '')} data-id={i.id}>
            <div className="body" onClick={() => onEdit(i)}>
              <div className="txt">{i.t}</div>
              <div className="meta">
                <span className="tag">{['待完成', '进行中', '已完成'][statusOf(i)]}</span>
                {who ? <span className="tag who">{who}</span> : null}
                {tagListOf(i).map((kw: string) => <span className="tag" key={kw}>{kw}</span>)}
              </div>
            </div>
            <div className="handle" title="拖动排序"
                 onPointerDown={dragRow(i, onReorder)}>{GRIP}</div>
          </div>
          )
        })}
      </div>
    </div>
  )
}
