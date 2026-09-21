'use client'

import { useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { cn } from '@/lib/utils'
import type { LogEntry } from '@/lib/types'
import { FileCode2, TerminalSquare, ListTree, ChevronRight, Loader2, CheckCircle2, XCircle, File as FileIcon } from 'lucide-react'

const AGENT_COLORS: Record<string, string> = {
  业务分析师: 'text-sky-400',
  架构设计师: 'text-violet-400',
  代码工程师: 'text-emerald-400',
  测试工程师: 'text-amber-400',
  修复工程师: 'text-rose-400',
  系统: 'text-zinc-400',
}

type Tab = 'logs' | 'files' | 'terminal'

export function AgentLogPanel({ logs, files }: {
  logs: LogEntry[]
  files: Record<string, string>
}) {
  const [tab, setTab] = useState<Tab>('logs')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const paths = Object.keys(files).sort()
  const terminalLogs = logs.filter((l) => l.kind === 'command')

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b">
        {([
          ['logs', '工作日志', ListTree],
          ['files', `文件 (${paths.length})`, FileCode2],
          ['terminal', '终端', TerminalSquare],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-xs transition-colors',
              tab === key ? 'border-b-2 border-indigo-500 text-white' : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'logs' && (
          <div className="space-y-1.5 p-3">
            {logs.length === 0 && <Empty text="Agent 工作过程将在这里逐步展示" />}
            {logs.map((log) => (
              <Collapsible.Root key={log.id} defaultOpen={log.kind === 'text' && Boolean(log.detail)}>
                <Collapsible.Trigger className="group flex w-full items-start gap-2 rounded-md border bg-zinc-900/60 px-2.5 py-2 text-left text-xs hover:border-zinc-600">
                  {log.status === 'running' && <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-indigo-400" />}
                  {log.status === 'done' && <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                  {log.status === 'error' && <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />}
                  <span className={cn('shrink-0 font-medium', AGENT_COLORS[log.agent] ?? 'text-zinc-400')}>{log.agent}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-300">{log.title}</span>
                  {log.detail && <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600 transition-transform group-data-[state=open]:rotate-90" />}
                </Collapsible.Trigger>
                {log.detail && (
                  <Collapsible.Content className="whitespace-pre-wrap rounded-b-md border-x border-b border-zinc-800 bg-zinc-950 px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
                    {log.detail}
                  </Collapsible.Content>
                )}
              </Collapsible.Root>
            ))}
          </div>
        )}

        {tab === 'files' && (
          <div className="flex h-full">
            <div className="w-40 shrink-0 space-y-0.5 overflow-y-auto border-r p-2">
              {paths.length === 0 && <Empty text="暂无文件" />}
              {paths.map((path) => (
                <button
                  key={path}
                  onClick={() => setSelectedFile(path)}
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs',
                    selectedFile === path ? 'bg-indigo-950/60 text-indigo-300' : 'text-zinc-400 hover:bg-zinc-900'
                  )}
                >
                  <FileIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{path}</span>
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-auto">
              {selectedFile ? (
                <pre className="p-3 text-[11px] leading-relaxed text-zinc-300">
                  <code>{files[selectedFile]}</code>
                </pre>
              ) : (
                <Empty text="选择文件查看代码" />
              )}
            </div>
          </div>
        )}

        {tab === 'terminal' && (
          <div className="space-y-3 p-3">
            {terminalLogs.length === 0 && <Empty text="暂无终端输出" />}
            {terminalLogs.map((log) => (
              <div key={log.id} className="rounded-md border border-zinc-800 bg-black/60 p-2.5 font-mono text-[11px]">
                <div className="text-emerald-400">{log.title}</div>
                {log.detail && (
                  <div className={cn('mt-1 whitespace-pre-wrap', log.status === 'error' ? 'text-red-400' : 'text-zinc-400')}>
                    {log.detail}
                  </div>
                )}
                <div className={cn('mt-1', log.status === 'error' ? 'text-red-500' : 'text-zinc-600')}>
                  exit code: {log.status === 'error' ? 1 : 0}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="mt-6 text-center text-xs text-zinc-600">{text}</div>
}
