'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Loader2, FileCode2, Sparkles, Clock } from 'lucide-react'

const ROLE_COLORS: Record<string, string> = {
  业务分析师: 'text-sky-400 border-sky-800/60 bg-sky-950/30',
  架构设计师: 'text-violet-400 border-violet-800/60 bg-violet-950/30',
  代码工程师: 'text-emerald-400 border-emerald-800/60 bg-emerald-950/30',
  测试工程师: 'text-amber-400 border-amber-800/60 bg-amber-950/30',
  修复工程师: 'text-rose-400 border-rose-800/60 bg-rose-950/30',
}

// 中间区域：生成进行中的实时对话流（替代空白预览），完成后由预览接管
export function GenerationStream({ streaming, files, progress, stepLabel }: {
  streaming: { agent: string; text: string } | null
  files: Record<string, string>
  progress: number
  stepLabel: string
}) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const elapsedText = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`
  const fileCount = Object.keys(files).length
  const agent = streaming?.agent ?? '系统'
  const color = ROLE_COLORS[agent] ?? 'text-zinc-400 border-zinc-800 bg-zinc-900/40'

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* 顶部状态条 */}
      <div className="flex items-center gap-3 border-b px-4 py-2.5 text-sm">
        <span className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium', color)}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {agent} 工作中
        </span>
        <span className="text-xs text-zinc-500">{stepLabel} · {progress}%</span>
        <span className="flex items-center gap-1 text-xs text-zinc-500"><Clock className="h-3 w-3" />{elapsedText}</span>
        {fileCount > 0 && (
          <span className="ml-auto flex items-center gap-1 text-xs text-emerald-400">
            <FileCode2 className="h-3.5 w-3.5" />已生成 {fileCount} 个文件
          </span>
        )}
      </div>

      {/* 流式正文 */}
      <div className="flex-1 overflow-y-auto p-5">
        {!streaming && (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Sparkles className="h-4 w-4 animate-pulse text-indigo-400" />
            Agent 正在准备…
          </div>
        )}
        {streaming && (
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-indigo-400">
              {streaming.agent} 的思考与输出
            </div>
            <div className="whitespace-pre-wrap rounded-xl border bg-zinc-900/60 p-4 text-sm leading-relaxed text-zinc-200">
              {streaming.text || '…'}
              <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-indigo-400" />
            </div>
          </div>
        )}
      </div>

      {/* 底部提示 */}
      <div className="border-t px-4 py-2 text-center text-[11px] text-zinc-600">
        全部输出结束后，实时预览将在此处呈现 · 随时可点顶部「暂停」，已完成的阶段不会重跑
      </div>
    </div>
  )
}
