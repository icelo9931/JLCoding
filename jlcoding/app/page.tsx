'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/TopBar'
import { Sparkles, Clock, FileCode2, MessageSquare, Loader2, Check, Zap, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProjectItem {
  id: string
  name: string
  status: string
  mode: string
  updatedAt: string
  _count: { files: number; messages: number }
}

const EXAMPLES: Record<'novice' | 'expert', string[]> = {
  novice: [
    '做一个待办事项应用，支持添加、完成、删除和筛选',
    '做一个番茄钟，带开始、暂停、重置',
    '做一个猜数字小游戏，有提示和计分',
  ],
  expert: [
    '做一个看板应用，支持拖拽卡片在待办/进行中/完成三列间移动',
    '做一个记账应用，含分类、金额统计和月度图表',
    '做一个 Markdown 笔记应用，支持实时预览和标签',
  ],
}

const STATUS_BADGE: Record<string, string> = {
  ready: 'border-emerald-800 bg-emerald-950 text-emerald-400',
  building: 'border-indigo-800 bg-indigo-950 text-indigo-300',
  awaiting: 'border-indigo-800 bg-indigo-950 text-indigo-300',
  paused: 'border-amber-800 bg-amber-950 text-amber-400',
  error: 'border-red-800 bg-red-950 text-red-400',
  draft: 'border-zinc-700 bg-zinc-900 text-zinc-400',
}
const STATUS_TEXT: Record<string, string> = {
  ready: '已就绪', building: '构建中', awaiting: '待确认', paused: '已暂停', error: '出错', draft: '草稿',
}
const MODE_TEXT: Record<string, string> = { novice: '小白', expert: '专家' }

export default function HomePage() {
  const router = useRouter()
  const [mode, setMode] = useState<'novice' | 'expert'>('novice')
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
        body: JSON.stringify({ name: content.slice(0, 24), mode }),
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
        <section className="pb-10 pt-16 text-center sm:pt-20">
          <h1 className="mx-auto max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            <span className="text-zinc-500">Describe it.</span>{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">Build it.</span>{' '}
            <span className="text-zinc-500">Ship it.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-zinc-500 sm:text-base">
            说一句中文，AI 智能体把它变成可运行的 React 应用 ——
            <span className="text-zinc-300"> 需求确认、架构设计、代码生成、沙箱校验、实时预览</span>
          </p>
        </section>

        {/* 模式选择 */}
        <section className="grid gap-4 sm:grid-cols-2">
          <ModeCard
            selected={mode === 'novice'}
            onClick={() => setMode('novice')}
            title="小白模式"
            tagline="一句话，变应用"
            features={['全自动直达结果，零门槛', '需求理解一键确认', '进度友好呈现，不被代码细节打扰']}
            mascot={<NoviceBot />}
            accent="sky"
            icon={<Zap className="h-4 w-4" />}
          />
          <ModeCard
            selected={mode === 'expert'}
            onClick={() => setMode('expert')}
            title="专家模式"
            tagline="每一步都由你掌控"
            features={['完整 Agent 工作日志与文件树', '10 个 OpenCode Go 模型任选', '可暂停 / 断点续跑，多轮打磨']}
            mascot={<ExpertBot />}
            accent="violet"
            icon={<SlidersHorizontal className="h-4 w-4" />}
          />
        </section>

        {/* 输入区 */}
        <section className="mt-8">
          <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border bg-zinc-900 p-2.5 shadow-xl focus-within:border-indigo-600">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); start() }
              }}
              rows={2}
              placeholder={mode === 'novice' ? '想做点什么？一句话就够了…' : '详细描述你的需求，越具体越好…'}
              className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-zinc-600"
            />
            <Button size="lg" onClick={() => start()} disabled={creating || !input.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              开始生成
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {EXAMPLES[mode].map((ex) => (
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

        {/* 项目列表 */}
        <section className="pb-20 pt-12">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-300">我的项目</h2>
          </div>
          {!loaded ? (
            <div className="py-10 text-center text-sm text-zinc-600">加载中…</div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-dashed py-12 text-center text-sm text-zinc-600">
              还没有项目，选择模式后输入上方的需求开始第一个
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
                    <span className={cn('rounded px-1.5 py-0.5', p.mode === 'expert' ? 'bg-violet-950 text-violet-300' : 'bg-sky-950 text-sky-300')}>
                      {MODE_TEXT[p.mode] ?? p.mode}
                    </span>
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

function ModeCard({ selected, onClick, title, tagline, features, mascot, accent, icon }: {
  selected: boolean
  onClick: () => void
  title: string
  tagline: string
  features: string[]
  mascot: React.ReactNode
  accent: 'sky' | 'violet'
  icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-start gap-4 overflow-hidden rounded-2xl border p-5 text-left transition-all',
        selected
          ? accent === 'sky'
            ? 'border-sky-600 bg-gradient-to-br from-sky-950/60 to-zinc-950 shadow-[0_0_24px_rgba(14,165,233,.15)]'
            : 'border-violet-600 bg-gradient-to-br from-violet-950/60 to-zinc-950 shadow-[0_0_24px_rgba(139,92,246,.15)]'
          : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-600'
      )}
    >
      {selected && (
        <span className={cn(
          'absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full',
          accent === 'sky' ? 'bg-sky-600' : 'bg-violet-600'
        )}>
          <Check className="h-3 w-3 text-white" />
        </span>
      )}
      <div className={cn(
        'flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl',
        selected
          ? accent === 'sky' ? 'bg-sky-900/60' : 'bg-violet-900/60'
          : 'bg-zinc-800/60'
      )}>
        {mascot}
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn('flex items-center gap-1.5 text-lg font-semibold', selected ? 'text-white' : 'text-zinc-200')}>
          {icon}
          {title}
        </div>
        <div className={cn('mt-0.5 text-sm', selected ? (accent === 'sky' ? 'text-sky-300' : 'text-violet-300') : 'text-zinc-500')}>
          {tagline}
        </div>
        <ul className="mt-3 space-y-1.5">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-1.5 text-xs leading-relaxed text-zinc-400">
              <Check className={cn('h-3 w-3 shrink-0', selected ? (accent === 'sky' ? 'text-sky-400' : 'text-violet-400') : 'text-zinc-600')} />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </button>
  )
}

// 卡通形象：圆脸小机器人（小白）
function NoviceBot() {
  return (
    <svg viewBox="0 0 64 64" className="h-11 w-11">
      <defs>
        <linearGradient id="nb" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <line x1="32" y1="6" x2="32" y2="12" stroke="#7dd3fc" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="5" r="3" fill="#f0abfc" />
      <rect x="12" y="13" width="40" height="34" rx="12" fill="url(#nb)" />
      <circle cx="24" cy="28" r="4" fill="#0c4a6e" />
      <circle cx="40" cy="28" r="4" fill="#0c4a6e" />
      <circle cx="25" cy="27" r="1.3" fill="#fff" />
      <circle cx="41" cy="27" r="1.3" fill="#fff" />
      <path d="M24 37 q8 6 16 0" stroke="#0c4a6e" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="18" cy="20" r="2" fill="#bae6fd" opacity=".7" />
      <rect x="22" y="49" width="20" height="6" rx="3" fill="#38bdf8" opacity=".5" />
    </svg>
  )
}

// 卡通形象：戴眼镜的工程机器人（专家）
function ExpertBot() {
  return (
    <svg viewBox="0 0 64 64" className="h-11 w-11">
      <defs>
        <linearGradient id="eb" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <path d="M28 8 l4-4 4 4 -2 6 h-4 z" fill="#ddd6fe" />
      <rect x="12" y="13" width="40" height="34" rx="10" fill="url(#eb)" />
      <rect x="18" y="23" width="12" height="9" rx="3" fill="#1e1b4b" />
      <rect x="34" y="23" width="12" height="9" rx="3" fill="#1e1b4b" />
      <line x1="30" y1="27" x2="34" y2="27" stroke="#1e1b4b" strokeWidth="2" />
      <circle cx="24" cy="27.5" r="2.2" fill="#a5f3fc" />
      <circle cx="40" cy="27.5" r="2.2" fill="#a5f3fc" />
      <path d="M26 38 h12" stroke="#1e1b4b" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M12 22 l-6 -4 M52 22 l6 -4" stroke="#c4b5fd" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="18" cy="20" r="2" fill="#ede9fe" opacity=".7" />
    </svg>
  )
}
