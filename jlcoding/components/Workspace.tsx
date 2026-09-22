'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { TopBar } from '@/components/TopBar'
import { ProgressBar } from '@/components/ProgressBar'
import { ChatPanel } from '@/components/ChatPanel'
import { PreviewPanel } from '@/components/PreviewPanel'
import { AgentLogPanel } from '@/components/AgentLogPanel'
import { useAgentStream, type ChatMessage, type BuildStatus } from '@/hooks/useAgentStream'
import { SkillMcpDialog } from '@/components/SkillMcpDialog'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { DEFAULT_MODEL } from '@/lib/models'
import { loadCustom } from '@/lib/custom-store'
import { parseFiles } from '@/lib/file-read'
import { loadGithub, pushProjectToGithub, type GithubConnection } from '@/lib/github'
import type { LogEntry } from '@/lib/types'

interface ProjectDetail {
  id: string
  name: string
  status: string
  mode: string
  agent: string | null
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
    // 保留用户消息与各阶段输出；分析结果由确认卡片单独展示，不重复
    messages: (detail?.messages ?? []).filter(
      (m) => m.role === 'user' || (m.role === 'assistant' && m.step !== 'analysis')
    ) as ChatMessage[],
    files: Object.fromEntries((detail?.files ?? []).map((f) => [f.path, f.content])),
    status: (detail?.status ?? 'draft') as BuildStatus,
  }

  const stream = useAgentStream(projectId, initial)
  const [model, setModel] = useState<string>(DEFAULT_MODEL)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [github, setGithub] = useState<GithubConnection | null>(null)
  const [pushing, setPushing] = useState(false)
  const [pushUrl, setPushUrl] = useState<string | null>(null)
  const [pushError, setPushError] = useState<string | null>(null)

  useEffect(() => {
    setGithub(loadGithub())
  }, [])

  useEffect(() => {
    if (detail?.model) setModel(detail.model)
  }, [detail?.model])

  // 自定义 agent：注入其主导 prompt
  useEffect(() => {
    if (detail?.agent?.startsWith('custom:')) {
      const custom = loadCustom().agents.find((a) => a.id === detail.agent)
      stream.setAgentPrompt(custom?.prompt ?? null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.agent])

  // 首页带来的上传文件上下文
  useEffect(() => {
    const raw = sessionStorage.getItem(`jlcoding:ctx:${projectId}`)
    if (raw) {
      sessionStorage.removeItem(`jlcoding:ctx:${projectId}`)
      try {
        const { text, chips } = JSON.parse(raw)
        if (text) stream.setFileContext(text, chips ?? [])
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const onUpload = async (files: FileList) => {
    const parsed = await parseFiles(files)
    stream.setFileContext(parsed.text, parsed.chips)
  }

  const onPush = async () => {
    if (!github || !detail || pushing) return
    setPushing(true)
    setPushError(null)
    try {
      const url = await pushProjectToGithub(github, detail.name, detail.files.map((f) => ({ path: f.path, content: f.content })))
      setPushUrl(url)
    } catch (e) {
      setPushError(e instanceof Error ? e.message : String(e))
    } finally {
      setPushing(false)
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <SkillMcpDialog open={skillsOpen} onOpenChange={setSkillsOpen} />
      <TopBar
        projectName={detail?.name ?? '加载中…'}
        projectId={projectId}
        status={detail ? stream.status : 'draft'}
        mode={mode}
        agent={detail?.agent ?? null}
        running={stream.running}
        githubConnected={Boolean(github)}
        pushing={pushing}
        pushUrl={pushUrl}
        onPush={onPush}
        onPause={stream.pause}
        onResume={() => stream.confirmGenerate(model)}
        onOpenSkills={() => setSkillsOpen(true)}
      />
      {pushError && (
        <div className="border-b border-red-900 bg-red-950/40 px-4 py-1.5 text-center text-xs text-red-300">
          GitHub 推送失败：{pushError}（请检查 Token 的 repo 权限）
        </div>
      )}
      <ProgressBar
        progress={stream.progress}
        currentStep={stream.currentStep}
        stepLabel={stream.stepLabel}
        running={stream.running}
        status={stream.status}
        error={stream.error}
      />
      {stream.running ? (
        // 生成中：两栏 —— 左=模型对话思考与实时输出，右=进度/工作日志
        <PanelGroup key="layout-running" direction="horizontal" autoSaveId="jlcoding-2col" className="flex-1 overflow-hidden">
          <Panel defaultSize={72} minSize={40}>
            <section className="h-full overflow-hidden border-r">
              <ChatPanel
                messages={stream.messages}
                running={stream.running}
                error={stream.error}
                status={stream.status}
                awaiting={stream.awaiting}
                streaming={stream.streaming}
                usage={stream.usage}
                fileChips={stream.fileChips}
                onUpload={onUpload}
                onRemoveFile={(i) => {
                  const chips = stream.fileChips.filter((_, j) => j !== i)
                  stream.setFileContext(null, chips)
                }}
                mode={mode}
                model={model}
                onModelChange={setModel}
                onAnalyze={(content) => stream.analyze(content, model)}
                onConfirm={() => stream.confirmGenerate(model)}
                onRetry={stream.retry}
              />
            </section>
          </Panel>
          <PanelResizeHandle className="w-1.5 bg-zinc-900 transition-colors hover:bg-indigo-600" />
          <Panel defaultSize={28} minSize={16}>
            <section className="h-full overflow-hidden">
              <AgentLogPanel logs={stream.logs} files={files} simple={mode === 'novice'}
                updatedPaths={stream.updatedPaths} />
            </section>
          </Panel>
        </PanelGroup>
      ) : (
        // 完成/暂停/待确认：三栏 —— 对话 / 实时预览 / 工作日志，宽度可拖拽（自动记忆）
        <PanelGroup key="layout-3col" direction="horizontal" autoSaveId="jlcoding-3col" className="flex-1 overflow-hidden">
          <Panel defaultSize={26} minSize={16}>
            <section className="h-full overflow-hidden border-r">
              <ChatPanel
                messages={stream.messages}
                running={stream.running}
                error={stream.error}
                status={stream.status}
                awaiting={stream.awaiting}
                streaming={stream.streaming}
                usage={stream.usage}
                fileChips={stream.fileChips}
                onUpload={onUpload}
                onRemoveFile={(i) => {
                  const chips = stream.fileChips.filter((_, j) => j !== i)
                  stream.setFileContext(null, chips)
                }}
                mode={mode}
                model={model}
                onModelChange={setModel}
                onAnalyze={(content) => stream.analyze(content, model)}
                onConfirm={() => stream.confirmGenerate(model)}
                onRetry={stream.retry}
              />
            </section>
          </Panel>
          <PanelResizeHandle className="w-1.5 bg-zinc-900 transition-colors hover:bg-indigo-600" />
          <Panel defaultSize={50} minSize={30}>
            <section className="h-full overflow-hidden bg-zinc-900/40">
              <PreviewPanel files={files} building={stream.running} projectId={projectId} />
            </section>
          </Panel>
          <PanelResizeHandle className="w-1.5 bg-zinc-900 transition-colors hover:bg-indigo-600" />
          <Panel defaultSize={24} minSize={14}>
            <section className="h-full overflow-hidden border-l">
              <AgentLogPanel logs={stream.logs} files={files} simple={mode === 'novice'}
                updatedPaths={stream.updatedPaths} />
            </section>
          </Panel>
        </PanelGroup>
      )}
    </div>
  )
}
