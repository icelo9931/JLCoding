'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/TopBar'
import { AgentAvatar } from '@/components/AgentAvatars'
import { AGENTS, DEFAULT_AGENT } from '@/lib/agents'
import { GO_MODELS, DEFAULT_MODEL } from '@/lib/models'
import { loadCustom } from '@/lib/custom-store'
import { parseFiles } from '@/lib/file-read'
import { cn } from '@/lib/utils'
import { Sparkles, Clock, FileCode2, MessageSquare, Loader2, Check, Paperclip, X, ChevronDown } from 'lucide-react'

interface ProjectItem {
  id: string
  name: string
  status: string
  mode: string
  agent: string | null
  updatedAt: string
  _count: { files: number; messages: number }
}

const DEEPSEEK_ONLY = GO_MODELS.filter((m) => m.id.startsWith('deepseek'))

const EXAMPLES: Record<'novice' | 'expert', string[]> = {
  novice: [
    '做一个待办事项应用，支持添加、完成、删除和筛选',
    '做一个番茄钟，带开始、暂停、重置',
    '做一个猜数字小游戏，有提示和计分',
  ],
  expert: [
    '做一个看板应用，支持拖拽卡片在三列间移动',
    '做一个记账应用，含分类、金额统计和月度图表',
    '做一个阴阳历转换计算器，双向查询',
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

const MODE_DESC: Record<'novice' | 'expert', { title: string; desc: string }> = {
  novice: { title: '小白模式', desc: '全自动直达：需求确认后一键生成，进度友好呈现，不被代码细节打扰。' },
  expert: { title: '专家模式', desc: '全程可控：完整 Agent 日志/文件树/终端，可自定义 Skill、MCP 与 Agent，支持暂停续跑。' },
}

export default function HomePage() {
  const router = useRouter()
  const [mode, setMode] = useState<'novice' | 'expert'>('novice')
  const [agentId, setAgentId] = useState<string>(DEFAULT_AGENT)
  const [model, setModel] = useState<string>(DEFAULT_MODEL)
  const [input, setInput] = useState('')
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [creating, setCreating] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [customAgents, setCustomAgents] = useState<{ id: string; name: string; prompt: string }[]>([])
  const [fileText, setFileText] = useState<string | null>(null)
  const [fileChips, setFileChips] = useState<string[]>([])
  const uploadRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setCustomAgents(loadCustom().agents)
  }, [])

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
      const agent = agentId.startsWith('custom:')
        ? agentId
        : agentId
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: content.slice(0, 24), mode, agent }),
      })
      const project = await res.json()
      sessionStorage.setItem(`jlcoding:pending:${project.id}`, content)
      if (fileText) sessionStorage.setItem(`jlcoding:ctx:${project.id}`, JSON.stringify({ text: fileText, chips: fileChips }))
      router.push(`/project/${project.id}`)
    } finally {
      setCreating(false)
    }
  }

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return
    const parsed = await parseFiles(files)
    setFileText((prev) => [prev ?? '', parsed.text].filter(Boolean).join('\n\n'))
    setFileChips((prev) => [...prev, ...parsed.chips])
  }

  const currentModel = DEEPSEEK_ONLY.find((m) => m.id === model) ?? DEEPSEEK_ONLY[0]
  const selectedBuiltIn = AGENTS.find((a) => a.id === agentId)

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

      <main className="mx-auto max-w-3xl px-4">
        <section className="pb-6 pt-12 text-center">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            <span className="text-zinc-500">Describe it.</span>{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">Build it.</span>{' '}
            <span className="text-zinc-500">Ship it.</span>
          </h1>
        </section>

        {/* Agent 头像行（atoms 风格，prompt 上方） */}
        <section className="mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {AGENTS.map((a) => (
              <div key={a.id} className="group relative">
                <button
                  onClick={() => setAgentId(a.id)}
                  title={a.name}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-xs transition-all',
                    agentId === a.id
                      ? 'border-indigo-500 bg-indigo-950/60 text-white shadow-[0_0_12px_rgba(99,102,241,.3)]'
                      : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                  )}
                >
                  <span className={cn('flex h-6 w-6 items-center justify-center rounded-full', a.bg)}>
                    <AgentAvatar agentId={a.id} size="sm" />
                  </span>
                  <span className="hidden sm:inline">{a.name}</span>
                </button>
                {/* 悬浮解释 */}
                <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900 p-2.5 text-left opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                  <div className={cn('text-xs font-semibold', a.color)}>{a.name} · {a.tagline}</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{a.description}</p>
                </div>
              </div>
            ))}
            {customAgents.map((a) => (
              <div key={a.id} className="group relative">
                <button
                  onClick={() => setAgentId(a.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-xs transition-all',
                    agentId === a.id
                      ? 'border-indigo-500 bg-indigo-950/60 text-white'
                      : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600'
                  )}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800">
                    <AgentAvatar agentId="custom" size="sm" />
                  </span>
                  <span className="hidden sm:inline">{a.name}</span>
                </button>
                <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900 p-2.5 text-left opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                  <div className="text-xs font-semibold text-zinc-300">{a.name} · 自定义</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{a.prompt.slice(0, 90)}…</p>
                </div>
              </div>
            ))}
            {selectedBuiltIn && (
              <span className="ml-1 hidden text-[11px] text-zinc-500 sm:inline">
                主导：{selectedBuiltIn.name}（生成全流程仍由五角色协作完成）
              </span>
            )}
          </div>
        </section>

        {/* 大对话框 */}
        <section>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-2xl transition-all focus-within:border-indigo-500 focus-within:shadow-[0_0_32px_rgba(99,102,241,.25)]">
            {/* 附件 chips */}
            {fileChips.length > 0 && (
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {fileChips.map((c, i) => (
                  <span key={i} className="flex items-center gap-1 rounded-full border border-amber-800/60 bg-amber-950/40 px-2.5 py-1 text-[11px] text-amber-300">
                    <FileCode2 className="h-3 w-3" />{c}
                    <button onClick={() => { setFileChips((p) => p.filter((_, j) => j !== i)); setFileText(null) }}>
                      <X className="h-3 w-3 hover:text-white" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); start() }
              }}
              rows={4}
              placeholder={agentId === 'data-analyst' ? '描述你的数据问题，并点击右下角 📎 上传文本/表格文件…' : '详细描述你想做的应用，越具体越好…'}
              className="w-full resize-none bg-transparent px-1 text-base leading-relaxed outline-none placeholder:text-zinc-600"
            />
            {/* 底部工具条：左=提示 右=模式/模型/上传/发送 */}
            <div className="mt-3 flex items-center gap-2 border-t border-zinc-800/70 pt-3">
              <span className="hidden text-[11px] text-zinc-600 sm:inline">Enter 发送 · 生成 React 应用</span>
              <div className="ml-auto flex items-center gap-1.5">
                {/* 模式切换（悬浮解释） */}
                <div className="group relative">
                  <button
                    onClick={() => setMode((m) => (m === 'novice' ? 'expert' : 'novice'))}
                    className={cn(
                      'flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
                      mode === 'expert'
                        ? 'border-violet-700 bg-violet-950/60 text-violet-300'
                        : 'border-sky-800 bg-sky-950/50 text-sky-300'
                    )}
                  >
                    {mode === 'expert' ? '🚀 专家' : '🤖 小白'}
                    <span className="text-[10px] text-zinc-500">切换</span>
                  </button>
                  <div className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 w-60 rounded-lg border border-zinc-700 bg-zinc-900 p-2.5 text-left opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                    <div className="text-xs font-semibold text-zinc-200">{MODE_DESC[mode].title}</div>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{MODE_DESC[mode].desc}</p>
                  </div>
                </div>
                {/* 模型选择（仅 DeepSeek） */}
                <div className="group relative">
                  <button className="flex h-8 items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-200 hover:border-zinc-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {currentModel.label}
                    <ChevronDown className="h-3 w-3 text-zinc-500" />
                  </button>
                  <div className="absolute bottom-full right-0 z-30 mb-2 hidden w-48 rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl group-hover:block">
                    {DEEPSEEK_ONLY.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setModel(m.id)}
                        className={cn(
                          'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs',
                          m.id === model ? 'bg-indigo-950/60 text-indigo-300' : 'text-zinc-300 hover:bg-zinc-800'
                        )}
                      >
                        {m.label}
                        {m.id === model && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 上传 */}
                <button
                  onClick={() => uploadRef.current?.click()}
                  title="上传文本/表格/图片等参考文件"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-400 transition-colors hover:border-indigo-500 hover:text-white"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <input ref={uploadRef} type="file" multiple hidden accept=".txt,.md,.csv,.json,.js,.ts,.html,.xml,.yml,.yaml,.log,image/*" onChange={(e) => onUpload(e.target.files)} />
                <Button size="lg" onClick={() => start()} disabled={creating || !input.trim()}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  开始生成
                </Button>
              </div>
            </div>
          </div>

          {/* 示例 */}
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
        <section className="pb-20 pt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-300">我的项目</h2>
          </div>
          {!loaded ? (
            <div className="py-10 text-center text-sm text-zinc-600">加载中…</div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-dashed py-12 text-center text-sm text-zinc-600">
              还没有项目，选一个 agent、写一句需求开始第一个
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => router.push(`/project/${p.id}`)}
                  className="group flex items-center gap-3 rounded-xl border bg-zinc-900/50 p-4 text-left transition-all hover:border-indigo-700 hover:bg-zinc-900"
                >
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', AGENTS.find((a) => a.id === p.agent)?.bg ?? 'bg-zinc-800')}>
                    <AgentAvatar agentId={p.agent ?? 'engineer'} size="md" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                      <span className={cn('rounded-full border px-2 py-0.5 text-[10px]', STATUS_BADGE[p.status] ?? STATUS_BADGE.draft)}>
                        {STATUS_TEXT[p.status] ?? p.status}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-[11px] text-zinc-500">
                      <span className={cn('rounded px-1.5 py-0.5', p.mode === 'expert' ? 'bg-violet-950 text-violet-300' : 'bg-sky-950 text-sky-300')}>
                        {p.mode === 'expert' ? '专家' : '小白'}
                      </span>
                      <span className="flex items-center gap-1"><FileCode2 className="h-3 w-3" />{p._count.files}</span>
                      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{p._count.messages}</span>
                      <span className="ml-auto flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(p.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
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
