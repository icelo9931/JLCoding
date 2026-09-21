'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/TopBar'
import { Sparkles, ArrowRight, Clock, FileCode2, MessageSquare, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProjectItem {
  id: string
  name: string
  status: string
  updatedAt: string
  _count: { files: number; messages: number }
}

const EXAMPLES = [
  '做一个待办事项应用，支持添加、完成、删除和筛选',
  '做一个番茄钟，带开始、暂停、重置和进度环',
  '做一个Markdown 卡片式个人主页，展示技能和项目',
]

const STATUS_BADGE: Record<string, string> = {
  ready: 'border-emerald-800 bg-emerald-950 text-emerald-400',
  building: 'border-indigo-800 bg-indigo-950 text-indigo-300',
  error: 'border-red-800 bg-red-950 text-red-400',
  draft: 'border-zinc-700 bg-zinc-900 text-zinc-400',
}
const STATUS_TEXT: Record<string, string> = { ready: '已就绪', building: '构建中', error: '出错', draft: '草稿' }

export default function HomePage() {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [creating, setCreating] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then(setProjects)
      .finally(() => setLoaded(true))
  }, [])

  useEffect(load, [load])

  const start = async (prompt?: string) => {
    const content = (prompt ?? input).trim()
    if (!content || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: content.slice(0, 24) }),
      })
      const project = await res.json()
      sessionStorage.setItem(`jlcoding:pending:${project.id}`, content)
      router.push(`/project/${project.id}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4">
          <BrandMark />
          <span className="ml-3 hidden text-xs text-zinc-500 sm:block">把 idea 变成可运行的代码</span>
          <div className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold">
            JL
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        <section className="py-16 text-center sm:py-24">
          <h1 className="mx-auto max-w-2xl text-3xl font-bold leading-tight sm:text-5xl">
            描述你的 <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">idea</span>
            ，<br className="hidden sm:block" />AI 智能体把它变成可运行的代码
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-zinc-400 sm:text-base">
            业务分析 → 架构设计 → 代码生成 → 沙箱校验 → 实时预览，全流程可视化
          </p>

          <div className="mx-auto mt-8 flex max-w-2xl items-end gap-2 rounded-2xl border bg-zinc-900 p-2.5 shadow-xl focus-within:border-indigo-600">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); start() }
              }}
              rows={2}
              placeholder="想做点什么？例如：做一个待办事项应用…"
              className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-zinc-600"
            />
            <Button size="lg" onClick={() => start()} disabled={creating || !input.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              开始生成
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => start(ex)}
                disabled={creating}
                className="rounded-full border bg-zinc-900 px-3.5 py-1.5 text-xs text-zinc-400 transition-colors hover:border-indigo-700 hover:text-white"
              >
                {ex}
              </button>
            ))}
          </div>
        </section>

        <section className="pb-20">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-300">我的项目</h2>
            <Button variant="outline" size="sm" onClick={() => start('做一个待办事项应用')} disabled={creating}>
              快速体验 <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          {!loaded ? (
            <div className="py-10 text-center text-sm text-zinc-600">加载中…</div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-dashed py-12 text-center text-sm text-zinc-600">
              还没有项目，输入上方的需求开始第一个
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => router.push(`/project/${p.id}`)}
                  className="group rounded-xl border bg-zinc-900/50 p-4 text-left transition-all hover:border-indigo-700 hover:bg-zinc-900"
                >
                  <div className="flex items-center gap-2">
                    <FileCode2 className="h-4 w-4 text-indigo-400" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                    <span className={cn('rounded-full border px-2 py-0.5 text-[10px]', STATUS_BADGE[p.status] ?? STATUS_BADGE.draft)}>
                      {STATUS_TEXT[p.status] ?? p.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1"><FileCode2 className="h-3 w-3" />{p._count.files} 文件</span>
                    <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{p._count.messages} 消息</span>
                    <span className="ml-auto flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(p.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
