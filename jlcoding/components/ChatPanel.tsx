'use client'

import { useState, useRef, useEffect } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { GO_MODELS } from '@/lib/models'
import type { BuildStatus } from '@/hooks/useAgentStream'
import { Send, RotateCcw, User, Sparkles, Check, ChevronDown, Play, Loader2, ClipboardCheck, RefreshCw } from 'lucide-react'

const EXAMPLES = [
  '做一个待办事项应用，支持添加、完成、筛选',
  '做一个番茄钟计时器，带开始/暂停和重置',
  '做一个个人主页，展示技能、项目和联系方式',
]

export function ChatPanel({ messages, running, error, status, awaiting, mode, model, onModelChange, onAnalyze, onConfirm, onRetry }: {
  messages: { role: string; content: string; agent?: string | null }[]
  running: boolean
  error: string | null
  status: BuildStatus
  awaiting: string | null
  mode: string
  model: string
  onModelChange: (m: string) => void
  onAnalyze: (content: string) => void
  onConfirm: () => void
  onRetry: () => void
}) {
  const [input, setInput] = useState('')
  const [append, setAppend] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const showConfirm = awaiting !== null && !running

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, running, showConfirm])

  const submit = () => {
    if (!input.trim() || running || showConfirm) return
    onAnalyze(input.trim())
    setInput('')
  }

  const currentModel = GO_MODELS.find((m) => m.id === model) ?? GO_MODELS[0]
  const hasFiles = false

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && !showConfirm && (
          <div className="mt-8 space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium">描述你想要的应用</p>
              <p className="mt-1 text-xs text-zinc-500">Agent 将分析需求 → 你确认 → 设计架构 → 编写代码 → 校验 → 实时预览</p>
            </div>
            <div className="space-y-2 text-left">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setInput(ex)}
                  className="w-full rounded-lg border bg-zinc-900 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:border-indigo-700 hover:text-white"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={cn('flex gap-2.5', msg.role === 'user' && 'flex-row-reverse')}>
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                msg.role === 'user' ? 'bg-zinc-700' : 'bg-gradient-to-br from-indigo-500 to-purple-600'
              )}
            >
              {msg.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            </span>
            <div className={cn('max-w-[85%]', msg.role === 'user' && 'text-right')}>
              {msg.agent && <div className="mb-1 text-[10px] uppercase tracking-wide text-indigo-400">{msg.agent}</div>}
              <div
                className={cn(
                  'inline-block whitespace-pre-wrap rounded-xl px-3 py-2 text-left text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'rounded-tr-sm bg-indigo-600 text-white'
                    : 'rounded-tl-sm border bg-zinc-900 text-zinc-200'
                )}
              >
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {/* 确认卡片：分析结果 + 追加输入 */}
        {showConfirm && (
          <div className="rounded-xl border border-indigo-800/60 bg-gradient-to-b from-indigo-950/40 to-zinc-950 p-3.5">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-indigo-300">
              <ClipboardCheck className="h-4 w-4" />
              需求确认
              <span className="ml-auto text-[10px] font-normal text-zinc-500">请确认理解无误后开始生成</span>
            </div>
            <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-300">
              {awaiting}
            </div>
            <textarea
              value={append}
              onChange={(e) => setAppend(e.target.value)}
              rows={2}
              placeholder="想补充或调整？在这里输入，点击「补充并重新分析」（可选）"
              className="mt-2.5 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 text-xs outline-none placeholder:text-zinc-600 focus:border-indigo-600"
            />
            <div className="mt-2.5 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!append.trim()}
                onClick={() => { onAnalyze(append.trim()); setAppend('') }}
              >
                <RotateCcw className="h-3.5 w-3.5" /> 补充并重新分析
              </Button>
              <Button size="sm" onClick={onConfirm}>
                <Check className="h-3.5 w-3.5" /> 确认，开始生成
              </Button>
            </div>
          </div>
        )}

        {/* 暂停横幅：从断点继续 */}
        {status === 'paused' && !running && !showConfirm && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-800/60 bg-amber-950/30 px-3.5 py-3">
            <div className="text-xs text-amber-300">
              <span className="font-medium">已暂停</span>
              <span className="ml-2 text-amber-400/70">已完成的分析与设计不会重跑，从断点继续</span>
            </div>
            <Button size="sm" variant="outline" onClick={onConfirm}>
              <Play className="h-3.5 w-3.5" /> 继续生成
            </Button>
          </div>
        )}

        {/* 刷新时服务端仍在生成 */}
        {status === 'building' && !running && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-indigo-800/60 bg-indigo-950/30 px-3.5 py-3 text-xs text-indigo-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            生成仍在后台进行，稍后刷新查看进度
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              <RefreshCw className="h-3.5 w-3.5" /> 刷新
            </Button>
          </div>
        )}

        {running && (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:300ms]" />
            </span>
            Agent 正在工作…
          </div>
        )}
      </div>

      {error && (
        <div className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-300">
          <span className="truncate">{error}</span>
          <Button variant="destructive" size="sm" onClick={onRetry}>
            <RotateCcw className="h-3.5 w-3.5" /> 重试
          </Button>
        </div>
      )}

      <div className="border-t p-3">
        {/* 模型选择 pill */}
        <div className="mb-2 flex items-center gap-2">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                disabled={running}
                className="flex h-7 items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 pl-2.5 pr-2 text-xs text-zinc-200 transition-colors hover:border-indigo-500 disabled:opacity-50"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {currentModel.label}
                <ChevronDown className="h-3 w-3 text-zinc-500" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                sideOffset={6}
                align="start"
                className="z-50 min-w-[180px] rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl"
              >
                <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500">OpenCode Go 模型</div>
                {GO_MODELS.map((m) => (
                  <DropdownMenu.Item
                    key={m.id}
                    onSelect={() => onModelChange(m.id)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs outline-none',
                      m.id === currentModel.id ? 'bg-indigo-950/60 text-indigo-300' : 'text-zinc-300 data-[highlighted]:bg-zinc-800'
                    )}
                  >
                    {m.label}
                    {m.id === currentModel.id && <Check className="h-3.5 w-3.5" />}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          {mode === 'novice' && <span className="text-[10px] text-zinc-600">小白模式 · 全自动直达</span>}
          {mode === 'expert' && <span className="text-[10px] text-zinc-600">专家模式 · 全程可控</span>}
        </div>

        <div className="flex items-end gap-2 rounded-xl border bg-zinc-900 p-2 focus-within:border-indigo-600">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
            }}
            rows={2}
            disabled={showConfirm}
            placeholder={hasFiles ? '生成完成后可描述修改需求…' : '描述你想做的应用，例如：做一个待办事项应用…'}
            className="max-h-32 flex-1 resize-none bg-transparent px-1 text-sm outline-none placeholder:text-zinc-600 disabled:opacity-50"
          />
          <Button size="icon" onClick={submit} disabled={running || !input.trim() || showConfirm}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-zinc-600">Enter 发送 / Shift+Enter 换行 · 生成 React 纯前端应用</p>
      </div>
    </div>
  )
}
