'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Send, RotateCcw, User, Sparkles } from 'lucide-react'
import type { ChatMessage } from '@/hooks/useAgentStream'

const EXAMPLES = [
  '做一个待办事项应用，支持添加、完成、筛选',
  '做一个番茄钟计时器，带开始/暂停和重置',
  '做一个个人主页，展示技能、项目和联系方式',
]

export function ChatPanel({ messages, running, error, onSend, onRetry, hasFiles }: {
  messages: ChatMessage[]
  running: boolean
  error: string | null
  onSend: (content: string) => void
  onRetry: () => void
  hasFiles: boolean
}) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, running])

  const submit = () => {
    if (!input.trim() || running) return
    onSend(input.trim())
    setInput('')
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="mt-8 space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium">描述你想要的应用</p>
              <p className="mt-1 text-xs text-zinc-500">Agent 将分析需求 → 设计架构 → 编写代码 → 校验 → 实时预览</p>
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
        <div className="flex items-end gap-2 rounded-xl border bg-zinc-900 p-2 focus-within:border-indigo-600">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
            }}
            rows={2}
            placeholder={hasFiles ? '描述你想修改的功能…' : '描述你想做的应用，例如：做一个待办事项应用…'}
            className="max-h-32 flex-1 resize-none bg-transparent px-1 text-sm outline-none placeholder:text-zinc-600"
          />
          <Button size="icon" onClick={submit} disabled={running || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-zinc-600">Enter 发送 / Shift+Enter 换行 · 生成 React 纯前端应用</p>
      </div>
    </div>
  )
}
