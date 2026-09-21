'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Download, Rocket, Terminal, ArrowLeft, Pause, Play } from 'lucide-react'

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

export function TopBar({ projectName, projectId, status, mode, running, onPause, onResume }: {
  projectName: string
  projectId: string
  status: string
  mode: string
  running: boolean
  onPause: () => void
  onResume: () => void
}) {
  return (
    <header className="flex h-14 items-center gap-3 border-b bg-zinc-950 px-4">
      <Link href="/" className="flex items-center gap-2 text-zinc-400 transition-colors hover:text-white">
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <BrandMark />
      </Link>
      <span className="text-zinc-700">/</span>
      <span className="max-w-[220px] truncate text-sm text-zinc-300">{projectName}</span>
      <span className={cn2(mode)}>
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

function cn2(mode: string) {
  return mode === 'expert'
    ? 'rounded-full border border-violet-800 bg-violet-950 px-2.5 py-0.5 text-xs text-violet-300'
    : 'rounded-full border border-sky-800 bg-sky-950 px-2.5 py-0.5 text-xs text-sky-300'
}
