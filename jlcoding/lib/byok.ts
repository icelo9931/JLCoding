// BYOK（Bring Your Own Key）：用户自己的 OpenAI 兼容 API Key。
// 仅存浏览器 localStorage（与 GitHub PAT 同策略，不经过服务器持久化）；
// 每次生成请求随 body 传入，服务端仅当次内存使用，不落库、不打日志。
// 说明：本模块无 'use client' 标记（服务端复用 isValidByok 校验），localStorage 访问带 window 守卫。
export interface ByokConfig {
  baseUrl: string
  apiKey: string
  model: string
}

const KEY = 'jlcoding:byok'

export function loadByok(): ByokConfig | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as ByokConfig
    if (typeof c.baseUrl === 'string' && typeof c.apiKey === 'string' && typeof c.model === 'string') return c
    return null
  } catch {
    return null
  }
}

export function saveByok(config: ByokConfig): void {
  localStorage.setItem(KEY, JSON.stringify(config))
}

export function clearByok(): void {
  localStorage.removeItem(KEY)
}

// 请求侧校验：base URL 合法 + 三字段非空
export function isValidByok(c: ByokConfig | null | undefined): c is ByokConfig {
  return Boolean(
    c &&
    typeof c.baseUrl === 'string' && /^https?:\/\//.test(c.baseUrl) &&
    typeof c.apiKey === 'string' && c.apiKey.trim().length > 0 &&
    typeof c.model === 'string' && c.model.trim().length > 0
  )
}
