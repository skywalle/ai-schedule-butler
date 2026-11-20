import { Fragment, type ReactNode } from 'react'
import Kit from '../lib/kit.js'
import Tool from '../lib/tool.js'
import { ORDER, TODAY, bucketOf, dueText, midnight, quadOf, tagListOf } from '../lib/todo.js'
import { getPomoCount } from '../lib/pomo.js'
import { PomoInline, type PomoCtl } from './PomoDock'
import type { Item, State } from '../lib/types'

const CHECK = <svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" /></svg>
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

/* ── 拖拽排序 ──────────────────────────────────────────────────────────────
   用 pointer events 而不是 HTML5 drag-and-drop：后者在移动端浏览器里根本不触发。
   落点标记直接改 class —— 这是每帧都在动的纯视觉反馈，走 state 只会让整张列表
   跟着重渲染。 */
function useDrag(sort: State['sort'], reorder: (fromId: number, toId: number) => void) {
  return (item: Item) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (sort !== 'manual') { Kit.toast('先把排序切回「手动」才能拖'); return }
    e.preventDefault()
    const handle = e.currentTarget
    const el = handle.closest('.item') as HTMLElement
    handle.setPointerCapture(e.pointerId)
    el.classList.add('dragging')
    Tool.haptic(8)
    let marker: HTMLElement | null = null
    const move = (ev: PointerEvent) => {
      const y = ev.clientY
      const rows = [...document.querySelectorAll('.item')].filter(r => r !== el) as HTMLElement[]
      if (marker) marker.classList.remove('dropbefore')
      marker = rows.find(r => {
        const b = r.getBoundingClientRect(); return y < b.top + b.height / 2
      }) || null
      if (marker) marker.classList.add('dropbefore')
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      el.classList.remove('dragging')
      if (marker) {
        marker.classList.remove('dropbefore')
        reorder(item.id, +marker.dataset.id!)
        Tool.sound.tick()
      }
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
  }
}

export default function List({ items, filter, sort, empMap, deptMap, emptyHint, onToggle, onEdit, onPomo, pomoId, pomo, onInlineMount, onReorder }: {
  items: Item[]
  filter: string
  sort: State['sort']
  empMap: Map<number, string>
  deptMap: Map<number, string>
  emptyHint?: ReactNode
  onToggle: (i: Item) => void
  onEdit: (i: Item) => void
  onPomo: (i: Item) => void
  pomoId: number
  pomo: PomoCtl
  onInlineMount: (v: boolean) => void
  onReorder: (fromId: number, toId: number) => void
}) {
  const drag = useDrag(sort, onReorder)
  const groups: Record<string, Item[]> = {}
  items.forEach(i => (groups[bucketOf(i)] = groups[bucketOf(i)] || []).push(i))

  if (!items.length) return (
    <div className="empty">
      {CHECK}
      <div>{filter === 'done' ? '还没有勾掉的事。'
        : emptyHint || <>这里是空的。<br />在下面那一栏加一件事。</>}</div>
    </div>
  )

  return (
    <>
      {ORDER.filter((g: string) => groups[g]).map((g: string) => (
        <Fragment key={g}>
          <div className="grouphead"><span>{g}</span><span className="n">{groups[g].length}</span></div>
          {groups[g].map(i => {
            const who = i.empId ? empMap.get(i.empId) : i.deptId ? deptMap.get(i.deptId) : ''
            const execWho = i.execEmpId ? empMap.get(i.execEmpId) : ''
            const subWho = i.subEmpId ? empMap.get(i.subEmpId) : ''
            return (
            <div key={i.id} className={'item' + (i.done ? ' done' : '')} data-id={i.id}>
              <button className="box" type="button" aria-label="完成"
                      onClick={e => { e.stopPropagation(); onToggle(i) }}>{CHECK}</button>
              <div className="body" onClick={() => onEdit(i)}>
                <div className="txt">{i.t}</div>
                {(tagListOf(i).length || i.due || who || execWho || subWho || quadOf(i) !== 4) && (
                  <div className="meta">
                    {quadOf(i) !== 4 ? (
                      <i className="qmark" title={['','重要且紧急','重要不紧急','紧急不重要','不重要不紧急'][quadOf(i)]}
                         style={{ background: ['','var(--neg)','var(--accent)','var(--warn)','var(--faint)'][quadOf(i)] }} />
                    ) : null}
                    {who ? <span className="tag who">{who}</span> : null}
                    {execWho ? <span className="tag who">{'执行:' + execWho}</span> : null}
                    {subWho ? <span className="tag who">{'提交:' + subWho}</span> : null}
                    {tagListOf(i).map((kw: string) => <span className="tag" key={kw}>{kw}</span>)}
                    {i.due ? (
                      <span className={'due' + (midnight(i.due) < TODAY && !i.done ? ' late'
                        : midnight(i.due) === TODAY ? ' soon' : '')}>{dueText(i)}</span>
                    ) : null}
                  </div>
                )}
              </div>
              {pomoId === i.id && <PomoInline ctl={pomo} onMount={onInlineMount} />}
              <button className={'pomoib' + (pomoId === i.id ? ' on' : '')} type="button"
                      title="番茄钟"
                      onClick={e => { e.stopPropagation(); onPomo(i) }}>
                {TOMATO}{getPomoCount(i) ? <b>{getPomoCount(i)}</b> : null}
              </button>
              <div className="handle" title="拖动排序" onPointerDown={drag(i)}>{GRIP}</div>
            </div>
            )
          })}
        </Fragment>
      ))}
    </>
  )
}
