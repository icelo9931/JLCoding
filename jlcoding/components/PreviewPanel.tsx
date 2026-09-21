'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import {
  SandpackProvider,
  SandpackPreview,
  useSandpackClient,
  useErrorMessage,
} from '@codesandbox/sandpack-react'
import type { SandpackMessage } from '@codesandbox/sandpack-client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Monitor, Tablet, Smartphone, ExternalLink, RotateCw, CheckCircle2, XCircle } from 'lucide-react'

const WIDTHS = { desktop: '100%', tablet: '768px', mobile: '375px' }
type Device = keyof typeof WIDTHS

// 规范化文件：补 "/" 前缀；确保 package.json 声明 main 入口与 react 依赖
function normalizeFiles(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [path, content] of Object.entries(files)) {
    const key = path.startsWith('/') ? path : `/${path}`
    if (key === '/package.json') {
      try {
        const pkg = JSON.parse(content)
        pkg.main = pkg.main || 'index.js'
        pkg.dependencies = { react: '^18.2.0', 'react-dom': '^18.2.0', ...pkg.dependencies }
        out[key] = JSON.stringify(pkg, null, 2)
        continue
      } catch { /* 非法 JSON 原样透传，由校验环节报错 */ }
    }
    out[key] = content
  }
  return out
}

export function PreviewPanel({ files, building, projectId, standalone = false }: {
  files: Record<string, string>
  building: boolean
  projectId: string
  standalone?: boolean
}) {
  const [device, setDevice] = useState<Device>('desktop')
  const [refreshKey, setRefreshKey] = useState(0)
  const [buildLog, setBuildLog] = useState<{ ok: boolean; ms: number } | null>(null)

  const sandpackFiles = useMemo(() => {
    const normalized = normalizeFiles(files)
    return Object.fromEntries(Object.entries(normalized).map(([k, v]) => [k, { code: v }]))
  }, [files])

  const fileCount = Object.keys(files).length

  useEffect(() => { setBuildLog(null) }, [sandpackFiles, refreshKey])

  if (fileCount === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
        <div className={cn('flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed border-zinc-800', building && 'animate-pulse border-indigo-800')}>
          <Monitor className="h-7 w-7" />
        </div>
        <p className="text-sm">{building ? '代码生成中，预览即将就绪…' : '还没有可预览的应用'}</p>
        {!building && <p className="max-w-[260px] text-center text-xs text-zinc-600">在左侧输入需求，Agent 完成编码后这里会实时渲染生成结果</p>}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {!standalone && (
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <div className="flex items-center gap-0.5 rounded-md bg-zinc-900 p-0.5">
          {([
            ['desktop', Monitor],
            ['tablet', Tablet],
            ['mobile', Smartphone],
          ] as const).map(([d, Icon]) => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              title={d}
              className={cn(
                'rounded p-1.5 text-zinc-500 transition-colors hover:text-zinc-200',
                device === d && 'bg-zinc-700 text-white'
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <span className="ml-2 text-xs text-zinc-500">{fileCount} 个文件</span>
        {buildLog && (
          <span className={cn('ml-1 flex items-center gap-1 text-xs', buildLog.ok ? 'text-emerald-400' : 'text-red-400')}>
            {buildLog.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            构建校验：{buildLog.ok ? '通过' : '失败'}（Sandpack 编译耗时 {(buildLog.ms / 1000).toFixed(1)}s）
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" title="刷新预览" onClick={() => setRefreshKey((k) => k + 1)}>
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="在新窗口打开"
            onClick={() => window.open(`/project/${projectId}?preview=1`, '_blank')}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>
      )}
      <div className="flex flex-1 justify-center overflow-hidden bg-zinc-900 p-3">
        <div
          className="h-full overflow-hidden rounded-lg border border-zinc-700 bg-white shadow-2xl transition-all duration-300"
          style={{ width: standalone ? '100%' : WIDTHS[device], maxWidth: '100%' }}
        >
          <SandpackProvider
            key={refreshKey}
            template="react"
            files={sandpackFiles}
            options={{ classes: { 'sp-wrapper': 'h-full', 'sp-layout': 'h-full border-0 bg-white' } }}
            theme="light"
          >
            <CompileWatcher
              onStart={() => {}}
              onDone={(ok, ms) => setBuildLog({ ok, ms })}
            />
            <SandpackPreview
              showNavigator={false}
              showOpenInCodeSandbox={false}
              showRefreshButton={false}
              style={{ height: '100%' }}
            />
          </SandpackProvider>
        </div>
      </div>
    </div>
  )
}

// 监听 Sandpack 客户端消息，采集真实编译耗时与结果
function CompileWatcher({ onStart, onDone }: {
  onStart: () => void
  onDone: (ok: boolean, ms: number) => void
}) {
  const { listen } = useSandpackClient()
  const errorMessage = useErrorMessage()
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    const unsubscribe = listen((msg: SandpackMessage) => {
      if (msg.type === 'start') {
        startRef.current = performance.now()
        onStart()
      }
      if (msg.type === 'done') {
        const ms = startRef.current ? Math.round(performance.now() - startRef.current) : 0
        const compileError = Boolean((msg as { compile?: { error?: unknown } }).compile?.error)
        onDone(!compileError, ms)
      }
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (errorMessage) onDone(false, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorMessage])

  return null
}
