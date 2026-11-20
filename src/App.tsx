import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Kit from './lib/kit.js'
import Tool from './lib/tool.js'
import { editItem, newItem } from './lib/edit.js'
import { SORTS, TODAY, DAY, dueText, emptyState, fmtDate, midnight, statusOf, tagListOf, visible } from './lib/todo.js'
import { getBreakMin, makeBreakRun, makeFocusRun, nextFocusRun, reviveRun } from './lib/pomo.js'
import { getState, putState } from './lib/api'
import type { Item, State } from './lib/types'
import Sidebar from './components/Sidebar'
import Board from './components/Board'
import Kanban from './components/Kanban'
import List from './components/List'
import BigCalendar from './components/BigCalendar'
import Progress from './components/Progress'
import Feed from './components/Feed'
import Team from './components/Team'
import Planner from './components/Planner'
import PomoDock, { type PomoCtl } from './components/PomoDock'

const store = Tool.store('todo-day', null as State | null)
const PLUS = <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>

/* 旧缓存/旧服务端数据没有部门员工字段：读到就补齐，避免下游到处是兜底。
   旧数据还是单值分组 g：一并迁成 tagList，关键字聚合和筛选才有数。
   番茄钟会话按 endAt 重算剩余：整状态可能是几分钟前同步过来的。 */
const norm = (s: State | null): State | null =>
  s ? { deptList: [], empList: [], ...s, sort: (s.sort as string) === 'pri' ? 'manual' : s.sort,
        pomoRun: reviveRun(s.pomoRun),
        items: s.items.map(i => ({ ...i, tagList: i.tagList || (i.g ? [i.g] : []) })) } : s

export default function App() {
  const [st, setSt] = useState<State>(() => norm(store.get()) || (emptyState() as State))
  const [view, setView] = useState('board')      // today | board | list | cal | prog | feed | team
  const [listMode, setListMode] = useState('flow') // flow | all
  const [tag, setTag] = useState('')             // '' = 全部关键字
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
      const fresh = norm(state)!
      store.set(fresh)
      live.current = fresh
      setSt(fresh)
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
          brand: 'AI日程大管家',
          title: fmtDate(Date.now()),
          subtitle: '今天要做的事',
          hero: {
            value: todays.length ? String(Math.round(doneN / todays.length * 100)) : '0',
            unit: '%', caption: doneN + ' / ' + todays.length + ' 已完成',
          },
          rows: items.filter(i => statusOf(i) !== 2).slice(0, 7)
            .map(i => [i.t.length > 16 ? i.t.slice(0, 16) + '…' : i.t, dueText(i) || '—']),
          note: items.filter(i => statusOf(i) !== 2 && i.due && midnight(i.due) < TODAY).length
            ? '有逾期事项，先清掉它们。' : '',
          footer: 'AI日程大管家',
        })
      },
    })
    return () => { host.innerHTML = '' }
  }, [])
  useEffect(() => {
    if (!themeHost.current) return
    const btn = Kit.themeToggle(null, themeHost.current)
    return () => btn.remove()
  }, [])

  /* 关键字筛选：一条 todo 可挂多个关键字，选中即只显示带它的 */
  const scoped = useMemo(() => {
    let v = tag ? st.items.filter(i => tagListOf(i).includes(tag)) : st.items
    return v
  }, [st.items, tag])
  const shown = useMemo(() => {
    let v = visible(scoped, filter, st.sort) as Item[]
    if (daySel) v = v.filter(i => i.due && midnight(i.due) === daySel)
    return v
  }, [scoped, st.sort, filter, daySel])

  /* 「规划」视图：逾期 + 今天起 7 天内的条目，按天分列。 */
  const todayItems = useMemo(() =>
    scoped.filter(i => i.due && midnight(i.due) <= TODAY + DAY * 6) as Item[], [scoped])

  /* 部门/员工 id → 名称：任务卡片上解析指派用。 */
  const deptList = st.deptList || []
  const empList = st.empList || []
  const allTagList = useMemo(() => [...new Set(st.items.flatMap(i => tagListOf(i)))], [st.items])
  const deptMap = useMemo(() => new Map(deptList.map(d => [d.id, d.n] as [number, string])), [deptList])
  const empMap = useMemo(() => new Map(empList.map(e => [e.id, e.n] as [number, string])), [empList])

  /* 新建任务：弹居中面板，保存后插入。 */
  const openNew = (preset: { status?: number; quad?: number; t?: string; due?: number } = {}) => {
    newItem(preset, (item) => {
      patch(s => ({
        ...s,
        items: [{ ...item, id: s.nid }, ...s.items],
        nid: s.nid + 1,
      }))
      Tool.sound.pop(); Tool.haptic(10)
    }, { deptList, empList, allTagList })
  }

  const setStatus = (id: number, sv: number) => patch(s => ({
    ...s,
    items: s.items.map(x => x.id === id
      ? { ...x, status: sv as 0 | 1 | 2, done: sv === 2, at: sv === 2 ? (x.at || Date.now()) : 0 } : x),
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
    deptList,
    empList,
    allTagList,
  })

  /* ── 番茄钟 ────────────────────────────────────────────────────────────
     会话存进整状态：改 pomoRun 走同一个 patch，防抖推送天然覆盖。
     开始专注把任务置为「进行中」；自然归零由悬浮坞回调 onPhaseEnd 结算。 */
  const startPomo = (i: Item) => {
    patch(s => ({
      ...s,
      pomoRun: makeFocusRun(i.id),
      items: s.items.map(x => x.id === i.id && statusOf(x) !== 2
        ? { ...x, status: 1, done: false } : x),
    }))
    Tool.sound.pop(); Tool.haptic(10)
  }
  const togglePausePomo = () => patch(s => {
    const r = s.pomoRun
    if (!r) return s
    return r.paused
      ? { ...s, pomoRun: { ...r, paused: false, endAt: Date.now() + r.leftMs } }
      : { ...s, pomoRun: { ...r, paused: true, leftMs: Math.max(0, r.endAt - Date.now()) } }
  })
  /* 提前完成：计 1 个番茄并结束会话，任务状态由用户另行勾选。 */
  const finishPomoEarly = () => patch(s => {
    const r = s.pomoRun
    if (!r || r.kind !== 'focus') return s
    return {
      ...s,
      pomoRun: undefined,
      items: s.items.map(x => x.id === r.itemId ? { ...x, pomo: (x.pomo || 0) + 1 } : x),
    }
  })
  const dropPomo = () => patch(s => ({ ...s, pomoRun: undefined }))
  const nextPomo = () => patch(s => ({
    ...s, pomoRun: s.pomoRun ? nextFocusRun(s.pomoRun) : s.pomoRun,
  }))
  const onPhaseEnd = () => {
    const r = live.current.pomoRun
    if (!r) return
    if (r.kind === 'focus') {
      patch(s => ({
        ...s,
        pomoRun: makeBreakRun(r),
        items: s.items.map(x => x.id === r.itemId ? { ...x, pomo: (x.pomo || 0) + 1 } : x),
      }))
      Tool.sound.win(); Tool.haptic(30)
      Kit.toast('专注完成，休息 ' + getBreakMin(r.cycle + 1) + ' 分钟')
    } else {
      patch(s => ({ ...s, pomoRun: { ...r, paused: true, leftMs: 0 } }))
      Tool.sound.ding(); Tool.haptic(30)
      Kit.toast('休息结束')
    }
  }
  const pomoItem = st.pomoRun ? st.items.find(i => i.id === st.pomoRun!.itemId) : undefined
  /* 会话挂着的任务被删（可能来自 MCP 或别的标签页）：会话一并清掉。 */
  useEffect(() => {
    if (st.pomoRun && !pomoItem) patch(s => ({ ...s, pomoRun: undefined }))
  }, [st.pomoRun, pomoItem])

  /* 计时面板嵌在会话所属的任务卡里；任务不在当前视图时悬浮坞兜底。 */
  const [inlineOn, setInlineOn] = useState(false)
  const inlineRef = useRef(false)
  const reportInline = useCallback((v: boolean) => {
    if (inlineRef.current === v) return
    inlineRef.current = v
    setInlineOn(v)
  }, [])
  const pomoCtl: PomoCtl = { run: st.pomoRun, pause: togglePausePomo, finish: finishPomoEarly,
                             drop: dropPomo, next: nextPomo, end: onPhaseEnd }

  const titles: Record<string, string> = { today: '规划', board: '象限', list: '清单', cal: '日历', prog: '进度', feed: '动态', team: '人员' }

  return (
    <div className={'app v-' + view}>
      <Sidebar items={st.items} view={view} tag={tag}
               onNav={setView} onTag={setTag} themeHost={themeHost} />

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
          {view === 'today' && (
            <Planner items={todayItems} empMap={empMap} deptMap={deptMap}
                   onToggle={toggle} onEdit={edit}
                   onPomo={startPomo} pomoId={pomoItem?.id || 0}
                   pomo={pomoCtl} onInlineMount={reportInline}
                   onAdd={(due) => openNew({ due })}
                   onReschedule={(id, ts) => patch(s => ({
                     ...s, items: s.items.map(x => x.id === id ? { ...x, due: ts } : x),
                   }))}
                   onReorder={(fromId, toId) => patch(s => {
                     const from = s.items.findIndex(x => x.id === fromId)
                     const [moved] = s.items.splice(from, 1)
                     const to = s.items.findIndex(x => x.id === toId)
                     s.items.splice(to < 0 ? s.items.length : to, 0, moved)
                     return s
                   })} />
          )}

          {view === 'board' && (
            <Board items={scoped} titles={st.titles} empMap={empMap} deptMap={deptMap}
                   onToggle={toggle} onEdit={edit}
                   onPomo={startPomo} pomoId={pomoItem?.id || 0}
                   pomo={pomoCtl} onInlineMount={reportInline}
                   onMove={(id, q) => patch(s => ({
                     ...s, items: s.items.map(x => x.id === id ? { ...x, quad: q as 1 | 2 | 3 | 4 } : x),
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
            <Kanban items={scoped} titles={st.titles} empMap={empMap} deptMap={deptMap}
                   onStatus={setStatus} onEdit={edit}
                   onPomo={startPomo} pomoId={pomoItem?.id || 0}
                   pomo={pomoCtl} onInlineMount={reportInline}
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
                    {'只看 ' + fmtDate(daySel) + ' ✕'}
                  </button>
                ) : null}
              </div>
              <div className="listwrap">
                <List items={shown} filter={filter} sort={st.sort} empMap={empMap} deptMap={deptMap}
                      onToggle={toggle} onEdit={edit}
                      onPomo={startPomo} pomoId={pomoItem?.id || 0}
                      pomo={pomoCtl} onInlineMount={reportInline}
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

          {view === 'cal' && <BigCalendar items={scoped} empMap={empMap} deptMap={deptMap}
                    onEdit={edit}
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

          {view === 'prog' && <Progress items={scoped}
                    onClear={() => {
                      const n = st.items.filter(i => i.done).length
                      patch(s => ({ ...s, items: s.items.filter(i => !i.done) }))
                      Kit.toast('清掉了 ' + n + ' 条')
                    }}
                    onExportCSV={() => {
                      Kit.download('待办.csv', Kit.toCSV([['内容', '关键字', '部门', '员工', '日期', '状态'],
                        ...st.items.map(i => [i.t, i.tagList.join(' '),
                          i.deptId ? deptMap.get(i.deptId) || '' : '',
                          i.empId ? empMap.get(i.empId) || '' : '',
                          i.due ? fmtDate(i.due) : '', i.done ? '已完成' : '未完成'])]))
                      Kit.toast('已导出 CSV')
                    }}
                    onExportPoster={() => {
                      const todays = st.items.filter(i => i.due && midnight(i.due) <= TODAY)
                      const doneN = todays.filter(i => i.done).length
                      Tool.poster({
                        brand: 'AI日程大管家',
                        title: fmtDate(Date.now()),
                        subtitle: '今天要做的事',
                        hero: {
                          value: todays.length ? String(Math.round(doneN / todays.length * 100)) : '0',
                          unit: '%', caption: doneN + ' / ' + todays.length + ' 已完成',
                        },
                        rows: st.items.filter(i => statusOf(i) !== 2).slice(0, 7)
                          .map(i => [i.t.length > 16 ? i.t.slice(0, 16) + '…' : i.t, dueText(i) || '—']),
                        note: st.items.filter(i => statusOf(i) !== 2 && i.due && midnight(i.due) < TODAY).length
                          ? '有逾期事项，先清掉它们。' : '',
                        footer: 'AI日程大管家',
                      })
                    }} />}

          {view === 'feed' && <Feed items={scoped} deptList={deptList} empList={empList} empMap={empMap} deptMap={deptMap} onEdit={edit} />}

          {view === 'team' && <Team items={st.items} deptList={deptList} empList={empList} onPatch={patch} />}
        </div>

      </div>

      <PomoDock ctl={pomoCtl} hidden={inlineOn} title={pomoItem?.t || ''} />
    </div>
  )
}
