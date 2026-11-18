import { useCallback, useEffect, useRef, useState } from 'react'
import { FOCUS_MIN, getBreakMin } from '../lib/pomo.js'
import type { PomoRun } from '../lib/types'

/* 番茄钟控制柄：App 组装一份传给视图，卡片内嵌面板与悬浮坞共用。
   run 为 undefined 表示当前没有会话。 */
export interface PomoCtl {
  run?: PomoRun
  pause: () => void
  finish: () => void
  drop: () => void
  next: () => void
  end: () => void
}

/* 倒计时只驱动本组件重渲染；归零结算在 interval 回调里做，
   绝不依赖渲染闭包里的剩余时间——首次渲染的旧值会把新会话误判成已结束。
   每个会话一份 ended 标志：归零到 React 换掉 run 之间可能还有几次 interval
   触发，必须只结算一次，否则提前完成会重复计番茄。 */
function usePomoClock(run: PomoRun | undefined, onPhaseEnd: () => void) {
  const [left, setLeft] = useState(0)
  const endRef = useRef(onPhaseEnd)
  endRef.current = onPhaseEnd
  useEffect(() => {
    if (!run) return
    if (run.paused) { setLeft(run.leftMs); return }
    let ended = false
    const tick = () => {
      const remain = Math.max(0, run.endAt - Date.now())
      setLeft(remain)
      if (!ended && remain <= 0) { ended = true; endRef.current() }
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [run])
  return left
}

/* 会话三态：专注 / 休息 / 休息结束待下一回合。 */
type PomoPhase = 'focus' | 'break' | 'await'
const phaseOf = (run: PomoRun): PomoPhase =>
  run.kind === 'break' && run.paused && run.leftMs <= 0 ? 'await' : run.kind
const PHASE_TEXT: Record<PomoPhase, string> = { focus: '专注中', break: '休息中', await: '休息结束' }

/* 计时面板：inCard 时塞进任务卡第二行（不重复任务标题），否则带标题信息。 */
function PomoPanel({ ctl, title, inCard }: { ctl: PomoCtl; title: string; inCard?: boolean }) {
  const { run } = ctl
  const left = usePomoClock(run, ctl.end)
  if (!run) return null

  const phase = phaseOf(run)
  const total = (phase === 'focus' ? FOCUS_MIN : getBreakMin(run.cycle)) * 60e3
  const R = 20
  const C = 2 * Math.PI * R
  const ratio = total > 0 ? Math.min(1, Math.max(0, left / total)) : 0
  const mmss = `${String(Math.floor(left / 60e3)).padStart(2, '0')}:${String(Math.floor(left % 60e3 / 1e3)).padStart(2, '0')}`
  const pausedTxt = run.paused && phase !== 'await' ? '（已暂停）' : ''

  return (
    <div className={'pomopanel' + (phase !== 'focus' ? ' brk' : '') + (inCard ? ' incard' : '')}>
      <div className="pp-top">
        <div className="pp-ring">
          <svg viewBox="0 0 48 48">
            <circle className="bg" cx="24" cy="24" r={R} />
            <circle className="fg" cx="24" cy="24" r={R}
                    strokeDasharray={C} strokeDashoffset={C * (1 - ratio)} />
          </svg>
          <span className="t">{mmss}</span>
        </div>
        {inCard ? (
          <span className="pp-phase">{PHASE_TEXT[phase] + pausedTxt}</span>
        ) : (
          <div className="pp-info">
            <div className="pp-task" title={title}>{title || '任务已删除'}</div>
            <div className="pp-phase">{PHASE_TEXT[phase] + pausedTxt}</div>
          </div>
        )}
      </div>
      <div className="pp-act">
        {phase === 'await' ? (
          <button className="btn primary" type="button" onClick={ctl.next}>开始下一回合</button>
        ) : phase === 'break' ? (
          <button className="btn" type="button" onClick={ctl.next}>跳过休息</button>
        ) : (
          <>
            <button className="btn" type="button" onClick={ctl.pause}>
              {run.paused ? '继续' : '暂停'}
            </button>
            <button className="btn" type="button" onClick={ctl.finish}>完成</button>
          </>
        )}
        <button className="btn" type="button" onClick={ctl.drop}>放弃</button>
      </div>
    </div>
  )
}

/* 卡片内嵌计时器：随任务卡渲染，并向 App 报告挂载状态。 */
export function PomoInline({ ctl, onMount }: { ctl: PomoCtl; onMount: (v: boolean) => void }) {
  const report = useCallback(onMount, [onMount])
  useEffect(() => {
    report(true)
    return () => report(false)
  }, [report])
  if (!ctl.run) return null
  return (
    <div className="pomo-inline">
      <PomoPanel ctl={ctl} title="" inCard />
    </div>
  )
}

/* 悬浮坞降级为兜底：会话挂着的任务不在当前视图时才出现。 */
export default function PomoDock({ ctl, hidden, title }: { ctl: PomoCtl; hidden: boolean; title: string }) {
  if (hidden || !ctl.run) return null
  return (
    <div className="pomodock">
      <PomoPanel ctl={ctl} title={title} />
    </div>
  )
}
