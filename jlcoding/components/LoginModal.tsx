'use client'

import { GithubIcon } from '@/components/icons'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/TopBar'
import { X, Loader2, Mail } from 'lucide-react'

export interface AuthUser {
  id: string
  email: string
  name: string
}

// 极简登录卡：邮箱+密码（登录/注册），GitHub 登录预留
export function LoginModal({ open, onOpenChange, onSuccess, pendingHint }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSuccess: (user: AuthUser) => void
  pendingHint?: string
}) {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/auth/${tab}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tab === 'register' ? { email, password, name: email.split('@')[0] } : { email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '操作失败')
      onSuccess(data)
      onOpenChange(false)
      setEmail('')
      setPassword('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(400px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
          <Dialog.Close asChild>
            <button className="absolute right-4 top-4 rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </Dialog.Close>

          <div className="flex flex-col items-center">
            <BrandMark />
            <Dialog.Title className="mt-3 text-base font-semibold">
              {tab === 'login' ? '登录，继续你的创作' : '注册，开启第一次生成'}
            </Dialog.Title>
            {pendingHint && (
              <p className="mt-1.5 max-w-[280px] truncate text-center text-xs text-zinc-500">
                需求已就绪：{pendingHint}
              </p>
            )}
          </div>

          {/* Tab */}
          <div className="mt-5 grid grid-cols-2 rounded-lg bg-zinc-900 p-0.5 text-sm">
            {(['login', 'register'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null) }}
                className={`rounded-md py-1.5 transition-colors ${tab === t ? 'bg-zinc-800 font-medium text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {t === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 focus-within:border-indigo-600">
              <Mail className="h-4 w-4 shrink-0 text-zinc-500" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="邮箱地址"
                className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-600"
                autoComplete="email"
              />
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 focus-within:border-indigo-600">
              <span className="text-xs text-zinc-500">🔒</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                type="password"
                placeholder="密码（注册至少 6 位）"
                className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-600"
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <Button className="h-10 w-full" onClick={submit} disabled={loading || !email.trim() || !password}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (tab === 'login' ? '登录' : '创建账号')}
            </Button>

            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-zinc-800" />
              <span className="text-[10px] text-zinc-600">或</span>
              <span className="h-px flex-1 bg-zinc-800" />
            </div>
            <button
              disabled
              title="GitHub 登录即将支持"
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 text-sm text-zinc-500 opacity-70"
            >
              <GithubIcon className="h-4 w-4" /> GitHub 登录（即将支持）
            </button>
            <p className="text-center text-[10px] leading-relaxed text-zinc-600">
              登录后你的项目将按账号保存，刷新不丢失 · 极简体验，无需邮箱验证
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
