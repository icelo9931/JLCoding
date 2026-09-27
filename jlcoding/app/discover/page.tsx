'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BrandMark } from '@/components/TopBar'
import { cn } from '@/lib/utils'
import { Compass, Loader2, Sparkles, FileCode2, GitBranch, MessagesSquare, Rocket, ArrowRight, User } from 'lucide-react'

interface DiscoverItem {
  id: string
  name: string
  author: { name: string; maskedEmail: string }
  publishedAt: string | null
  model: string | null
  provider: string | null
  status: string
  rounds: number
  files: number
  versions: number
  hasDeploy: boolean
  deploySha: string | null
}

// 「发现」公开页：所有人（无需登录）可浏览大家发布的优秀项目，点开只读查看多轮对话与多次结果
export default function DiscoverPage() {
  const router = useRouter()
  const [items, setItems] = useState<DiscoverItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/discover')
      .then(async (r) => {
        if (r.ok) return r.json()
        const b = await r.json().catch(() => ({}))
        throw new Error(b.error || `加载失败（${r.status}）`)
      })
      .then((list) => setItems(Array.isArray(list) ? list : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen">
      <header className="flex h-16 items-center border-b px-5">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <BrandMark />
        </Link>
        <span className="ml-4 flex items-center gap-1.5 rounded-full border border-indigo-800 bg-indigo-950/50 px-3 py-1 text-xs text-indigo-300">
          <Compass className="h-3.5 w-3.5" />发现 · 社区精选项目
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/" className="text-xs text-zinc-400 transition-colors hover:text-white">返回首页</Link>
          <Link href="/" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500">
            我也来做一个
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            看看大家用 <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">jlCoding</span> 做了什么
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            每个项目都包含完整的多轮对话与多次迭代结果（版本时间线 + SHA），点开可直接查看源码、预览与下载 —— 供你参考与启发。
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />加载中…
          </div>
        )}
        {error && <div className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-800 py-20 text-center">
            <Sparkles className="h-8 w-8 text-zinc-700" />
            <p className="text-sm text-zinc-400">还没有人发布项目</p>
            <p className="max-w-sm text-xs leading-relaxed text-zinc-600">
              完成一个项目生成后，在工作台右上角点「发布到发现」，即可把你的作品（含完整对话与版本）分享给大家
            </p>
            <Link href="/" className="mt-1 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500">
              去做第一个 <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it) => (
              <button
                key={it.id}
                onClick={() => router.push(`/project/${it.id}?from=discover`)}
                className="group flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-left transition-all hover:border-indigo-700 hover:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100 group-hover:text-white" title={it.name}>
                    {it.name}
                  </h3>
                  {it.hasDeploy && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-800 bg-emerald-950/60 px-2 py-0.5 text-[10px] text-emerald-400">
                      <Rocket className="h-3 w-3" />可在线体验
                    </span>
                  )}
                </div>

                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-500">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {it.author.name}
                    <span className="text-zinc-600">（{it.author.maskedEmail}）</span>
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                  <span className="flex items-center gap-1 rounded-md bg-zinc-800/70 px-2 py-1">
                    <MessagesSquare className="h-3 w-3 text-sky-400" />{it.rounds} 条对话
                  </span>
                  <span className="flex items-center gap-1 rounded-md bg-zinc-800/70 px-2 py-1">
                    <GitBranch className="h-3 w-3 text-amber-400" />{it.versions} 个版本
                  </span>
                  <span className="flex items-center gap-1 rounded-md bg-zinc-800/70 px-2 py-1">
                    <FileCode2 className="h-3 w-3 text-emerald-400" />{it.files} 个文件
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-zinc-800/70 pt-2.5">
                  <span className={cn('truncate text-[10px]', it.provider?.startsWith('mock') ? 'text-amber-500' : 'text-zinc-600')} title={it.model ?? ''}>
                    {it.model ? `${it.model}` : '（未记录模型）'}
                  </span>
                  <span className="shrink-0 text-[10px] text-zinc-600">
                    {it.publishedAt ? new Date(it.publishedAt).toLocaleDateString('zh-CN') : ''}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
