import type { State } from './types'

/* 服务端状态同步：整体拉取、整体保存。 */
const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(BASE + path, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
    if (!res.ok) throw new Error('接口返回 ' + res.status)
    return await res.json() as T
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    throw new Error('同步失败 ' + path + '：' + why)
  } finally {
    clearTimeout(timer)
  }
}

export function getState() {
  return request<{ state: State | null }>('/state')
}

export function putState(state: State) {
  return request<{ ok: boolean }>('/state', {
    method: 'PUT',
    body: JSON.stringify({ state }),
  })
}
