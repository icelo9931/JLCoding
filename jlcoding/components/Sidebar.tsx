'use client'

import { GithubIcon } from '@/components/icons'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { AgentAvatar } from '@/components/AgentAvatars'
import { AGENTS } from '@/lib/agents'
import { loadCustom } from '@/lib/custom-store'
import { loadGithub, type GithubConnection } from '@/lib/github'
import type { AuthUser } from '@/components/LoginModal'
import { cn } from '@/lib/utils'
import { Plus, FolderOpen, Wrench, Bot, Plug, LogOut, PanelLeftClose, PanelLeftOpen, Loader2 } from 'lucide-react'

export interface SidebarProject {
  id: string
  name: string
  status: string
  mode: string
  agent: string | null
  updatedAt: string
}

const STATUS_DOT: Record<string, string> = {
  ready: 'bg-emerald-500',
  building: 'bg-indigo-400 animate-pulse',
  awaiting: 'bg-indigo-400',
  paused: 'bg-amber-500',
  error: 'bg-red-500',
  draft: 'bg-zinc-600',
}

// 首页侧栏：展开态内容（宽度由外层 PanelGroup 拖拽控制）
export function Sidebar({ projects, user, github, onNew, onOpenProject, onOpenSkills, onOpenConnect, onLogout, loadingProjects }: {
  projects: SidebarProject[]
  user: AuthUser | null
  github: GithubConnection | null
  onNew: () => void
  onOpenProject: (id: string) => void
  onOpenSkills: () => void
  onOpenConnect: () => void
  onLogout: () => void
  loadingProjects: boolean
}) {
  const [skillsCount, setSkillsCount] = useState(0)
  const [mcpsCount, setMcpsCount] = useState(0)
  const [agentsCount, setAgentsCount] = useState(0)
  const [githubState, setGithubState] = useState<GithubConnection | null>(null)

  useEffect(() => {
    const c = loadCustom()
    setSkillsCount(c.skills.length)
    setMcpsCount(c.mcps.length)
    setAgentsCount(c.agents.length)
    setGithubState(loadGithub())
  }, [])

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">工作台</span>
      </div>

      <div className="px-2">
        <Button className="h-9 w-full justify-start gap-2" size="sm" onClick={onNew}>
          <Plus className="h-4 w-4" /> 新建项目
        </Button>
      </div>

      {/* 我的项目 */}
      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 px-3 pb-1.5 text-[11px] font-medium text-zinc-500">
          <FolderOpen className="h-3.5 w-3.5" />我的项目
          {loadingProjects && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {projects.length === 0 && !loadingProjects && (
            <p className="px-2 py-3 text-[11px] leading-relaxed text-zinc-600">还没有项目<br />输入一句需求开始第一个</p>
          )}
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => onOpenProject(p.id)}
              className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-zinc-900"
            >
              <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', AGENTS.find((a) => a.id === p.agent)?.bg ?? 'bg-zinc-800')}>
                <AgentAvatar agentId={p.agent ?? 'engineer'} size="sm" />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-zinc-300 group-hover:text-white">{p.name}</span>
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[p.status] ?? STATUS_DOT.draft)} />
            </button>
          ))}
        </div>
      </div>

      {/* 技能 / MCP / Agent */}
      <div className="border-t px-2 py-2">
        <div className="flex items-center gap-1.5 px-2 pb-1.5 text-[11px] font-medium text-zinc-500">
          <Wrench className="h-3.5 w-3.5" />能力
        </div>
        {([
          ['技能 Skill', skillsCount],
          ['MCP 服务', mcpsCount],
          ['自定义 Agent', agentsCount],
        ] as const).map(([label, count]) => (
          <button
            key={label}
            onClick={onOpenSkills}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white"
          >
            <Bot className="h-3.5 w-3.5" />
            <span className="flex-1">{label}</span>
            {count > 0 && <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">{count}</span>}
          </button>
        ))}
      </div>

      {/* 连接区 + 账号 */}
      <div className="border-t px-2 py-2">
        <button
          onClick={onOpenConnect}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white"
        >
          <Plug className="h-3.5 w-3.5" />
          <span className="flex-1">连接工具</span>
          {github || githubState ? (
            <GithubIcon className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <span className="text-[10px] text-zinc-600">未连接</span>
          )}
        </button>

        <div className="mt-2 flex items-center gap-2 rounded-lg px-2 py-1.5">
          {user ? (
            <>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-[10px] font-bold uppercase">
                {user.name.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{user.name}</span>
              <button onClick={onLogout} title="退出登录" className="rounded p-1 text-zinc-600 hover:text-red-400">
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <span className="text-[11px] text-zinc-600">未登录（输入需求时登录）</span>
          )}
        </div>
      </div>
    </div>
  )
}

// 收起态：图标栏
export function SidebarRail({ onExpand, onNew, onOpenSkills, onOpenConnect, projectCount }: {
  onExpand: () => void
  onNew: () => void
  onOpenSkills: () => void
  onOpenConnect: () => void
  projectCount: number
}) {
  return (
    <div className="flex h-full flex-col items-center gap-1 bg-zinc-950 py-3">
      <button onClick={onExpand} title="展开侧栏" className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white">
        <PanelLeftOpen className="h-4 w-4" />
      </button>
      <button onClick={onNew} title="新建项目" className="rounded-lg bg-indigo-600 p-2 text-white hover:bg-indigo-500">
        <Plus className="h-4 w-4" />
      </button>
      <div className="relative my-1" title={`我的项目（${projectCount}）`}>
        <FolderOpen className="h-4 w-4 text-zinc-500" />
        <span className="absolute -right-1.5 -top-1.5 rounded-full bg-zinc-700 px-1 text-[9px] text-zinc-300">{projectCount}</span>
      </div>
      <button onClick={onOpenSkills} title="技能/MCP/Agent" className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white">
        <Wrench className="h-4 w-4" />
      </button>
      <button onClick={onOpenConnect} title="连接工具" className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white">
        <Plug className="h-4 w-4" />
      </button>
      <button onClick={onExpand} className="mt-auto rounded-lg p-2 text-zinc-600 hover:text-white" title="展开">
        <PanelLeftClose className="h-4 w-4 rotate-180" />
      </button>
    </div>
  )
}
