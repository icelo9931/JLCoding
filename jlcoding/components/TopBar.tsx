'use client'

import Link from 'next/link'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Button } from '@/components/ui/button'
import { GO_MODELS } from '@/lib/models'
import { cn } from '@/lib/utils'
import { Download, Rocket, Terminal, ArrowLeft, ChevronDown, Check } from 'lucide-react'

export function TopBar({ projectName, projectId, status, model, onModelChange, modelDisabled }: {
  projectName: string
  projectId: string
  status: string
  model: string
  onModelChange: (model: string) => void
  modelDisabled: boolean
}) {
  const current = GO_MODELS.find((m) => m.id === model) ?? GO_MODELS[0]
  return (
    <header className="flex h-14 items-center gap-3 border-b bg-zinc-950 px-4">
      <Link href="/" className="flex items-center gap-2 text-zinc-300 hover:text-white">
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold">jl</span>
        <span>jlCoding</span>
      </Link>
      <span className="text-zinc-700">/</span>
      <span className="max-w-[200px] truncate text-sm text-zinc-300">{projectName}</span>
      {status === 'ready' && (
        <span className="rounded-full border border-emerald-800 bg-emerald-950 px-2 py-0.5 text-xs text-emerald-400">已就绪</span>
      )}
      {status === 'building' && (
        <span className="animate-pulse rounded-full border border-indigo-800 bg-indigo-950 px-2 py-0.5 text-xs text-indigo-300">构建中</span>
      )}
      {status === 'error' && (
        <span className="rounded-full border border-red-800 bg-red-950 px-2 py-0.5 text-xs text-red-400">出错</span>
      )}
      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              disabled={modelDisabled}
              title={modelDisabled ? '生成进行中，暂不能切换模型' : '切换 OpenCode Go 模型'}
              className="flex h-8 items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:opacity-50"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {current.label}
              <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              sideOffset={6}
              align="end"
              className="z-50 min-w-[180px] rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl"
            >
              <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-zinc-500">OpenCode Go 模型</div>
              {GO_MODELS.map((m) => (
                <DropdownMenu.Item
                  key={m.id}
                  onSelect={() => onModelChange(m.id)}
                  className={cn(
                    'flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs outline-none',
                    m.id === current.id ? 'bg-indigo-950/60 text-indigo-300' : 'text-zinc-300 data-[highlighted]:bg-zinc-800'
                  )}
                >
                  {m.label}
                  {m.id === current.id && <Check className="h-3.5 w-3.5" />}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
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

export function BrandMark() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold">
        <Terminal className="h-4 w-4" />
      </span>
      <span className="text-lg font-bold">jlCoding</span>
    </span>
  )
}
