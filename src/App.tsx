import { useEffect, useMemo, useRef, useState } from 'react'
import Kit from './lib/kit.js'
import Tool from './lib/tool.js'
import { editItem, newItem } from './lib/edit.js'
import { SORTS, TODAY, dueText, midnight, parseInput, seed, statusOf, visible } from './lib/todo.js'
import { getState, putState } from './lib/api'
import type { Item, State } from './lib/types'
import Sidebar from './components/Sidebar'
import Board from './components/Board'
import Kanban from './components/Kanban'
import List from './components/List'
import BigCalendar from './components/BigCalendar'
import Progress from './components/Progress'

const store = Tool.store('todo-day', null as State | null)
const PLUS = <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>

export default function App() {
  const [st, setSt] = useState<State>(() => store.get() || seed())
  const [view, setView] = useState('board')      // board | list | cal | prog
  const [listMode, setListMode] = useState('flow') // flow | all
  const [group, setGroup] = useState('')         // '' = 全部分组
  const [pri, setPri] = useState('')             // '' = 全部优先级
  const [filter, setFilter] = useState('all')
  const [daySel, setDaySel] = useState(0)
  const themeHost = useRef<HTMLDivElement>(null)
  const filterEl = useRef<HTMLDivElement>(null)
  const modeEl = useRef<HTMLDivElement>(null)
  const acts = useRef<HTMLSpanElement>(null)
  const live = useRef(st); live.current = st
  const booted = useRef(false)
  const pushTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  /* 启动：先用本地缓存渲染，再从服务端拉全量覆盖，断网也能开。
     拉取前本地若有改动会被覆盖——首屏几百毫秒内编辑的概率极低，暂不处理。 */
  useEffect(() => {
    let cancelled = false
    getState().then(({ state }) => {
      if (cancelled || !state || !Array.isArray(state.items)) return
      store.set(state)
      live.current = state
      setSt(state)
    }).catch(() => { /* 服务端不可达：保持本地缓存 */ })
    return () => { cancelled = true }
  }, [])

  /* 每次变更先落本地缓存，再防抖 500ms 推服务端。 */
  useEffect(() => {
    store.set(st)
    if (!booted.current) { booted.current = true; return }
    clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => {
      putState(live.current).catch(() => Kit.toast('离线中，改动已存本地'))
    }, 500)
    return () => clearTimeout(pushTimer.current)
  }, [st])
  const patch = (f: (s: State) => State) => setSt(s => f({ ...s, items: s.items.slice() }))
  /* 模式切换 seg：清单页挂载时绑定。 */
  useEffect(() => {
    if (view === 'list' && modeEl.current) {
      return Kit.seg(modeEl.current, (v: string) => setListMode(v))
    }
  }, [view])
  /* 全部清单模式的筛选 seg：条件渲染，元素出现时再绑定。 */
  useEffect(() => {
    if (listMode === 'all' && filterEl.current) {
      return Kit.seg(filterEl.current, (v: string) => setFilter(v))
    }
  }, [listMode])

  /* 全局动作：导出 + 主题。侧边栏底部 + 顶栏右侧共用。 */
  useEffect(() => {
    const host = acts.current
    if (!host) return
    Tool.exportBar(host, {
      name: 'todo',
      poster: () => {
        const items = live.current.items
        const todays = items.filter(i => i.due && midnight(i.due) <= TODAY)
        const doneN = todays.filter(i => i.done).length
        return Tool.poster({
          brand: '待办事项',
          title: new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }),
          subtitle: '今天要做的事',
          hero: {
            value: todays.length ? String(Math.round(doneN / todays.length * 100)) : '0',
            unit: '%', caption: doneN + ' / ' + todays.length + ' 已完成',
          },
          rows: items.filter(i => statusOf(i) !== 2).slice(0, 7)
            .map(i => [i.t.length > 16 ? i.t.slice(0, 16) + '…' : i.t, dueText(i) || '—']),
          note: items.filter(i => statusOf(i) !== 2 && i.due && midnight(i.due) < TODAY).length
            ? '有逾期事项，先清掉它们。' : '',
          footer: '待办事项 · TODO',
        })
      },
    })
    return () => { host.innerHTML = '' }
  }, [])
  useEffect(() => { if (themeHost.current) Kit.themeToggle(null, themeHost.current) }, [])

  /* 分组 + 优先级筛选 */
  const grouped = useMemo(() => {
    let v = group ? st.items.filter(i => i.g === group) : st.items
    if (pri) v = v.filter(i => i.p === +pri)
    return v
  }, [st.items, group, pri])
  const shown = useMemo(() => {
    let v = visible(grouped, filter, st.sort) as Item[]
    if (daySel) v = v.filter(i => i.due && midnight(i.due) === daySel)
    return v
  }, [grouped, st.sort, filter, daySel])

  /* 新建任务：弹居中面板，保存后插入。 */
  const openNew = (preset: { status?: number; quad?: number; t?: string } = {}) => {
    newItem(preset, (item) => {
      patch(s => ({
        ...s,
        items: [{ ...item, id: s.nid }, ...s.items],
        nid: s.nid + 1,
      }))
      Tool.sound.pop(); Tool.haptic(10)
    })
  }

  const setStatus = (id: number, sv: number) => patch(s => ({
    ...s,
    items: s.items.map(x => x.id === id
      ? { ...x, status: sv, done: sv === 2, at: sv === 2 ? (x.at || Date.now()) : 0 } : x),
  }))
  const toggle = (i: Item) => setStatus(i.id, statusOf(i) === 2 ? 0 : 2)
  const renameQuad = (q: number, name: string) => patch(s => ({
    ...s, titles: { quad: { ...(s.titles?.quad || {}), [q]: name }, col: { ...(s.titles?.col || {}) } },
  }))
  const renameCol = (col: number, name: string) => patch(s => ({
    ...s, titles: { quad: { ...(s.titles?.quad || {}) }, col: { ...(s.titles?.col || {}), [col]: name } },
  }))
  const edit = (i: Item) => editItem(i, {
    onSave: (next: Item) => patch(s => ({ ...s, items: s.items.map(x => x.id === next.id ? next : x) })),
    onDelete: (dead: Item) => patch(s => ({ ...s, items: s.items.filter(x => x.id !== dead.id) })),
  })

  const titles: Record<string, string> = { board: '看板', list: '清单', cal: '日历', prog: '进度' }

  return (
    <div className={'app v-' + view}>
      <Sidebar items={st.items} view={view} group={group} pri={pri}
               onNav={setView} onGroup={setGroup} onPri={setPri} themeHost={themeHost} />

      <div className="main">
        <div className="topbar">
          <div>
            <div className="title">{titles[view]}</div>
            <div className="sub">{st.items.filter(i => statusOf(i) !== 2).length + ' OPEN'}</div>
          </div>
          <span className="spacer" />
          <button className="btn primary newbtn" onClick={() => openNew()}>
            {PLUS} 新建任务
          </button>
          <span className="acts" ref={acts} />
        </div>

        <div className="content">
          {view === 'board' && (
            <Board items={grouped} titles={st.titles} onToggle={toggle} onEdit={edit}
                   onMove={(id, q) => patch(s => ({
                     ...s, items: s.items.map(x => x.id === id ? { ...x, quad: q } : x),
                   }))}
                   onRename={renameQuad}
                   onAdd={(q) => openNew({ quad: q })} />
          )}

          {view === 'list' && (
            <div className="modebar">
              <div className="seg" ref={modeEl}>
                <button data-v="flow" className="on">流程视图</button>
                <button data-v="all">全部清单</button>
              </div>
            </div>
          )}

          {view === 'list' && listMode === 'flow' && (
            <Kanban items={grouped} titles={st.titles} onStatus={setStatus} onEdit={edit}
                   onRename={renameCol}
                   onAdd={(sv) => openNew({ status: sv })}
                    onReorder={(fromId, toId) => patch(s => {
                      const from = s.items.findIndex(x => x.id === fromId)
                      const [moved] = s.items.splice(from, 1)
                      const to = s.items.findIndex(x => x.id === toId)
                      s.items.splice(to < 0 ? s.items.length : to, 0, moved)
                      return s
                    })} />
          )}

          {view === 'list' && listMode === 'all' && (
            <>
              <div className="filters">
                <div className="seg" ref={filterEl}>
                  <button data-v="all" className="on">全部</button>
                  <button data-v="open">未完成</button>
                  <button data-v="doing">进行中</button>
                  <button data-v="done">已完成</button>
                </div>
                <button className="chip" onClick={() => {
                  const keys = Object.keys(SORTS) as State['sort'][]
                  patch(s => ({ ...s, sort: keys[(keys.indexOf(s.sort) + 1) % keys.length] }))
                  Tool.sound.tick()
                }}>{'排序 · ' + SORTS[st.sort]}</button>
                {daySel ? (
                  <button className="chip" onClick={() => setDaySel(0)}>
                    {'只看 ' + new Date(daySel).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) + ' ✕'}
                  </button>
                ) : null}
              </div>
              <div className="listwrap">
                <List items={shown} filter={filter} sort={st.sort}
                      onToggle={toggle} onEdit={edit}
                      onReorder={(fromId, toId) => patch(s => {
                        const from = s.items.findIndex(x => x.id === fromId)
                        const [moved] = s.items.splice(from, 1)
                        const to = s.items.findIndex(x => x.id === toId)
                        s.items.splice(to < 0 ? s.items.length : to, 0, moved)
                        return s
                      })} />
              </div>
            </>
          )}

          {view === 'cal' && <BigCalendar items={grouped} onEdit={edit}
                    onReschedule={(id, ts) => patch(s => ({
                      ...s, items: s.items.map(x => x.id === id ? { ...x, due: ts } : x),
                    }))}
                    onReorder={(fromId, toId) => patch(s => {
                      const from = s.items.findIndex(x => x.id === fromId)
                      const [moved] = s.items.splice(from, 1)
                      const to = s.items.findIndex(x => x.id === toId)
                      s.items.splice(to < 0 ? s.items.length : to, 0, moved)
                      return s
                    })} />}

          {view === 'prog' && <Progress items={grouped}
                    onClear={() => {
                      const n = st.items.filter(i => i.done).length
                      patch(s => ({ ...s, items: s.items.filter(i => !i.done) }))
                      Kit.toast('清掉了 ' + n + ' 条')
                    }}
                    onExportCSV={() => {
                      Kit.download('待办.csv', Kit.toCSV([['内容', '分组', '优先级', '日期', '状态'],
                        ...st.items.map(i => [i.t, i.g, ['', '高', '中', '低'][i.p],
                          i.due ? new Date(i.due).toLocaleDateString('zh-CN') : '', i.done ? '已完成' : '未完成'])]))
                      Kit.toast('已导出 CSV')
                    }}
                    onExportPoster={() => {
                      const todays = st.items.filter(i => i.due && midnight(i.due) <= TODAY)
                      const doneN = todays.filter(i => i.done).length
                      Tool.poster({
                        brand: '待办事项',
                        title: new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }),
                        subtitle: '今天要做的事',
                        hero: {
                          value: todays.length ? String(Math.round(doneN / todays.length * 100)) : '0',
                          unit: '%', caption: doneN + ' / ' + todays.length + ' 已完成',
                        },
                        rows: st.items.filter(i => statusOf(i) !== 2).slice(0, 7)
                          .map(i => [i.t.length > 16 ? i.t.slice(0, 16) + '…' : i.t, dueText(i) || '—']),
                        note: st.items.filter(i => statusOf(i) !== 2 && i.due && midnight(i.due) < TODAY).length
                          ? '有逾期事项，先清掉它们。' : '',
                        footer: '待办事项 · TODO',
                      })
                    }} />}
        </div>

      </div>
    </div>
  )
}
