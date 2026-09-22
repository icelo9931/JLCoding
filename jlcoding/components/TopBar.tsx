'use client'

import { GithubIcon } from '@/components/icons'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AgentAvatar } from '@/components/AgentAvatars'
import { AGENTS } from '@/lib/agents'
import { Download, Rocket, Terminal, ArrowLeft, Pause, Play, Wrench, Loader2 } from 'lucide-react'

export function BrandMark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
        <Terminal className="h-4 w-4" />
      </span>
      <span className="text-lg font-bold">jlCoding</span>
    </span>
  )
}

export function TopBar({ projectName, projectId, status, mode, agent, running, githubConnected, pushing, pushUrl, onPush, onPause, onResume, onOpenSkills }: {
  projectName: string
  projectId: string
  status: string
  mode: string
  agent: string | null
  running: boolean
  githubConnected: boolean
  pushing: boolean
  pushUrl: string | null
  onPush: () => void
  onPause: () => void
  onResume: () => void
  onOpenSkills: () => void
}) {
  const agentDef = AGENTS.find((a) => a.id === agent)
  const agentBg = agentDef?.bg ?? 'bg-zinc-800'

  return (
    <header className="flex h-14 items-center gap-3 border-b bg-zinc-950 px-4">
      <Link href="/" className="flex items-center gap-2 text-zinc-400 transition-colors hover:text-white">
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <BrandMark />
      </Link>
      <span className="text-zinc-700">/</span>
      {/* 项目名前的主导 agent 头像 */}
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${agentBg}`} title={agentDef ? `${agentDef.name} · ${agentDef.tagline}` : (agent?.startsWith('custom:') ? '自定义 Agent' : '代码工程师')}>
        <AgentAvatar agentId={agent ?? 'engineer'} size="sm" />
      </span>
      <span className="max-w-[200px] truncate text-sm text-zinc-300">{projectName}</span>
      <span className={mode === 'expert' ? 'rounded-full border border-violet-800 bg-violet-950 px-2.5 py-0.5 text-xs text-violet-300' : 'rounded-full border border-sky-800 bg-sky-950 px-2.5 py-0.5 text-xs text-sky-300'}>
        {mode === 'expert' ? '专家模式' : '小白模式'}
      </span>
      {status === 'ready' && (
        <span className="rounded-full border border-emerald-800 bg-emerald-950 px-2.5 py-0.5 text-xs text-emerald-400">已就绪</span>
      )}
      {status === 'awaiting' && (
        <span className="rounded-full border border-indigo-800 bg-indigo-950 px-2.5 py-0.5 text-xs text-indigo-300">待确认</span>
      )}
      {status === 'building' && (
        <span className="animate-pulse rounded-full border border-indigo-800 bg-indigo-950 px-2.5 py-0.5 text-xs text-indigo-300">构建中</span>
      )}
      {status === 'paused' && (
        <span className="rounded-full border border-amber-800 bg-amber-950 px-2.5 py-0.5 text-xs text-amber-400">已暂停</span>
      )}
      {status === 'error' && (
        <span className="rounded-full border border-red-800 bg-red-950 px-2.5 py-0.5 text-xs text-red-400">出错</span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {/* 技能 / MCP：专家模式入口，小白模式轻提示 */}
        {mode === 'expert' ? (
          <Button variant="outline" size="sm" onClick={onOpenSkills} title="管理自定义 Skill / MCP / Agent">
            <Wrench className="h-4 w-4" /> 技能 & MCP
          </Button>
        ) : (
          <button onClick={onOpenSkills} className="hidden text-[11px] text-zinc-600 transition-colors hover:text-zinc-400 sm:block" title="进阶能力，感兴趣可以看看">
            进阶：技能/MCP（专家模式可用）
          </button>
        )}
        {running && (
          <Button variant="destructive" size="sm" onClick={onPause} title="暂停生成（已完成阶段保留，稍后可继续）">
            <Pause className="h-4 w-4" /> 暂停
          </Button>
        )}
        {status === 'paused' && !running && (
          <Button size="sm" onClick={onResume}>
            <Play className="h-4 w-4" /> 继续生成
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => (window.location.href = `/api/projects/${projectId}/download`)}
          disabled={status !== 'ready'}
        >
          <Download className="h-4 w-4" /> 下载代码
        </Button>
        {/* 推送到 GitHub（已连接 PAT 且项目就绪） */}
        {githubConnected && (
          pushUrl ? (
            <a
              href={pushUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-8 items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-950/60 px-3 text-xs text-emerald-300 hover:border-emerald-500"
            >
              <GithubIcon className="h-3.5 w-3.5" />已推送·查看仓库
            </a>
          ) : (
            <Button variant="outline" size="sm" onClick={onPush} disabled={status !== 'ready' || pushing}>
              {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <GithubIcon className="h-4 w-4" />}
              {pushing ? '推送中…' : '推送 GitHub'}
            </Button>
          )
        )}
        <Button variant="secondary" size="sm" disabled title="部署功能规划中">
          <Rocket className="h-4 w-4" /> 部署
        </Button>
        <div className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold">
          JL
        </div>
      </div>
    </header>
  )
}
