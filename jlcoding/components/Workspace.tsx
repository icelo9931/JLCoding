'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { TopBar } from '@/components/TopBar'
import { ProgressBar } from '@/components/ProgressBar'
import { ChatPanel } from '@/components/ChatPanel'
import { PreviewPanel } from '@/components/PreviewPanel'
import { AgentLogPanel } from '@/components/AgentLogPanel'
import { useAgentStream, type ChatMessage, type BuildStatus } from '@/hooks/useAgentStream'
import { DEFAULT_MODEL } from '@/lib/models'
import type { LogEntry } from '@/lib/types'

interface ProjectDetail {
  id: string
  name: string
  status: string
  mode: string
  model: string | null
  messages: { role: string; content: string; agent: string | null; step: string | null }[]
  files: { path: string; content: string }[]
}

let restoreId = 0

export function Workspace({ projectId }: { projectId: string }) {
  const params = useSearchParams()
  const standalone = params.get('preview') === '1'
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('项目不存在'))))
      .then(setDetail)
      .catch((e) => setLoadError(e.message))
  }, [projectId])

  const initial = {
    // 分析结果由确认卡片展示，不在聊天流中重复
    messages: (detail?.messages ?? []).filter((m) => m.role === 'assistant' && m.step !== 'analysis') as ChatMessage[],
    files: Object.fromEntries((detail?.files ?? []).map((f) => [f.path, f.content])),
    status: (detail?.status ?? 'draft') as BuildStatus,
  }

  const stream = useAgentStream(projectId, initial)
  const [model, setModel] = useState<string>(DEFAULT_MODEL)

  useEffect(() => {
    if (detail?.model) setModel(detail.model)
  }, [detail?.model])

  // 刷新恢复：待确认状态 → 从库里取最新分析展示确认卡片
  useEffect(() => {
    if (!detail) return
    if (detail.status === 'awaiting') {
      const analysis = [...detail.messages].reverse().find((m) => m.step === 'analysis')?.content
      if (analysis) stream.setAwaiting(analysis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail])

  // 刷新恢复：从持久化消息重建工作日志（专家模式可见）
  useEffect(() => {
    if (!detail || stream.logs.length > 0) return
    const restored: LogEntry[] = []
    for (const m of detail.messages) {
      if (m.role === 'assistant' && m.agent && m.step && m.step !== 'analysis') {
        restored.push({
          id: `restore-${++restoreId}`, agent: m.agent, kind: 'text',
          title: `${m.agent} 输出`, detail: m.content, status: 'done', createdAt: 0,
        })
      } else if (m.role === 'system' && m.step === 'validation') {
        restored.push({
          id: `restore-${++restoreId}`, agent: '测试工程师', kind: 'command',
          title: '$ npm run build', detail: m.content.split('\n').slice(1).join('\n'),
          status: 'done', createdAt: 0,
        })
      }
    }
    for (const f of detail.files) {
      restored.push({
        id: `restore-file-${++restoreId}`, agent: '代码工程师', kind: 'file',
        title: `创建 ${f.path}`, path: f.path, content: f.content, status: 'done', createdAt: 0,
      })
    }
    if (restored.length) stream.setLogs(restored)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail])

  // 首页快速开始：携带待发送需求进入（先分析后确认）
  useEffect(() => {
    if (!detail || stream.running) return
    const pending = sessionStorage.getItem(`jlcoding:pending:${projectId}`)
    if (pending && !detail.messages.some((m) => m.role === 'user')) {
      sessionStorage.removeItem(`jlcoding:pending:${projectId}`)
      stream.analyze(pending, detail.model ?? DEFAULT_MODEL)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail])

  const files = { ...initial.files, ...stream.files }
  const mode = detail?.mode ?? 'novice'

  if (loadError) {
    return <div className="flex h-screen items-center justify-center text-zinc-500">{loadError}</div>
  }

  if (standalone) {
    return (
      <div className="h-screen bg-white">
        {detail ? <PreviewPanel files={files} building={stream.running} projectId={projectId} standalone /> : null}
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      <TopBar
        projectName={detail?.name ?? '加载中…'}
        projectId={projectId}
        status={detail ? stream.status : 'draft'}
        mode={mode}
        running={stream.running}
        onPause={stream.pause}
        onResume={() => stream.confirmGenerate(model)}
      />
      <ProgressBar
        progress={stream.progress}
        stepLabel={stream.stepLabel}
        running={stream.running}
        status={stream.status}
        error={stream.error}
      />
      <main className="grid flex-1 grid-cols-[minmax(320px,26%)_1fr_minmax(280px,24%)] overflow-hidden">
        <section className="flex flex-col overflow-hidden border-r">
          <ChatPanel
            messages={stream.messages}
            running={stream.running}
            error={stream.error}
            status={stream.status}
            awaiting={stream.awaiting}
            mode={mode}
            model={model}
            onModelChange={setModel}
            onAnalyze={(content) => stream.analyze(content, model)}
            onConfirm={() => stream.confirmGenerate(model)}
            onRetry={stream.retry}
          />
        </section>
        <section className="overflow-hidden bg-zinc-900/40">
          <PreviewPanel files={files} building={stream.running} projectId={projectId} />
        </section>
        <section className="overflow-hidden border-l">
          <AgentLogPanel logs={stream.logs} files={files} simple={mode === 'novice'} />
        </section>
      </main>
    </div>
  )
}
