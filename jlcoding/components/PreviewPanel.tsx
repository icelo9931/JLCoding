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
import { CodeBlock } from '@/components/CodeBlock'
import { cn } from '@/lib/utils'
import { detectEntry, isPythonProject } from '@/lib/app-meta'
import { Monitor, Tablet, Smartphone, ExternalLink, RotateCw, CheckCircle2, XCircle, Rocket, Loader2 } from 'lucide-react'

const WIDTHS = { desktop: '100%', tablet: '768px', mobile: '375px' }
type Device = keyof typeof WIDTHS

// 规范化文件：补 "/" 前缀；package.json 的 main 指向实际存在的入口文件（与 sandbox 校验同源），
// 修复「实际生成 index.jsx 却被强制 main=index.js → Sandpack 找不到入口白屏」
function normalizeFiles(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  const entry = detectEntry(Object.keys(files))
  for (const [path, content] of Object.entries(files)) {
    const key = path.startsWith('/') ? path : `/${path}`
    if (key === '/package.json') {
      try {
        const pkg = JSON.parse(content)
        if (entry) pkg.main = entry
        pkg.dependencies = { react: '^18.2.0', 'react-dom': '^18.2.0', ...pkg.dependencies }
        out[key] = JSON.stringify(pkg, null, 2)
        continue
      } catch { /* 非法 JSON 原样透传，由校验环节报错 */ }
    }
    out[key] = content
  }
  return out
}

export function PreviewPanel({ files, building, projectId, standalone = false, deployUrl = null, deploySha = null, deploying = false, onDeploy = () => {}, readOnly = false }: {
  files: Record<string, string>
  building: boolean
  projectId: string
  standalone?: boolean
  deployUrl?: string | null
  deploySha?: string | null
  deploying?: boolean
  onDeploy?: () => void
  readOnly?: boolean
}) {
  const [device, setDevice] = useState<Device>('desktop')
  const [refreshKey, setRefreshKey] = useState(0)
  const [buildLog, setBuildLog] = useState<{ ok: boolean; ms: number } | null>(null)
  // 预览模式：'deploy'（零 CDN 部署页 iframe，默认最快最稳）| 'sandpack'（浏览器内实时编译）
  const [mode, setMode] = useState<'deploy' | 'sandpack'>('sandpack')
  const [autoDeployTried, setAutoDeployTried] = useState(false)
  const [sandpackSlow, setSandpackSlow] = useState(false)
  const userChoseRef = useRef(false) // 用户手动切过模式后，不再自动干预

  const sandpackFiles = useMemo(() => {
    const normalized = normalizeFiles(files)
    return Object.fromEntries(Object.entries(normalized).map(([k, v]) => [k, { code: v }]))
  }, [files])

  const fileCount = Object.keys(files).length
  const paths = Object.keys(files)
  const isPython = isPythonProject(paths)
  const mainPy = files[paths.find((p) => p === 'main.py') ?? paths.find((p) => p.endsWith('.py')) ?? ''] ?? null

  useEffect(() => { setBuildLog(null); setSandpackSlow(false) }, [sandpackFiles, refreshKey])

  // 有部署链接 → 自动切零 CDN 部署页（用户手动切换过则不再干预）
  useEffect(() => {
    if (deployUrl && !userChoseRef.current && !buildLog) setMode('deploy')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployUrl])

  // Sandpack 慢/失败兜底：6s 未编译完成 → 标记慢；有部署链接即切部署页，否则自动部署一次
  // （只读/发现模式下不触发部署——部署是写操作；仅有部署链接时直接读部署页）
  useEffect(() => {
    if (standalone || isPython || fileCount === 0 || building) return
    if (readOnly) { if (deployUrl && !userChoseRef.current) setMode('deploy'); return }
    if (mode === 'deploy' || buildLog) return
    const t = setTimeout(() => {
      setSandpackSlow(true)
      if (deployUrl) setMode('deploy')
      else if (!autoDeployTried) { setAutoDeployTried(true); onDeploy() }
    }, 6_000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandpackFiles, buildLog, building, mode, isPython, fileCount, deployUrl, readOnly])
  // 部署链接到达且处于「Sandpack 慢」状态 → 切部署页（未手动选择过）
  useEffect(() => {
    if (sandpackSlow && deployUrl && !userChoseRef.current) setMode('deploy')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandpackSlow, deployUrl])

  // Python 项目：无法浏览器预览 → 黑底代码展示 + 运行说明
  if (isPython && mainPy) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
          <span className="rounded-full bg-yellow-950/60 px-2.5 py-1 font-medium text-yellow-400">Python 应用</span>
          <span className="text-zinc-500">标准库 tkinter · 无需安装依赖</span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => (window.location.href = `/api/projects/${projectId}/download`)}
          >
            下载 ZIP 运行
          </Button>
        </div>
        <div className="flex flex-1 flex-col overflow-hidden p-3">
          <div className="mb-2 text-[11px] text-zinc-500">运行方式：解压后执行 <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-emerald-400">python main.py</code></div>
          <div className="flex-1 overflow-auto rounded-lg">
            <CodeBlock code={mainPy} language="py" maxHeight="100%" />
          </div>
        </div>
      </div>
    )
  }

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
        {buildLog && mode === 'sandpack' && (
          <span className={cn('ml-1 flex items-center gap-1 text-xs', buildLog.ok ? 'text-emerald-400' : 'text-red-400')}>
            {buildLog.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            构建校验：{buildLog.ok ? '通过' : '失败'}（Sandpack 编译耗时 {(buildLog.ms / 1000).toFixed(1)}s）
          </span>
        )}
        {mode === 'deploy' && (
          <span className="ml-1 flex items-center gap-1 text-emerald-400/80" title="零 CDN 依赖的部署页预览（esbuild 自包含 bundle），加载最快最稳">
            <CheckCircle2 className="h-3.5 w-3.5" />部署页预览（零 CDN）
          </span>
        )}
        {mode === 'sandpack' && sandpackSlow && !deployUrl && (
          <span className="ml-1 flex items-center gap-1 text-amber-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />CDN 加载慢，正在部署零依赖预览…
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {/* 预览模式切换：部署页（零 CDN，快稳，默认）↔ Sandpack（浏览器内实时编译） */}
          {fileCount > 0 && !isPython && !readOnly && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 text-[11px] text-zinc-400"
              title={mode === 'deploy' ? '当前为零 CDN 部署页预览；点击切回浏览器内实时编译（Sandpack）' : '当前为 Sandpack 实时编译；点击切换零 CDN 部署页预览（加载更快）'}
              onClick={() => {
                userChoseRef.current = true // 用户手动选择后，自动切换不再干预
                if (mode === 'deploy') { setMode('sandpack'); setSandpackSlow(false) }
                else {
                  setMode('deploy')
                  if (!deployUrl && !autoDeployTried) { setAutoDeployTried(true); onDeploy() }
                }
              }}
            >
              {mode === 'deploy' ? '实时编译' : '零依赖预览'}
            </Button>
          )}
          {/* 线上使用：部署为公开网页（esbuild 打包 → /app/:id，零 CDN 依赖），已部署则直链 */}
          {deployUrl ? (
            <a
              href={deployUrl}
              target="_blank"
              rel="noreferrer"
              title="打开已部署的线上应用（公开链接，可分享）"
              className="flex h-8 items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-950/60 px-2.5 text-xs text-emerald-300 transition-colors hover:border-emerald-500"
            >
              <Rocket className="h-3.5 w-3.5" />线上使用
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : readOnly ? null : (
            <Button
              variant="outline"
              size="sm"
              onClick={onDeploy}
              disabled={deploying}
              title="部署为公开网页（esbuild 打包成自包含单页，托管于 jlCoding，生成可分享链接 + 产物 SHA）"
              className="h-8 gap-1.5 px-2.5 text-xs"
            >
              {deploying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              {deploying ? '部署中…' : '线上使用'}
            </Button>
          )}
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
          {mode === 'deploy' && deployUrl ? (
            // 零 CDN 依赖画布：内嵌部署页（esbuild 自包含 bundle）；带 deploySha 作 query 使版本更新时强制刷新
            <iframe src={`${deployUrl}${deployUrl.includes('?') ? '&' : '?'}v=${deploySha ?? ''}`} title="部署页预览" className="h-full w-full border-0 bg-white" />
          ) : mode === 'deploy' ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
              <p className="text-xs leading-relaxed text-zinc-400">
                正在部署零 CDN 依赖的预览页（esbuild 自包含 bundle）
                <br />
                约 1-2 秒即可交互
              </p>
            </div>
          ) : (
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
          )}
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
