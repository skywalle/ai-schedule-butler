import Tool from '../lib/tool.js'
import { DAY, TODAY, WD, fmtDate, midnight, quadOf, statusOf, tagListOf, wdOf } from '../lib/todo.js'
import { getPomoCount } from '../lib/pomo.js'
import { PomoInline, type PomoCtl } from './PomoDock'
import type { Item } from '../lib/types'

const TOMATO = (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 6.5c0-1.6 1-2.6 2.4-3.1M12 6.5c-.4-1.4-1.8-2-3.2-2.1M12 6.5v1.8" />
  </svg>
)

const CHECK = <svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" /></svg>
const SUN = (
  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
)
const CLOCK = <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>
const PLUS = <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>

/* 一屏规划 7 天：今天起一整周，加一列逾期。 */
const SPAN = 7

/* 列之间的拖放改期，列内拖到某张卡前面换位。
   拖的是「天」，落点是整列而不是卡缝 —— 逾期列不接受落下。 */
function dragCard(item: Item, onReschedule: (id: number, ts: number) => void,
                  onReorder: (fromId: number, toId: number) => void) {
  return (e: React.PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const card = e.currentTarget as HTMLElement
    card.setPointerCapture(e.pointerId)
    Tool.haptic(8)
    const rect = card.getBoundingClientRect()
    const offX = e.clientX - rect.left, offY = e.clientY - rect.top
    const ghost = card.cloneNode(true) as HTMLElement
    ghost.className = card.className + ' ghost'
    ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;z-index:60;pointer-events:none;margin:0;transition:left .08s var(--ease),top .08s var(--ease)`
    document.body.appendChild(ghost)
    card.classList.add('ph')
    let overCol: HTMLElement | null = null
    let before: HTMLElement | null = null
    let raf = 0
    let lastX = 0, lastY = 0
    const paintMarker = () => {
      document.querySelectorAll('.pcol.over').forEach(c => c.classList.remove('over'))
      document.querySelectorAll('.pcard.before').forEach(c => c.classList.remove('before'))
      overCol?.classList.add('over')
      before?.classList.add('before')
    }
    const paintGhost = () => {
      raf = 0
      ghost.style.left = lastX - offX + 'px'
      ghost.style.top = lastY - offY + 'px'
    }
    const move = (ev: PointerEvent) => {
      lastX = ev.clientX; lastY = ev.clientY
      if (!raf) raf = requestAnimationFrame(paintGhost)
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      overCol = el?.closest('.pcol') as HTMLElement | null
      if (overCol && overCol.dataset.due !== 'late') {
        const cards = [...overCol.querySelectorAll('.pcard:not(.ph)')] as HTMLElement[]
        before = cards.find(c => {
          const b = c.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2
        }) || null
      } else {
        before = null
      }
      paintMarker()
    }
    const up = (ev: PointerEvent) => {
      card.removeEventListener('pointermove', move)
      card.removeEventListener('pointerup', up)
      card.removeEventListener('pointercancel', up)
      if (raf) { cancelAnimationFrame(raf); raf = 0 }
      const lastBefore = before
      const lastOver = overCol
      ghost.style.transition = 'left .15s var(--ease),top .15s var(--ease),opacity .15s var(--ease)'
      ghost.style.left = rect.left + 'px'
      ghost.style.top = rect.top + 'px'
      ghost.style.opacity = '0'
      setTimeout(() => ghost.remove(), 160)
      card.classList.remove('ph')
      document.querySelectorAll('.pcol.over').forEach(c => c.classList.remove('over'))
      document.querySelectorAll('.pcard.before').forEach(c => c.classList.remove('before'))
      if (!lastOver || lastOver.dataset.due === 'late') return
      const ns = +lastOver.dataset.due!
      if (ns !== midnight(item.due)) { onReschedule(item.id, ns); Tool.sound.tick() }
      else if (lastBefore) { onReorder(item.id, +lastBefore.dataset.id!); Tool.sound.tick() }
    }
    card.addEventListener('pointermove', move)
    card.addEventListener('pointerup', up)
    card.addEventListener('pointercancel', up)
  }
}

export default function Planner({ items, empMap, deptMap, onToggle, onEdit, onPomo, pomoId, pomo, onInlineMount, onAdd, onReschedule, onReorder }: {
  items: Item[]
  empMap: Map<number, string>
  deptMap: Map<number, string>
  onToggle: (i: Item) => void
  onEdit: (i: Item) => void
  onPomo: (i: Item) => void
  pomoId: number
  pomo: PomoCtl
  onInlineMount: (v: boolean) => void
  onAdd: (due: number) => void
  onReschedule: (id: number, ts: number) => void
  onReorder: (fromId: number, toId: number) => void
}) {
  const drag = (i: Item) => dragCard(i, onReschedule, onReorder)
  /* 逾期列只装未完成的；已完成的逾期是历史，不进规划。 */
  const lateList = items.filter(i => midnight(i.due) < TODAY && statusOf(i) !== 2)
  const dayList = Array.from({ length: SPAN }, (_, k) => TODAY + k * DAY)

  const card = (i: Item, late: boolean) => {
    const who = i.empId ? empMap.get(i.empId) : i.deptId ? deptMap.get(i.deptId) : ''
    const done = statusOf(i) === 2
    return (
      <div key={i.id} className={'kcard pcard' + (done ? ' done' : '')} data-id={i.id}
           onPointerDown={drag(i)}>
        <button className="pbox" type="button" aria-label="完成" title="完成 / 取消完成"
                onClick={e => { e.stopPropagation(); onToggle(i) }}>{CHECK}</button>
        <div className="kb" onClick={() => onEdit(i)}>
          <div className="kt">{i.t}</div>
          {(quadOf(i) !== 4 || who || tagListOf(i).length || late || statusOf(i) === 1) && (
            <div className="meta">
              {quadOf(i) !== 4 ? (
                <i className="qmark" title={['','重要且紧急','重要不紧急','紧急不重要','不重要不紧急'][quadOf(i)]}
                   style={{ background: ['','var(--neg)','var(--accent)','var(--warn)','var(--faint)'][quadOf(i)] }} />
              ) : null}
              {statusOf(i) === 1 ? <span className="tag doing">进行中</span> : null}
              {who ? <span className="tag who">{who}</span> : null}
              {tagListOf(i).map((kw: string) => <span className="tag" key={kw}>{kw}</span>)}
              {late ? <span className="due late">{'逾期 ' + Math.round((TODAY - midnight(i.due)) / DAY) + ' 天'}</span> : null}
            </div>
          )}
        </div>
        <button className={'pomoib' + (pomoId === i.id ? ' on' : '')} type="button"
                title="番茄钟"
                onClick={e => { e.stopPropagation(); onPomo(i) }}>
          {TOMATO}{getPomoCount(i) ? <b>{getPomoCount(i)}</b> : null}
        </button>
        {pomoId === i.id && <PomoInline ctl={pomo} onMount={onInlineMount} />}
      </div>
    )
  }

  return (
    <div className="planner">
      <section className="pcol late" data-due="late">
        <header className="phead">
          <span className="pico late">{CLOCK}</span>
          <b>逾期</b>
          <span className="n">{lateList.length}</span>
        </header>
        <div className="plist">
          {!lateList.length && <div className="kempty">没有逾期任务</div>}
          {lateList.map(i => card(i, true))}
        </div>
      </section>

      {dayList.map(ts => {
        const list = items.filter(i => midnight(i.due) === ts)
        const isToday = ts === TODAY
        return (
          <section key={ts} className={'pcol' + (isToday ? ' today' : '')} data-due={ts}>
            <header className="phead">
              <span className={'pico' + (isToday ? ' sun' : '')}>{SUN}</span>
              <b>{'周' + WD[wdOf(ts)]}</b>
              <span className="pd">{fmtDate(ts).slice(5).replace('-', '/')}</span>
              {isToday ? <i className="ptag">今天</i> : null}
              <span className="n">{list.filter(i => statusOf(i) !== 2).length}</span>
            </header>
            <button className="padd" onClick={() => onAdd(ts)}>{PLUS} 添加</button>
            <div className="plist">
              {!list.length && <div className="kempty">没有任务</div>}
              {list.map(i => card(i, false))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
