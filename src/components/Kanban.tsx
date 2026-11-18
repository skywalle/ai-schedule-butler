import Tool from '../lib/tool.js'
import { STATUSES, TODAY, dueText, midnight, statusOf, tagListOf } from '../lib/todo.js'
import { getPomoCount } from '../lib/pomo.js'
import { PomoInline, type PomoCtl } from './PomoDock'
import type { Item, State } from '../lib/types'

const TOMATO = (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 6.5c0-1.6 1-2.6 2.4-3.1M12 6.5c-.4-1.4-1.8-2-3.2-2.1M12 6.5v1.8" />
  </svg>
)
const GRIP = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01"
          strokeLinecap="round" strokeWidth="2.4" />
  </svg>
)
const PEN = <svg viewBox="0 0 24 24"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
const CYCLE = ['●', '◐', '✓']
const CTIP = ['待完成 → 进行中', '进行中 → 已完成', '已完成 → 待完成']

function dragCard(item: Item, onStatus: (id: number, s: number) => void,
                  onReorder: (fromId: number, toId: number) => void) {
  return (e: React.PointerEvent<HTMLElement>) => {
    /* 点按钮和输入框时不触发拖拽，其余区域按住即可拖。 */
    if ((e.target as HTMLElement).closest('button, input, .qacts, .kb')) return
    e.preventDefault()
    const card = e.currentTarget as HTMLElement
    card.setPointerCapture(e.pointerId)
    Tool.haptic(8)
    const rect = card.getBoundingClientRect()
    const offX = e.clientX - rect.left, offY = e.clientY - rect.top
    /* ghost 浮层跟手。rAF 节流 + 短 transition，避免累积卡顿。 */
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
      document.querySelectorAll('.kcol.over').forEach(c => c.classList.remove('over'))
      document.querySelectorAll('.kcard.before').forEach(c => c.classList.remove('before'))
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
      overCol = el?.closest('.kcol') as HTMLElement | null
      if (overCol && +overCol.dataset.s! === statusOf(item)) {
        const cards = [...overCol.querySelectorAll('.kcard:not(.ph)')] as HTMLElement[]
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
      /* 松手时 ghost 快速滑回原位再消失。 */
      ghost.style.transition = 'left .15s var(--ease),top .15s var(--ease),opacity .15s var(--ease)'
      ghost.style.left = rect.left + 'px'
      ghost.style.top = rect.top + 'px'
      ghost.style.opacity = '0'
      setTimeout(() => ghost.remove(), 160)
      card.classList.remove('ph')
      document.querySelectorAll('.kcol.over').forEach(c => c.classList.remove('over'))
      document.querySelectorAll('.kcard.before').forEach(c => c.classList.remove('before'))
      if (!lastOver) return
      const ns = +lastOver.dataset.s!
      if (ns !== statusOf(item)) { onStatus(item.id, ns); Tool.sound.tick() }
      else if (lastBefore) { onReorder(item.id, +lastBefore.dataset.id!); Tool.sound.tick() }
    }
    card.addEventListener('pointermove', move)
    card.addEventListener('pointerup', up)
    card.addEventListener('pointercancel', up)
  }
}

export default function Kanban({ items, titles, empMap, deptMap, onStatus, onEdit, onPomo, pomoId, pomo, onInlineMount, onReorder, onRename, onAdd }: {
  items: Item[]
  titles: State['titles']
  empMap: Map<number, string>
  deptMap: Map<number, string>
  onStatus: (id: number, s: number) => void
  onEdit: (i: Item) => void
  onPomo: (i: Item) => void
  pomoId: number
  pomo: PomoCtl
  onInlineMount: (v: boolean) => void
  onReorder: (fromId: number, toId: number) => void
  onRename: (s: number, name: string) => void
  onAdd: (s: number) => void
}) {
  const openRename = (s: number, cur: string) => {
    const host = document.createElement('div')
    const input = document.createElement('input')
    input.type = 'text'
    input.value = cur
    input.className = 'newsheet-input'
    host.appendChild(input)
    Tool.sheet({
      title: '重命名分类',
      body: host,
      actions: [
        { label: '取消' },
        { label: '保存', primary: true, onClick() {
            const v = input.value.trim()
            if (v) onRename(s, v)
          } },
      ],
    })
    setTimeout(() => { input.focus(); input.select() }, 350)
  }
  const addHere = (s: number) => onAdd(s)

  return (
    <div className="kanban">
      {STATUSES.map(su => {
        const list = items.filter(i => statusOf(i) === su.k)
        const title = titles?.col?.[su.k] || su.n
        return (
          <section className="kcol" data-s={su.k} key={su.k}>
            <header className="khead">
              <span className={'smark s' + su.k}>{CYCLE[su.k]}</span>
              <span className="kn">{title}</span>
              <span className="n">{list.length}</span>
              <span className="qacts">
                <button className="miniib" title="重命名" onClick={() => openRename(su.k, title)}>{PEN}</button>
                <button className="miniib" title="添加任务" onClick={() => addHere(su.k)}>+</button>
              </span>
            </header>
            <div className="klist">
              {!list.length && <div className="kempty">拖动任务到这里</div>}
              {list.map(i => {
                const who = i.empId ? empMap.get(i.empId) : i.deptId ? deptMap.get(i.deptId) : ''
                return (
                <div key={i.id} className={'kcard' + (su.k === 2 ? ' done' : '')}
                     data-id={i.id}
                     onPointerDown={dragCard(i, onStatus, onReorder)}>
                  <button className={'cbox s' + su.k} type="button" title={CTIP[su.k]}
                          onClick={e => { e.stopPropagation(); onStatus(i.id, (su.k + 1) % 3) }}>
                    {CYCLE[su.k]}
                  </button>
                  <div className="kb" onClick={() => onEdit(i)}>
                    <div className="kt">{i.t}</div>
                    {(i.due || tagListOf(i).length || who) ? (
                      <div className="meta">
                        {i.due ? (
                          <span className={'due' + (midnight(i.due) < TODAY && su.k !== 2 ? ' late'
                            : midnight(i.due) === TODAY ? ' soon' : '')}>{dueText(i)}</span>
                        ) : null}
                        {who ? <span className="tag who">{who}</span> : null}
                        {tagListOf(i).map((kw: string) => <span className="tag" key={kw}>{kw}</span>)}
                      </div>
                    ) : null}
                  </div>
                  {pomoId === i.id && <PomoInline ctl={pomo} onMount={onInlineMount} />}
                  <button className={'pomoib' + (pomoId === i.id ? ' on' : '')} type="button"
                          title="番茄钟"
                          onClick={e => { e.stopPropagation(); onPomo(i) }}>
                    {TOMATO}{getPomoCount(i) ? <b>{getPomoCount(i)}</b> : null}
                  </button>
                  <div className="grip" title="按住这里拖动换列或排序">
                    {GRIP}
                  </div>
                </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
