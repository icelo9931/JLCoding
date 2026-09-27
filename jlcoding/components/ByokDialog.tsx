'use client'

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { loadByok, saveByok, clearByok, type ByokConfig } from '@/lib/byok'
import { X, KeyRound, Loader2, Unplug } from 'lucide-react'

// BYOK 配置弹窗：用户自己的 OpenAI 兼容 API Key（base URL + key + 模型 ID）。
// 仅存浏览器 localStorage（与 GitHub PAT 同策略）；生成请求时随 body 传入，服务端仅当次内存使用。
export function ByokDialog({ open, onOpenChange, onSaved, onCleared }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: (c: ByokConfig) => void
  onCleared: () => void
}) {
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [saved, setSaved] = useState<ByokConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testOk, setTestOk] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      const c = loadByok()
      setSaved(c)
      setBaseUrl(c?.baseUrl ?? '')
      setApiKey(c?.apiKey ?? '')
      setModel(c?.model ?? '')
      setError(null)
      setTestOk(null)
    }
  }, [open])

  const save = () => {
    const config = { baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() }
    if (!/^https?:\/\//.test(config.baseUrl)) { setError('Base URL 需以 http(s):// 开头'); return }
    if (!config.apiKey) { setError('API Key 不能为空'); return }
    if (!config.model) { setError('模型 ID 不能为空（如 deepseek-chat / gpt-4o）'); return }
    saveByok(config)
    setSaved(config)
    onSaved(config)
    setError(null)
  }

  const test = async () => {
    const config = { baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() }
    if (!/^https?:\/\//.test(config.baseUrl) || !config.apiKey) { setError('请先填写 Base URL 和 API Key'); return }
    setTesting(true)
    setError(null)
    setTestOk(null)
    try {
      const res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/models`, {
        headers: { Authorization: `Bearer ${config.apiKey}`, 'User-Agent': 'jlcoding/1.0' },
        signal: AbortSignal.timeout(6000),
      })
      // 任何 HTTP 响应都证明端点可达（含 401/404）；仅网络错误才是不可达
      setTestOk(res.ok ? `连接成功（HTTP ${res.status}，模型列表已返回）` : `端点可达（HTTP ${res.status}）——若非 200 请确认 Key 与端点匹配`)
    } catch {
      setError('连接失败：端点不可达（检查 Base URL 与网络）')
    } finally {
      setTesting(false)
    }
  }

  const clear = () => {
    clearByok()
    setSaved(null)
    setBaseUrl('')
    setApiKey('')
    setModel('')
    onCleared()
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(460px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
          <div className="flex items-center justify-between">
            <Dialog.Title className="flex items-center gap-2 text-lg font-semibold">
              <KeyRound className="h-4 w-4 text-amber-400" />我自己的 API Key（BYOK）
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
            使用你自己的 OpenAI 兼容 API Key 生成（任何兼容 /chat/completions 的端点：DeepSeek 官方、OpenAI、本地 Ollama 等）。
            Key 仅存浏览器本地（与 GitHub PAT 同策略），生成时随请求传输，服务端不落库、不打日志。
          </p>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-400">Base URL（OpenAI 兼容端点）</span>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.deepseek.com/v1"
                className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-xs outline-none focus:border-amber-600"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-400">API Key</span>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                type="password"
                placeholder="sk-…"
                className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-xs outline-none focus:border-amber-600"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-400">模型 ID（实际调用）</span>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="deepseek-chat"
                className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-xs outline-none focus:border-amber-600"
              />
            </label>
          </div>

          {error && <div className="mt-3 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</div>}
          {testOk && <div className="mt-3 rounded-lg border border-emerald-900 bg-emerald-950/50 px-3 py-2 text-xs text-emerald-300">{testOk}</div>}

          <div className="mt-4 flex items-center justify-between">
            {saved ? (
              <button onClick={clear} className="flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-red-400">
                <Unplug className="h-3.5 w-3.5" />清除已保存的 Key
              </button>
            ) : <span />}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={test} disabled={testing}>
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}测试连接
              </Button>
              <Button size="sm" onClick={save}>保存</Button>
            </div>
          </div>
          {saved && (
            <p className="mt-3 text-[10px] text-zinc-600">
              当前已配置：{saved.baseUrl} · 模型 {saved.model}。生成时在模型下拉选择「使用我自己的 API Key」即可启用。
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
