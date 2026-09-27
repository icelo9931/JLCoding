'use client'

import { useState, useRef, useEffect } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { GO_MODELS } from '@/lib/models'
import type { BuildStatus } from '@/hooks/useAgentStream'
import { Send, RotateCcw, User, Sparkles, Check, ChevronDown, Play, Loader2, ClipboardCheck, RefreshCw, Paperclip, X, FileCode2, Zap, Link2, Globe, Settings2, KeyRound, Copy, Pencil, Pause, Compass } from 'lucide-react'
import type { ByokConfig } from '@/lib/byok'

const EXAMPLES = [
  '做一个待办事项应用，支持添加、完成、筛选',
  '做一个番茄钟计时器，带开始/暂停和重置',
  '做一个个人主页，展示技能、项目和联系方式',
]

export function ChatPanel({ messages, running, error, status, awaiting, streaming, usage, fileChips, linkChips, onUpload, onRemoveFile, onAddLink, onRemoveLink, mode, model, onModelChange, onAnalyze, onConfirm, onRetry, onPause, byokConfig, byokActive, onByokToggle, onByokSettings, mockMode, readOnly = false }: {
  messages: { role: string; content: string; agent?: string | null }[]
  running: boolean
  error: string | null
  status: BuildStatus
  awaiting: string | null
  streaming: { agent: string; text: string } | null
  usage: { input: number; output: number } | null
  fileChips: string[]
  linkChips: string[]
  onUpload: (files: FileList) => void
  onRemoveFile: (index: number) => void
  onAddLink: (url: string) => void
  onRemoveLink: (url: string) => void
  mode: string
  model: string
  onModelChange: (m: string) => void
  onAnalyze: (content: string) => void
  onConfirm: () => void
  onRetry: () => void
  onPause: () => void
  byokConfig: ByokConfig | null
  byokActive: boolean
  onByokToggle: () => void
  onByokSettings: () => void
  mockMode: boolean
  readOnly?: boolean
}) {
  const [input, setInput] = useState('')
  const [append, setAppend] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkInput, setLinkInput] = useState('')
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const showConfirm = awaiting !== null && !running

  // 消息操作：一键复制（含 1.5s 已复制反馈）
  const copyMessage = (idx: number, content: string) => {
    navigator.clipboard?.writeText(content).catch(() => {})
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500)
  }

  // 修改重发：内容填入输入框（待确认态填入追加框），编辑后重新发送
  const editResend = (content: string) => {
    if (running) return
    if (showConfirm) setAppend(content)
    else setInput(content)
  }

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
        {messages.map((msg, i) => {
          // 系统记录（生成路径等）：居中分隔线样式，区别于用户/Agent 气泡
          if (msg.role === 'system') {
            return (
              <div key={i} className="flex items-center gap-2 py-0.5" title={msg.content}>
                <span className="h-px flex-1 bg-zinc-800" />
                <span className="text-[10px] text-zinc-500">
                  {msg.content.includes('Mock') ? (
                    <span className="text-amber-500">{msg.content}</span>
                  ) : (
                    <span className="text-emerald-500/80">{msg.content}</span>
                  )}
                </span>
                <span className="h-px flex-1 bg-zinc-800" />
              </div>
            )
          }
          return (
            <div key={i} className={cn('group flex gap-2.5', msg.role === 'user' && 'flex-row-reverse')}>
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
                <div className="relative inline-block">
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
                  {/* hover 操作条：复制（全部消息）+ 修改重发（用户消息 → 填入输入框编辑后重发） */}
                  <div
                    className={cn(
                      'absolute top-full z-10 mt-0.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100',
                      msg.role === 'user' ? 'right-0' : 'left-0'
                    )}
                  >
                    <button
                      onClick={() => copyMessage(i, msg.content)}
                      title="复制消息内容"
                      className="flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
                    >
                      {copiedIdx === i ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      {copiedIdx === i ? '已复制' : '复制'}
                    </button>
                    {msg.role === 'user' && (
                      <button
                        onClick={() => editResend(msg.content)}
                        disabled={running}
                        title={running ? '生成中不可修改重发' : '内容填入输入框，编辑后重新发送'}
                        className="flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400 transition-colors hover:border-indigo-500 hover:text-white disabled:opacity-40"
                      >
                        <Pencil className="h-3 w-3" />修改重发
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {/* 流式输出气泡：模型正在逐字生成 */}
        {streaming && (
          <div className="flex gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-[10px] font-bold">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div className="max-w-[85%]">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-indigo-400">
                {streaming.agent}
                <Loader2 className="h-3 w-3 animate-spin" />
              </div>
              <div className="inline-block whitespace-pre-wrap rounded-xl rounded-tl-sm border bg-zinc-900 px-3 py-2 text-sm leading-relaxed text-zinc-200">
                {streaming.text || '…'}
                <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-indigo-400" />
              </div>
            </div>
          </div>
        )}

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
            <p className="mt-1.5 text-[10px] text-zinc-600">复杂应用（日历/图表等大代码量）生成较慢，可在下方模型栏切换 DeepSeek V4 Pro 提升质量与速度</p>
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
            {/* 面板内暂停入口（与顶栏暂停同源；生成/问答/版本回复中均可中止） */}
            <button
              onClick={onPause}
              className="flex items-center gap-1 rounded-md border border-red-900/60 bg-red-950/40 px-2 py-0.5 text-[11px] text-red-300 transition-colors hover:border-red-700 hover:text-red-200"
              title="暂停当前任务（已完成的阶段会保留，可随时继续）"
            >
              <Pause className="h-3 w-3" />暂停
            </button>
          </div>
        )}
      </div>

      {mockMode && (
        <div className="mx-4 mb-2 rounded-lg border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-[11px] leading-relaxed text-amber-300">
          演示模式（平台未配置真实模型 API Key）：当前生成使用预置数据，结果可能不完整或不准确，仅用于演示完整流程。如需真实生成，可在模型选择中配置「我自己的 API Key」（BYOK）。
        </div>
      )}

      {error && (
        <div className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-300">
          <span className="truncate">{error}</span>
          <Button variant="destructive" size="sm" onClick={onRetry}>
            <RotateCcw className="h-3.5 w-3.5" /> 重试
          </Button>
        </div>
      )}

      {readOnly ? (
        <div className="border-t p-3">
          <div className="flex items-start gap-2 rounded-lg border border-indigo-800/60 bg-indigo-950/30 px-3 py-2.5 text-[11px] leading-relaxed text-indigo-300">
            <Compass className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              只读浏览模式：这是来自「发现」的公开项目，完整展示了多轮对话与多次迭代结果。
              <br />
              想做一个属于自己的？<a href="/" className="ml-1 text-white underline decoration-indigo-500 underline-offset-2 hover:text-indigo-200">回到首页开始</a>
            </span>
          </div>
        </div>
      ) : (
      <div className="border-t p-3">
        {/* 附件 chips（文件 + 链接） */}
        {(fileChips.length > 0 || linkChips.length > 0) && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {linkChips.map((u) => (
              <span key={u} className="flex max-w-[220px] items-center gap-1 rounded-full border border-sky-800/60 bg-sky-950/40 px-2.5 py-1 text-[11px] text-sky-300">
                <Globe className="h-3 w-3 shrink-0" />
                <span className="truncate">{u.replace(/^https?:\/\//, '')}</span>
                <button onClick={() => onRemoveLink(u)}><X className="h-3 w-3 hover:text-white" /></button>
              </span>
            ))}
            {fileChips.map((c, i) => (
              <span key={i} className="flex items-center gap-1 rounded-full border border-amber-800/60 bg-amber-950/40 px-2.5 py-1 text-[11px] text-amber-300">
                <FileCode2 className="h-3 w-3" />{c}
                <button onClick={() => onRemoveFile(i)}><X className="h-3 w-3 hover:text-white" /></button>
              </span>
            ))}
          </div>
        )}
        {/* 链接输入行 */}
        {linkOpen && (
          <div className="mb-2 flex gap-2">
            <input
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && linkInput.trim()) { onAddLink(linkInput.trim()); setLinkInput(''); setLinkOpen(false) }
              }}
              placeholder="粘贴参考网页链接（Agent 将抓取内容作为需求参考）"
              className="h-8 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-xs outline-none focus:border-indigo-600"
              autoFocus
            />
            <Button size="sm" onClick={() => { if (linkInput.trim()) { onAddLink(linkInput.trim()); setLinkInput('') }; setLinkOpen(false) }}>添加</Button>
          </div>
        )}
        {/* 模型选择 pill（来源透明：每个选项标明来源与实际调用 ID）+ 模式标识 */}
        <div className="mb-2 flex items-center gap-2">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                disabled={running}
                className="flex h-7 items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 pl-2.5 pr-2 text-xs text-zinc-200 transition-colors hover:border-indigo-500 disabled:opacity-50"
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', byokActive ? 'bg-amber-400' : 'animate-pulse bg-emerald-500')} />
                {byokActive ? `我的 Key · ${byokConfig?.model ?? ''}` : currentModel.label}
                <ChevronDown className="h-3 w-3 text-zinc-500" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                sideOffset={6}
                align="start"
                className="z-50 max-h-[320px] min-w-[240px] overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl"
              >
                <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500">选择模型 · 来源透明</div>
                {GO_MODELS.map((m) => (
                  <DropdownMenu.Item
                    key={m.id}
                    onSelect={() => onModelChange(m.id)}
                    className={cn(
                      'flex cursor-pointer flex-col gap-0.5 rounded-md px-2 py-1.5 text-xs outline-none',
                      m.id === currentModel.id && !byokActive ? 'bg-indigo-950/60' : 'data-[highlighted]:bg-zinc-800'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('flex items-center gap-1.5', m.id === currentModel.id && !byokActive ? 'text-indigo-300' : 'text-zinc-200')}>
                        {m.label}
                      </span>
                      {m.id === currentModel.id && !byokActive && <Check className="h-3.5 w-3.5 text-indigo-300" />}
                    </div>
                    <div className="text-[10px] text-zinc-500">来源：{m.source} · 实际调用：{m.id}</div>
                  </DropdownMenu.Item>
                ))}
                <DropdownMenu.Separator className="my-1 h-px bg-zinc-800" />
                <DropdownMenu.Item
                  onSelect={onByokToggle}
                  className={cn(
                    'flex cursor-pointer flex-col gap-0.5 rounded-md px-2 py-1.5 text-xs outline-none',
                    byokActive ? 'bg-amber-950/50' : 'data-[highlighted]:bg-zinc-800'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('flex items-center gap-1', byokActive ? 'text-amber-300' : 'text-zinc-200')}>
                      <KeyRound className="h-3 w-3" />使用我自己的 API Key
                    </span>
                    {byokActive && <Check className="h-3.5 w-3.5 text-amber-300" />}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    来源：BYOK（用户提供） · 实际调用：{byokConfig ? byokConfig.model : '待配置（未配置时点击进入设置）'}
                  </div>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={onByokSettings}
                  className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-zinc-400 outline-none data-[highlighted]:bg-zinc-800"
                >
                  <Settings2 className="h-3 w-3" />配置 / 修改我的 API Key（OpenAI 兼容端点）
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          {mode === 'novice' && <span className="text-[10px] text-zinc-600">小白模式 · 全自动直达</span>}
          {mode === 'expert' && <span className="text-[10px] text-zinc-600">专家模式 · 全程可控</span>}
        </div>

        <div className="flex items-end gap-2 rounded-xl border bg-zinc-900 p-2 focus-within:border-indigo-600">
          <button
            onClick={() => uploadRef.current?.click()}
            disabled={running || showConfirm}
            title="上传文本/表格等参考文件（随下次请求提供给 Agent）"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-40"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <button
            onClick={() => setLinkOpen((v) => !v)}
            disabled={running || showConfirm}
            title="添加参考链接（Agent 抓取网页内容作为需求参考）"
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-40',
              linkOpen || linkChips.length > 0
                ? 'bg-sky-950/60 text-sky-400'
                : 'text-zinc-500 hover:bg-zinc-800 hover:text-white'
            )}
          >
            <Link2 className="h-4 w-4" />
          </button>
          <input ref={uploadRef} type="file" multiple hidden accept=".txt,.md,.csv,.json,.js,.ts,.html,.xml,.yml,.yaml,.log,image/*" onChange={(e) => { if (e.target.files?.length) onUpload(e.target.files); e.target.value = '' }} />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
            }}
            rows={2}
            disabled={showConfirm}
            placeholder={hasFiles ? '描述修改需求（增量只改相关文件）；也可直接提问，或说「对比 v1 和 v2」「回滚到 v1」…' : '描述你想做的应用（默认 React 网页应用：实时预览 + 一键线上使用；说"用 Python"生成桌面版）；也可直接提问——会自动识别意图，问答不需要确认'}
            className="max-h-32 flex-1 resize-none bg-transparent px-1 text-sm outline-none placeholder:text-zinc-600 disabled:opacity-50"
          />
          <Button size="icon" onClick={submit} disabled={running || !input.trim() || showConfirm}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-1.5 flex items-center gap-2 px-1">
          <p className="text-[10px] text-zinc-600">Enter 发送 / Shift+Enter 换行 · 默认 React 网页应用（可预览、可线上使用）</p>
          {/* 右下角：本轮 token 消耗 */}
          {usage && !running && (
            <span className="ml-auto flex items-center gap-1 text-[11px] text-zinc-400" title="本轮对话的模型 token 消耗（输入/输出）">
              <Zap className="h-3 w-3 text-amber-400" />
              Token：入 {usage.input.toLocaleString()} · 出 {usage.output.toLocaleString()}
            </span>
          )}
        </div>
      </div>
      )}
    </div>
  )
}
