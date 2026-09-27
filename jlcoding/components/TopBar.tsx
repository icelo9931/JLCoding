'use client'

import { GithubIcon } from '@/components/icons'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Button } from '@/components/ui/button'
import { AgentAvatar } from '@/components/AgentAvatars'
import { AGENTS } from '@/lib/agents'
import { Download, Rocket, Terminal, ArrowLeft, Pause, Play, Wrench, Loader2, History, RotateCcw, GitCommitHorizontal, ExternalLink, Compass } from 'lucide-react'
import type { VersionItem } from '@/components/Workspace'

// 平台构建 SHA：对应 jlCoding 自身 GitHub 仓库的 commit（构建时由 scripts/build-info.mjs 注入）
function BuildInfoChip() {
  const [info, setInfo] = useState<{ sha: string | null; builtAt: string; host: string } | null>(null)
  useEffect(() => {
    fetch('/build-info.json')
      .then((r) => (r.ok ? r.json() : null))
      .then(setInfo)
      .catch(() => {})
  }, [])
  if (!info?.sha) return null
  return (
    <a
      href={`https://github.com/icelo9931/JLCoding/commit/${info.sha}`}
      target="_blank"
      rel="noreferrer"
      className="hidden items-center gap-1 font-mono text-[10px] text-zinc-500 transition-colors hover:text-zinc-300 lg:flex"
      title={`jlCoding 平台构建 commit（${info.host} · ${new Date(info.builtAt).toLocaleString()}）→ GitHub`}
    >
      <GitCommitHorizontal className="h-3 w-3" />
      build {info.sha.slice(0, 8)}
    </a>
  )
}

// 版本徽章 + 历史下拉：v3 · a1b2c3d4，点击展开 append-only 历史（含 provider 路径），可回滚任意旧版本
function VersionMenu({ version, versions, onRollback, rollingBack, readOnly = false }: {
  version: { version: number; sha: string } | null
  versions: VersionItem[]
  onRollback: (v: number) => void
  rollingBack: boolean
  readOnly?: boolean
}) {
  if (!version) return null
  const current = versions.find((v) => v.version === version.version)
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="flex h-6 items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 font-mono text-xs text-zinc-300 transition-colors hover:border-indigo-500"
          title={readOnly ? '版本历史（append-only，只读）' : '版本历史（append-only，点击历史项回滚）'}
        >
          <History className="h-3 w-3" />
          v{version.version} · {version.sha.slice(0, 8)}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="start"
          className="z-50 max-h-[340px] min-w-[300px] overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl"
        >
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
            版本历史 · append-only{readOnly ? ' · 只读浏览' : ' · 点击回滚'}
          </div>
          {versions.length === 0 && <div className="px-2 py-2 text-xs text-zinc-500">暂无版本</div>}
          {versions.map((v) => (
            <DropdownMenu.Item
              key={v.version}
              disabled={readOnly || rollingBack || v.version === version.version}
              onSelect={() => { if (!readOnly) onRollback(v.version) }}
              className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-xs outline-none data-[highlighted]:bg-zinc-800 disabled:opacity-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={v.version === version.version ? 'font-medium text-emerald-400' : 'font-medium text-zinc-200'}>
                    v{v.version}{v.version === version.version && '（当前）'}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">{v.sha.slice(0, 8)}</span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-zinc-400" title={v.summary}>{v.summary}</div>
                <div className="mt-0.5 text-[10px] text-zinc-600">
                  {new Date(v.createdAt).toLocaleString()}
                  {v.provider ? ` · ${v.provider}` : ''}
                </div>
              </div>
              {readOnly || v.version === version.version ? null : rollingBack ? (
                <Loader2 className="mt-1 h-3.5 w-3.5 animate-spin text-zinc-500" />
              ) : (
                <RotateCcw className="mt-1 h-3.5 w-3.5 text-indigo-400" />
              )}
            </DropdownMenu.Item>
          ))}
          {current?.provider && (
            <div className="border-t border-zinc-800 px-2 py-1.5 text-[10px] text-zinc-500">
              当前版本生成路径：{current.provider}
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

// 生成路径徽章：区分「真实模型调用」与「无 Key 的 Mock 演示」（数据源 /api/status，与每轮 system 记录互补）
function ProviderBadge() {
  const [info, setInfo] = useState<{ hasModel: boolean; gatewayReachable: boolean | null } | null>(null)
  useEffect(() => {
    fetch('/api/status')
      .then((r) => (r.ok ? r.json() : null))
      .then(setInfo)
      .catch(() => {})
  }, [])
  if (!info) return null
  return info.hasModel ? (
    <span
      className="rounded-full border border-emerald-800 bg-emerald-950 px-2.5 py-0.5 text-xs text-emerald-400"
      title={`OpenCode Zen 真实模型调用${info.gatewayReachable === false ? '（网关探测失败，请检查网络）' : '（网关可达）'}`}
    >
      真实模型{info.gatewayReachable === false ? ' · 网关异常' : ''}
    </span>
  ) : (
    <span
      className="rounded-full border border-amber-800 bg-amber-950 px-2.5 py-0.5 text-xs text-amber-400"
      title="服务端未配置 OPENCODE_API_KEY，生成走 Mock 演示路径（预置数据）"
    >
      Mock 演示
    </span>
  )
}

export function BrandMark() {
  return (
    <span className="flex items-center gap-3">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600">
        <Terminal className="h-6 w-6" />
      </span>
      <span className="text-xl font-bold leading-none">jlCoding</span>
    </span>
  )
}

export function TopBar({ projectName, projectId, status, mode, agent, running, version, versions, rollingBack, onRollback, deploy, deploying, onDeploy, isPythonApp, githubConnected, pushing, pushUrl, onPush, onPause, onResume, onOpenSkills, readOnly = false, published = false, author = null, onTogglePublish, publishing = false }: {
  projectName: string
  projectId: string
  status: string
  mode: string
  agent: string | null
  running: boolean
  version: { version: number; sha: string } | null
  versions: VersionItem[]
  rollingBack: boolean
  onRollback: (v: number) => void
  deploy: { url: string; sha: string } | null
  deploying: boolean
  onDeploy: () => void
  isPythonApp: boolean
  githubConnected: boolean
  pushing: boolean
  pushUrl: string | null
  onPush: () => void
  onPause: () => void
  onResume: () => void
  onOpenSkills: () => void
  readOnly?: boolean
  published?: boolean
  author?: { name: string; maskedEmail: string } | null
  onTogglePublish?: () => void
  publishing?: boolean
}) {
  const agentDef = AGENTS.find((a) => a.id === agent)
  const agentBg = agentDef?.bg ?? 'bg-zinc-800'

  return (
    <header className="flex h-16 items-center gap-3 border-b bg-zinc-950 px-4">
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
      <VersionMenu version={version} versions={versions} onRollback={onRollback} rollingBack={rollingBack} readOnly={readOnly} />
      <ProviderBadge />
      {/* 发现模式：只读浏览别人发布的项目，展示发布者 */}
      {readOnly && (
        <span className="flex items-center gap-1.5 rounded-full border border-indigo-800 bg-indigo-950/60 px-2.5 py-0.5 text-xs text-indigo-300" title="来自「发现」的公开项目 · 只读浏览（对话/版本/源码/预览）">
          <Compass className="h-3.5 w-3.5" />
          只读 · 发布者 {author ? `${author.name}（${author.maskedEmail}）` : '匿名'}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {/* 技能 / MCP：仅归属人可见 */}
        {!readOnly && (mode === 'expert' ? (
          <Button variant="outline" size="sm" onClick={onOpenSkills} title="管理自定义 Skill / MCP / Agent">
            <Wrench className="h-4 w-4" /> 技能 & MCP
          </Button>
        ) : (
          <button onClick={onOpenSkills} className="hidden text-[11px] text-zinc-600 transition-colors hover:text-zinc-400 sm:block" title="进阶能力，感兴趣可以看看">
            进阶：技能/MCP（专家模式可用）
          </button>
        ))}
        {/* 只读模式：仅保留下载（含源码）与已部署链接 */}
        {!readOnly && running && (
          <Button variant="destructive" size="sm" onClick={onPause} title="暂停生成（已完成阶段保留，稍后可继续）">
            <Pause className="h-4 w-4" /> 暂停
          </Button>
        )}
        {!readOnly && status === 'paused' && !running && (
          <Button size="sm" onClick={onResume}>
            <Play className="h-4 w-4" /> 继续生成
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => (window.location.href = `/api/projects/${projectId}/download`)}
          disabled={!readOnly && status !== 'ready'}
        >
          <Download className="h-4 w-4" /> 下载代码
        </Button>
        {/* 推送到 GitHub（仅归属人且已连接 PAT） */}
        {!readOnly && githubConnected && (
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
        {/* 部署：esbuild 打包为自包含单页 → 公开链接 /app/:id（Python 桌面应用如实禁用；只读模式仅展示已有链接） */}
        {deploy ? (
          <a
            href={deploy.url}
            target="_blank"
            rel="noreferrer"
            className="flex h-8 items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-950/60 px-3 font-mono text-xs text-emerald-300 transition-colors hover:border-emerald-500"
            title={`部署产物 SHA-256：${deploy.sha}（点击打开部署链接，新窗口）`}
          >
            <Rocket className="h-3.5 w-3.5" />
            {readOnly ? '在线体验' : `已部署 · ${deploy.sha.slice(0, 8)}`}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : !readOnly ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onDeploy}
            disabled={status !== 'ready' || deploying || isPythonApp}
            title={
              isPythonApp
                ? 'Python 桌面应用不支持网页部署（部署范围仅限 React 应用）——可下载 ZIP 本机运行'
                : 'esbuild 真实打包为自包含单页应用，托管于 jlCoding（公开访问链接 + 产物 SHA-256）'
            }
          >
            {deploying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {deploying ? '打包部署中…' : '部署'}
          </Button>
        ) : null}
        {/* 发布到「发现」（仅归属人 + 已就绪项目） */}
        {!readOnly && onTogglePublish && (
          <Button
            variant={published ? 'secondary' : 'outline'}
            size="sm"
            onClick={onTogglePublish}
            disabled={publishing || (!published && status !== 'ready')}
            title={published
              ? '该项目的对话/版本/源码已对所有人公开——点击取消发布'
              : '发布到「发现」：把完整对话、版本时间线与源码分享给大家（仅已就绪项目可发布）'}
          >
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Compass className="h-4 w-4" />}
            {published ? '已发布 · 取消' : '发布到发现'}
          </Button>
        )}
        <BuildInfoChip />
        <div className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold">
          JL
        </div>
      </div>
    </header>
  )
}
