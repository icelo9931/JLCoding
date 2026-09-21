'use client'

import { cn } from '@/lib/utils'
import { Loader2, Check, Clock } from 'lucide-react'

const STEP_LABELS = ['分析需求', '设计架构', '生成代码', '沙箱测试', '预览就绪']

export function ProgressBar({ progress, stepLabel, running, status, error }: {
  progress: number
  stepLabel: string
  running: boolean
  status: string
  error: string | null
}) {
  return (
    <div className="border-b bg-zinc-950/80 px-4 py-2.5 backdrop-blur">
      <div className="flex items-center gap-4">
        <div className="flex flex-1 items-center gap-2.5 overflow-hidden">
          {STEP_LABELS.map((label, i) => {
            const done = progress === 100 || progress > ((i + 1) / 5) * 100
            const isActive = (running || status === 'awaiting') && !done && progress > (i / 5) * 100 - 1
            return (
              <div key={label} className="flex items-center gap-2 whitespace-nowrap">
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-medium',
                    done && 'border-emerald-700 bg-emerald-900 text-emerald-300',
                    isActive && !done && 'border-indigo-500 bg-indigo-950 text-indigo-300 shadow-[0_0_8px_rgba(99,102,241,.5)]',
                    !done && !isActive && 'border-zinc-700 text-zinc-600'
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : isActive ? <Loader2 className="h-3 w-3 animate-spin" /> : i + 1}
                </span>
                <span className={cn('text-sm', done || isActive ? 'font-medium text-zinc-200' : 'text-zinc-600')}>{label}</span>
                {i < STEP_LABELS.length - 1 && <span className="text-zinc-700">→</span>}
              </div>
            )
          })}
        </div>
        <div className="h-2 w-44 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              error ? 'bg-red-500' : status === 'paused' ? 'bg-amber-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="flex w-32 items-center justify-end gap-1.5 text-sm text-zinc-400">
          {error ? (
            '生成失败'
          ) : status === 'paused' ? (
            <><Clock className="h-3.5 w-3.5" /> 已暂停 · {progress}%</>
          ) : running ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />{stepLabel || '处理中'}… {progress}%</>
          ) : status === 'awaiting' ? (
            <span className="text-indigo-300">等待你的确认</span>
          ) : progress === 100 ? (
            <span className="text-emerald-400">完成 ✓</span>
          ) : (
            '待输入'
          )}
        </span>
      </div>
    </div>
  )
}
