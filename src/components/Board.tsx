import Tool from '../lib/tool.js'
import { QUADS, TODAY, dueText, midnight, quadOf } from '../lib/todo.js'
import type { Item, State } from '../lib/types'

const CHECK = <svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" /></svg>
const GRIP = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01"
          strokeLinecap="round" strokeWidth="2.4" />
  </svg>
)
const PEN = <svg viewBox="0 0 24 24"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
const QCOLOR = ['', 'var(--neg)', 'var(--accent)', 'var(--warn)', 'var(--faint)']

/* 跨象限拖拽：按住卡片任意处（按钮除外）即可拖。 */
function dragTo(item: Item, onMove: (id: number, q: number) => void) {
  return (e: React.PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button, input, .qacts, .qb')) return
    e.preventDefault()
    const card = e.currentTarget as HTMLElement
    card.setPointerCapture(e.pointerId)
    Tool.haptic(8)
    const rect = card.getBoundingClientRect()
    const offX = e.clientX - rect.left, offY = e.clientY - rect.top
    /* 用 ghost 浮层替代直接拖原卡。requestAnimationFrame 节流 + 短 transition，
       避免每次 pointermove 都累积 transition 导致卡顿。 */
    const ghost = card.cloneNode(true) as HTMLElement
    ghost.className = card.className + ' ghost'
    ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;z-index:60;pointer-events:none;margin:0;transition:left .08s var(--ease),top .08s var(--ease)`
    document.body.appendChild(ghost)
    card.classList.add('ph')
    let over: HTMLElement | null = null
    let raf = 0
    let lastX = 0, lastY = 0
    const setOver = (el: HTMLElement | null) => {
      if (over === el) return
      over?.classList.remove('over')
      over = el
      over?.classList.add('over')
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
        ?.closest('.quad') as HTMLElement | null
      setOver(el)
    }
    const up = (ev: PointerEvent) => {
      card.removeEventListener('pointermove', move)
      card.removeEventListener('pointerup', up)
      card.removeEventListener('pointercancel', up)
      if (raf) { cancelAnimationFrame(raf); raf = 0 }
      const target = document.elementFromPoint(ev.clientX, ev.clientY)
        ?.closest('.quad') as HTMLElement | null
      setOver(null)
      /* 松手时 ghost 快速滑回原位淡出。 */
      ghost.style.transition = 'left .15s var(--ease),top .15s var(--ease),opacity .15s var(--ease)'
      ghost.style.left = rect.left + 'px'
      ghost.style.top = rect.top + 'px'
      ghost.style.opacity = '0'
      setTimeout(() => ghost.remove(), 160)
      card.classList.remove('ph')
      if (target) {
        const q = +target.dataset.q!
        if (q !== quadOf(item)) { onMove(item.id, q); Tool.sound.tick() }
      }
    }
    card.addEventListener('pointermove', move)
    card.addEventListener('pointerup', up)
    card.addEventListener('pointercancel', up)
  }
}

export default function Board({ items, titles, onToggle, onEdit, onMove, onRename, onAdd }: {
  items: Item[]
  titles: State['titles']
  onToggle: (i: Item) => void
  onEdit: (i: Item) => void
  onMove: (id: number, q: number) => void
  onRename: (q: number, name: string) => void
  onAdd: (q: number) => void
}) {
  const open = items.filter(i => !i.done)
  const byQ = (q: number) => open
    .filter(i => quadOf(i) === q)
    .sort((a, b) => (a.due || 9e15) - (b.due || 9e15) || a.p - b.p)

  const openRename = (q: number, cur: string) => {
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
            if (v) onRename(q, v)
          } },
      ],
    })
    setTimeout(() => { input.focus(); input.select() }, 350)
  }
  const addHere = (q: number) => onAdd(q)

  return (
    <div className="board">
      {QUADS.map(qu => {
        const list = byQ(qu.k)
        const title = titles?.quad?.[qu.k] || qu.n
        return (
          <section className="quad" data-q={qu.k} key={qu.k}>
            <header className="quadhead">
              <i className="qdot" style={{ background: QCOLOR[qu.k] }} />
              <span className="qn">{title}</span>
              <span className="n">{list.length}</span>
              <span className="qacts">
                <button className="miniib" title="重命名" onClick={() => openRename(qu.k, title)}>{PEN}</button>
                <button className="miniib" title="添加任务" onClick={() => addHere(qu.k)}>+</button>
              </span>
            </header>
            <div className="quadlist">
              {!list.length && <div className="quadempty">空。拖进来，或点右上角 + 添加</div>}
              {list.map(i => (
                <div key={i.id} className="qcard" data-id={i.id}
                     onPointerDown={dragTo(i, onMove)}
                     style={{ '--pri': i.p === 1 ? 'var(--p1)' : i.p === 2 ? 'var(--p2)' : 'transparent' } as React.CSSProperties}>
                  <button className="box" type="button" aria-label="完成"
                          onClick={e => { e.stopPropagation(); onToggle(i) }}>{CHECK}</button>
                  <div className="qb" onClick={() => onEdit(i)}>
                    <div className="qt">{i.t}</div>
                    {(i.due || i.g) ? (
                      <div className="meta">
                        <span className={'pri p' + i.p}>{i.p === 1 ? '高' : i.p === 2 ? '中' : '低'}</span>
                        {i.due ? (
                          <span className={'due' + (midnight(i.due) < TODAY ? ' late'
                            : midnight(i.due) === TODAY ? ' soon' : '')}>{dueText(i)}</span>
                        ) : null}
                        {i.g ? <span className="tag">{i.g}</span> : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="grip" title="按住这里拖到别的象限">{GRIP}</div>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
