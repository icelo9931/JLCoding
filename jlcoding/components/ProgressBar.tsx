'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Loader2, Check, Clock } from 'lucide-react'

const STEP_LABELS = ['分析需求', '设计架构', '生成代码', '沙箱测试', '预览就绪']

export function ProgressBar({ progress, currentStep, stepLabel, running, status, error }: {
  progress: number
  currentStep: number // 0=未开始，1-5 对应阶段
  stepLabel: string
  running: boolean
  status: string
  error: string | null
}) {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (running && startRef.current === null) {
      startRef.current = Date.now()
    } else if (!running && status !== 'paused') {
      startRef.current = null
      setElapsed(0)
    }
  }, [running, status])

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      if (startRef.current) setElapsed(Math.round((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [running])

  const elapsedText = elapsed > 0 ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}` : ''

  return (
    <div className="border-b bg-zinc-950/80 px-4 py-2.5 backdrop-blur">
      <div className="flex items-center gap-4">
        <div className="flex flex-1 items-center gap-2.5 overflow-hidden">
          {STEP_LABELS.map((label, i) => {
            const stepNum = i + 1
            // 精确单步高亮：完成 = currentStep > stepNum 或整体 ready；进行中 = currentStep === stepNum
            const done = progress === 100 || (currentStep > stepNum && currentStep > 0)
            const isActive = (running || status === 'awaiting') && currentStep === stepNum
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
                  {done ? <Check className="h-3 w-3" /> : isActive ? <Loader2 className="h-3 w-3 animate-spin" /> : stepNum}
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
        <span className="flex w-36 items-center justify-end gap-1.5 text-sm text-zinc-400">
          {error ? (
            '生成失败'
          ) : status === 'paused' ? (
            <><Clock className="h-3.5 w-3.5" /> 已暂停 · {progress}%</>
          ) : running ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />{stepLabel || '处理中'}… {progress}%{elapsedText && <span className="text-zinc-500">（{elapsedText}）</span>}</>
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
