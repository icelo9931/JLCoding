'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/TopBar'
import { AgentAvatar } from '@/components/AgentAvatars'
import { LoginModal, type AuthUser } from '@/components/LoginModal'
import { ConnectDialog } from '@/components/ConnectDialog'
import { SkillMcpDialog } from '@/components/SkillMcpDialog'
import { Sidebar, SidebarRail, type SidebarProject } from '@/components/Sidebar'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { AGENTS, DEFAULT_AGENT } from '@/lib/agents'
import { GO_MODELS, DEFAULT_MODEL } from '@/lib/models'
import { loadCustom } from '@/lib/custom-store'
import { loadGithub, type GithubConnection } from '@/lib/github'
import { parseFiles } from '@/lib/file-read'
import { cn } from '@/lib/utils'
import { Sparkles, Loader2, Check, Paperclip, X, FileCode2, Plug, PanelLeftClose, Link2, Globe } from 'lucide-react'

const DEEPSEEK_ONLY = GO_MODELS.filter((m) => m.id.startsWith('deepseek'))

const EXAMPLES: Record<'novice' | 'expert', string[]> = {
  novice: [
    '做一个待办事项应用，支持添加、完成、删除和筛选',
    '做一个阳历阴历日期转换计算器',
  ],
  expert: [
    '做一个看板应用，支持拖拽卡片在三列间移动',
    '做一个记账应用，含分类、金额统计和月度图表',
  ],
}

const MODE_DESC: Record<'novice' | 'expert', { title: string; desc: string }> = {
  novice: { title: '小白模式', desc: '全自动直达：需求确认后一键生成，进度友好呈现，不被代码细节打扰。' },
  expert: { title: '专家模式', desc: '全程可控：完整 Agent 日志/文件树/终端，可自定义 Skill、MCP 与 Agent，支持暂停续跑。' },
}

const COLLAPSE_KEY = 'jlcoding:sidebar-collapsed'

export default function HomePage() {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [pendingInput, setPendingInput] = useState<string | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [github, setGithub] = useState<GithubConnection | null>(null)

  const [mode, setMode] = useState<'novice' | 'expert'>('novice')
  const [agentId, setAgentId] = useState<string>(DEFAULT_AGENT)
  const [model, setModel] = useState<string>(DEFAULT_MODEL)
  const [input, setInput] = useState('')
  const [projects, setProjects] = useState<SidebarProject[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [creating, setCreating] = useState(false)
  const [customAgents, setCustomAgents] = useState<{ id: string; name: string; prompt: string }[]>([])
  const [fileText, setFileText] = useState<string | null>(null)
  const [fileChips, setFileChips] = useState<string[]>([])
  const [links, setLinks] = useState<string[]>([])
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkInput, setLinkInput] = useState('')
  const uploadRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const addLink = () => {
    const raw = linkInput.trim()
    if (!raw) { setLinkOpen(false); return }
    const url = /^https?:\/\//.test(raw) ? raw : `https://${raw}`
    setLinks((prev) => (prev.includes(url) ? prev : [...prev, url]))
    setLinkInput('')
    setLinkOpen(false)
  }

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1')
    setCustomAgents(loadCustom().agents)
    setGithub(loadGithub())
    fetch('/api/auth/me').then((r) => r.json()).then((d) => { setUser(d.user ?? null); setAuthChecked(true) })
  }, [])

  const loadProjects = useCallback(() => {
    setLoadingProjects(true)
    fetch('/api/projects')
      .then((r) => r.json())
      .then((l) => setProjects(Array.isArray(l) ? l : []))
      .finally(() => setLoadingProjects(false))
  }, [])

  useEffect(() => { if (authChecked) loadProjects() }, [authChecked, loadProjects])

  // 登录成功：带着暂存需求直接进入新会话
  const onLoginSuccess = (u: AuthUser) => {
    setUser(u)
    loadProjects()
    if (pendingInput) {
      const content = pendingInput
      setPendingInput(null)
      start(content)
    }
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    setProjects([])
  }

  const start = async (prompt?: string) => {
    const content = (prompt ?? input).trim()
    if (!content || creating) return
    // DeepSeek 式门控：未登录，先弹登录卡（暂存需求）
    if (!user) {
      setPendingInput(content)
      setLoginOpen(true)
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: content.slice(0, 24), mode, agent: agentId }),
      })
      if (res.status === 401) {
        setPendingInput(content)
        setLoginOpen(true)
        return
      }
      const project = await res.json()
      sessionStorage.setItem(`jlcoding:pending:${project.id}`, content)
      if (fileText || links.length) {
        sessionStorage.setItem(`jlcoding:ctx:${project.id}`, JSON.stringify({ text: fileText, chips: fileChips, links }))
      }
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

  const focusInput = () => inputRef.current?.focus()

  const currentModel = DEEPSEEK_ONLY.find((m) => m.id === model) ?? DEEPSEEK_ONLY[0]

  return (
    <div className="flex h-screen overflow-hidden">
      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} onSuccess={onLoginSuccess} pendingHint={pendingInput ?? undefined} />
      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} onConnected={setGithub} />
      <SkillMcpDialog open={skillsOpen} onOpenChange={setSkillsOpen} />

      {/* 单一分栏布局：侧栏默认 1/5（上限 28%，物理上不可能占满全屏），主区自适应 */}
      {collapsed ? (
        <>
          <div className="w-14 shrink-0 border-r">
            <SidebarRail
              onExpand={() => { setCollapsed(false); localStorage.setItem(COLLAPSE_KEY, '0') }}
              onNew={() => { if (!user) setLoginOpen(true); else focusInput() }}
              onOpenSkills={() => setSkillsOpen(true)}
              onOpenConnect={() => setConnectOpen(true)}
              projectCount={projects.length}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            {MainArea()}
          </div>
        </>
      ) : (
        <PanelGroup direction="horizontal" autoSaveId="jlcoding-home" className="h-full">
          <Panel defaultSize={20} minSize={14} maxSize={28}>
            <div className="relative h-full border-r">
              <button
                onClick={() => { setCollapsed(true); localStorage.setItem(COLLAPSE_KEY, '1') }}
                title="收起侧栏"
                className="absolute right-1.5 top-2 z-10 rounded-md p-1 text-zinc-600 hover:bg-zinc-900 hover:text-white"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
              <Sidebar
                projects={projects}
                user={user}
                github={github}
                loadingProjects={loadingProjects}
                onNew={() => { if (!user) setLoginOpen(true); else focusInput() }}
                onOpenProject={(id) => router.push(`/project/${id}`)}
                onOpenSkills={() => setSkillsOpen(true)}
                onOpenConnect={() => setConnectOpen(true)}
                onLogin={() => setLoginOpen(true)}
                onLogout={logout}
              />
            </div>
          </Panel>
          <PanelResizeHandle className="w-1.5 bg-zinc-900 transition-colors hover:bg-indigo-600" />
          <Panel defaultSize={80} minSize={50}>
            <div className="flex h-full min-w-0 flex-col">
              {MainArea()}
            </div>
          </Panel>
        </PanelGroup>
      )}
    </div>
  )

  // 主区（header + hero + 输入区），抽为内联组件避免两份拷贝
  function MainArea() {
    return (
      <>
        <header className="flex h-16 shrink-0 items-center px-5">
          <BrandMark />
          <span className="ml-4 hidden items-center text-sm text-zinc-500 sm:flex">把 idea 变成可运行的代码</span>
          <div className="ml-auto flex items-center gap-2">
            {!authChecked ? (
              <Loader2 className="h-4 w-4 animate-spin text-zinc-600" />
            ) : user ? (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold uppercase" title={user.email}>
                {user.name.slice(0, 2)}
              </span>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setLoginOpen(true)}>登录 / 注册</Button>
            )}
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 pb-16">
          <h1 className="text-center text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            <span className="text-zinc-500">Describe it.</span>{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">Build it.</span>{' '}
            <span className="text-zinc-500">Ship it.</span>
          </h1>

          {HomeInputArea()}
        </main>
      </>
    )
  }

  function HomeInputArea() {
    return (
      <>
          {/* Agent 头像行：固定一排，横向滚动不换行 */}
          <div className="mt-8 mb-3 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {AGENTS.map((a) => (
              <div key={a.id} className="group relative">
                <button
                  onClick={() => setAgentId((cur) => (cur === a.id ? DEFAULT_AGENT : a.id))}
                  title={agentId === a.id ? `${a.name}（再点一次取消，回到代码工程师）` : a.name}
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
                <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900 p-2.5 text-left opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                  <div className={cn('text-xs font-semibold', a.color)}>{a.name} · {a.tagline}</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{a.description}</p>
                </div>
              </div>
            ))}
            {customAgents.map((a) => (
              <button
                key={a.id}
                onClick={() => setAgentId((cur) => (cur === a.id ? DEFAULT_AGENT : a.id))}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-xs transition-all',
                  agentId === a.id ? 'border-indigo-500 bg-indigo-950/60 text-white' : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600'
                )}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800">
                  <AgentAvatar agentId="custom" size="sm" />
                </span>
                <span className="hidden sm:inline">{a.name}</span>
              </button>
            ))}
          </div>

          {/* 大对话框（拉宽拉长） */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-2xl transition-all focus-within:border-indigo-500 focus-within:shadow-[0_0_32px_rgba(99,102,241,.25)]">
            {(fileChips.length > 0 || links.length > 0) && (
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {links.map((u) => (
                  <span key={u} className="flex max-w-[220px] items-center gap-1 rounded-full border border-sky-800/60 bg-sky-950/40 px-2.5 py-1 text-[11px] text-sky-300">
                    <Globe className="h-3 w-3 shrink-0" />
                    <span className="truncate">{u.replace(/^https?:\/\//, '')}</span>
                    <button onClick={() => setLinks((p) => p.filter((x) => x !== u))}><X className="h-3 w-3 hover:text-white" /></button>
                  </span>
                ))}
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
            {linkOpen && (
              <div className="mb-2.5 flex gap-2">
                <input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addLink() }}
                  placeholder="粘贴参考网页链接（Agent 将抓取内容作为需求参考）"
                  className="h-8 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-xs outline-none focus:border-indigo-600"
                  autoFocus
                />
                <Button size="sm" onClick={addLink}>添加</Button>
              </div>
            )}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); start() }
              }}
              rows={6}
              placeholder={agentId === 'data-analyst' ? '描述你的数据问题，可点左下角 📎 上传文件、🔗 添加链接…' : '描述你想做的应用（可指定编程语言，未指定默认 Python；如"做一个网页版待办"则用 React）…'}
              className="w-full resize-none bg-transparent px-1 text-base leading-relaxed outline-none placeholder:text-zinc-600"
            />
            {/* 工具条：左 = 模式 + 上传 + 链接；右 = 模型及状态 + 开始生成 */}
            <div className="mt-3 flex items-center gap-2 border-t border-zinc-800/70 pt-3">
              {/* 左下角：模式切换（悬浮解释） */}
              <div className="group relative">
                <button
                  onClick={() => setMode((m) => (m === 'novice' ? 'expert' : 'novice'))}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
                    mode === 'expert' ? 'border-violet-700 bg-violet-950/60 text-violet-300' : 'border-sky-800 bg-sky-950/50 text-sky-300'
                  )}
                >
                  {mode === 'expert' ? '🚀 专家' : '🤖 小白'}<span className="text-[10px] text-zinc-500">切换</span>
                </button>
                <div className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-60 rounded-lg border border-zinc-700 bg-zinc-900 p-2.5 text-left opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                  <div className="text-xs font-semibold text-zinc-200">{MODE_DESC[mode].title}</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{MODE_DESC[mode].desc}</p>
                </div>
              </div>
              {/* 模式旁边：文件上传 */}
              <button
                onClick={() => uploadRef.current?.click()}
                title="上传文本/表格/图片等参考文件"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-400 transition-colors hover:border-indigo-500 hover:text-white"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input ref={uploadRef} type="file" multiple hidden accept=".txt,.md,.csv,.json,.js,.ts,.html,.xml,.yml,.yaml,.log,image/*" onChange={(e) => onUpload(e.target.files)} />
              {/* 上传旁边：参考链接 */}
              <button
                onClick={() => setLinkOpen((v) => !v)}
                title="添加参考链接（Agent 抓取网页内容作为需求参考）"
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border transition-colors',
                  linkOpen || links.length > 0
                    ? 'border-sky-700 bg-sky-950/60 text-sky-400'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-sky-600 hover:text-white'
                )}
              >
                <Link2 className="h-4 w-4" />
              </button>

              {/* 右侧：模型及状态 + 开始生成 */}
              <div className="ml-auto flex items-center gap-1.5">
                <div className="group relative">
                  <button className="flex h-8 items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-200 hover:border-zinc-500">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />{currentModel.label}
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
                        {m.label}{m.id === model && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                </div>
                <Button size="lg" onClick={() => start()} disabled={creating || !input.trim()}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  开始生成
                </Button>
              </div>
            </div>
          </div>

          {/* 对话框下面：左侧连接工具 */}
          <div className="mt-3 flex">
            <button
              onClick={() => setConnectOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-800 px-3.5 py-2.5 text-xs text-zinc-500 transition-colors hover:border-indigo-700 hover:text-zinc-300"
            >
              <Plug className="h-3.5 w-3.5" />
              连接 GitHub 等工具，让 Agent 把生成的项目直接推送到你的仓库
              <span className="text-zinc-700">→</span>
            </button>
          </div>

          {/* 再往下一层：两个示例 */}
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
      </>
    )
  }
}
