'use client'

import { cn } from '@/lib/utils'
import { Loader2, Check } from 'lucide-react'

const STEP_LABELS = ['分析需求', '设计架构', '生成代码', '沙箱测试', '预览就绪']

export function ProgressBar({ progress, stepLabel, running, error }: {
  progress: number
  stepLabel: string
  running: boolean
  error: string | null
}) {
  return (
    <footer className="flex h-12 items-center gap-4 border-t bg-zinc-950 px-4 text-xs">
      <div className="flex flex-1 items-center gap-2 overflow-hidden">
        {STEP_LABELS.map((label, i) => {
          const done = progress === 100 || progress > ((i + 1) / 5) * 100
          const isActive = running && !done && progress > (i / 5) * 100 - 1
          return (
            <div key={label} className="flex items-center gap-1.5 whitespace-nowrap">
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full border text-[10px]',
                  done && 'border-emerald-700 bg-emerald-900 text-emerald-300',
                  isActive && !done && 'border-indigo-500 bg-indigo-950 text-indigo-300',
                  !done && !isActive && 'border-zinc-700 text-zinc-600'
                )}
              >
                {done ? <Check className="h-3 w-3" /> : isActive ? <Loader2 className="h-3 w-3 animate-spin" /> : i + 1}
              </span>
              <span className={cn(done || isActive ? 'text-zinc-200' : 'text-zinc-600')}>{label}</span>
              {i < STEP_LABELS.length - 1 && <span className="text-zinc-700">→</span>}
            </div>
          )
        })}
      </div>
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={cn('h-full rounded-full transition-all duration-500', error ? 'bg-red-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500')}
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="w-28 truncate text-right text-zinc-400">
        {error ? '生成失败' : running ? `${stepLabel || '处理中'}… ${progress}%` : progress === 100 ? '完成 ✓' : '待输入'}
      </span>
    </footer>
  )
}
