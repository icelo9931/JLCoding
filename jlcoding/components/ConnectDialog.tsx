'use client'

import { GithubIcon } from '@/components/icons'

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { loadGithub, saveGithub, clearGithub, verifyGithubPat, type GithubConnection } from '@/lib/github'
import { X, Loader2, CheckCircle2, Unplug } from 'lucide-react'

// 工具连接弹窗：输入框下方"连接 GitHub 等工具"入口（当前仅 GitHub）
export function ConnectDialog({ open, onOpenChange, onConnected }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onConnected: (conn: GithubConnection | null) => void
}) {
  const [pat, setPat] = useState('')
  const [conn, setConn] = useState<GithubConnection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) setConn(loadGithub())
  }, [open])

  const connect = async () => {
    setLoading(true)
    setError(null)
    try {
      const c = await verifyGithubPat(pat.trim())
      saveGithub(c)
      setConn(c)
      onConnected(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const disconnect = () => {
    clearGithub()
    setConn(null)
    onConnected(null)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">连接工具</Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>

          {/* 方式列表：当前仅 GitHub */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900/60 p-3.5">
              <GithubIcon className="h-5 w-5 text-white" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">GitHub</div>
                <div className="text-[11px] text-zinc-500">连接后可把生成的项目一键推送到你的仓库</div>
              </div>
              {conn ? (
                <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="h-4 w-4" />已连接</span>
              ) : (
                <span className="rounded-full border border-indigo-700 bg-indigo-950 px-2 py-0.5 text-[10px] text-indigo-300">可用</span>
              )}
            </div>
            {['Figma（设计稿参考）', 'Notion（文档同步）'].map((name) => (
              <div key={name} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-3.5 opacity-50">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-zinc-700 text-[10px]">＋</span>
                <div className="flex-1 text-sm text-zinc-400">{name}</div>
                <span className="text-[10px] text-zinc-600">即将支持</span>
              </div>
            ))}
          </div>

          {/* GitHub 连接区 */}
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5">
            {conn ? (
              <div className="flex items-center gap-3">
                <img src={conn.avatar} alt={conn.login} className="h-9 w-9 rounded-full border border-zinc-700" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{conn.login}</div>
                  <div className="text-[11px] text-zinc-500">Token 仅保存在你的浏览器本地，不会上传服务器</div>
                </div>
                <Button variant="destructive" size="sm" onClick={disconnect}><Unplug className="h-3.5 w-3.5" />断开</Button>
              </div>
            ) : (
              <>
                <div className="mb-2 text-xs text-zinc-400">
                  粘贴 GitHub Personal Access Token（Settings → Developer settings → Tokens，勾选 <code className="text-indigo-300">repo</code> 权限）
                </div>
                <div className="flex gap-2">
                  <input
                    value={pat}
                    onChange={(e) => setPat(e.target.value)}
                    placeholder="ghp_... 或 github_pat_..."
                    className="h-9 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-xs outline-none focus:border-indigo-600"
                  />
                  <Button size="sm" onClick={connect} disabled={loading || !pat.trim()}>
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '连接'}
                  </Button>
                </div>
                {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
