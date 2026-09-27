'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { TopBar } from '@/components/TopBar'
import { ProgressBar } from '@/components/ProgressBar'
import { ChatPanel } from '@/components/ChatPanel'
import { PreviewPanel } from '@/components/PreviewPanel'
import { AgentLogPanel } from '@/components/AgentLogPanel'
import { useAgentStream, type ChatMessage, type BuildStatus } from '@/hooks/useAgentStream'
import { SkillMcpDialog } from '@/components/SkillMcpDialog'
import { ByokDialog } from '@/components/ByokDialog'
import { loadByok, type ByokConfig } from '@/lib/byok'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { DEFAULT_MODEL } from '@/lib/models'
import { isPythonProject } from '@/lib/app-meta'
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
  provider: string | null
  published?: boolean
  messages: { role: string; content: string; agent: string | null; step: string | null }[]
  files: { path: string; content: string }[]
  deploy?: { sha: string; url: string } | null
  viewerIsOwner?: boolean
  author?: { name: string; maskedEmail: string } | null
}

export interface VersionItem {
  version: number
  sha: string
  provider: string | null
  summary: string
  createdAt: string
}

let restoreId = 0

export function Workspace({ projectId }: { projectId: string }) {
  const params = useSearchParams()
  const standalone = params.get('preview') === '1'
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadDetail = () => {
    fetch(`/api/projects/${projectId}`)
      .then(async (r) => {
        if (r.ok) return r.json()
        const body = await r.json().catch(() => ({}))
        throw new Error(body.error || `项目加载失败（${r.status}）`)
      })
      .then(setDetail)
      .catch((e) => setLoadError(e.message))
  }

  useEffect(() => { loadDetail() }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const initial = {
    // （注释略）
    messages: (detail?.messages ?? []).filter(
      (m) => m.role === 'user' || (m.role === 'assistant' && m.step !== 'analysis')
    ) as ChatMessage[],
    files: Object.fromEntries((detail?.files ?? []).map((f) => [f.path, f.content])),
    status: (detail?.status ?? 'draft') as BuildStatus,
  }

  // （注释略）
  // （注释略）
  const stream = useAgentStream(projectId, initial, {
    onSynced: (synced) => {
      // （注释略）
      setDetail((prev) => ((prev ? { ...prev, ...synced } : synced) as unknown as ProjectDetail))
      const filesFromDb = Object.fromEntries(
        ((synced.files ?? []) as { path: string; content: string }[]).map((f) => [f.path, f.content])
      )
      if (Object.keys(filesFromDb).length > 0) streamRef.current?.resetFiles(filesFromDb)
    },
  })

  // （注释略）
  const hydratedRef = useRef(false)
  const streamRef = useRef<typeof stream | null>(null)
  streamRef.current = stream
  useEffect(() => {
    if (!detail || hydratedRef.current || stream.running) return
    hydratedRef.current = true
    stream.setMessages(initial.messages)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail])
  const [model, setModel] = useState<string>(DEFAULT_MODEL)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [github, setGithub] = useState<GithubConnection | null>(null)
  const [pushing, setPushing] = useState(false)
  const [pushUrl, setPushUrl] = useState<string | null>(null)
  const [pushError, setPushError] = useState<string | null>(null)
  const [versions, setVersions] = useState<VersionItem[]>([])
  const [rollingBack, setRollingBack] = useState(false)
  const [rollbackError, setRollbackError] = useState<string | null>(null)
  const [deploy, setDeploy] = useState<{ url: string; sha: string } | null>(null)
  const [deploying, setDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [byokConfig, setByokConfig] = useState<ByokConfig | null>(null)
  const [byokActive, setByokActive] = useState(false)
  const [byokOpen, setByokOpen] = useState(false)
  const [mockMode, setMockMode] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)

  // 发布/取消发布到「发现」（仅归属人 + ready 项目；结果回写 detail 以立即更新徽章）
  const onTogglePublish = async () => {
    if (!detail || publishing) return
    const want = !detail.published
    setPublishing(true)
    setPublishError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: want }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `操作失败（${res.status}）`)
      setDetail((prev) => (prev ? { ...prev, published: body.published, publishedAt: body.publishedAt } : prev))
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : String(e))
    } finally {
      setPublishing(false)
    }
  }

  // （注释略）
  useEffect(() => {
    setByokConfig(loadByok())
  }, [])
  useEffect(() => {
    stream.setByok(byokActive ? byokConfig : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byokActive, byokConfig])

  // （注释略）
  useEffect(() => {
    fetch('/api/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (s) setMockMode(!s.hasModel) })
      .catch(() => {})
  }, [])

  // （注释略）
  const onByokToggle = () => {
    if (!byokConfig) { setByokOpen(true); return }
    setByokActive((v) => !v)
  }

  // （注释略）
  const onDeploy = async () => {
    if (deploying) return
    setDeploying(true)
    setDeployError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/deploy`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `部署失败（${res.status}）`)
      setDeploy({ url: body.url, sha: body.sha })
    } catch (e) {
      setDeployError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeploying(false)
    }
  }

  // （注释略）
  useEffect(() => {
    if (detail?.deploy?.url) setDeploy({ url: detail.deploy.url, sha: detail.deploy.sha })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.deploy?.url])

  // （注释略）
  useEffect(() => {
    fetch(`/api/projects/${projectId}/versions`)
      .then((r) => (r.ok ? r.json() : Promise.resolve([])))
      .then((list: VersionItem[]) => { if (Array.isArray(list)) setVersions(list) })
      .catch(() => {})
  }, [projectId, stream.version])

  // 版本变化（新生成/增量修改/回滚）→ 自动重新部署，使画布与「线上使用」反映最新源码（按版本:sha 去重）
  const deployedShaRef = useRef<string | null>(null)
  useEffect(() => {
    if (!stream.version || deploying) return
    const target = `${stream.version.version}:${stream.version.sha}`
    if (deployedShaRef.current === target) return
    if (deploy?.sha === stream.version.sha) { deployedShaRef.current = target; return }
    deployedShaRef.current = target
    void onDeploy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.version])

  // （注释略）
  useEffect(() => {
    if (versions.length > 0 && !stream.version && detail?.status === 'ready') {
      stream.setVersion({ version: versions[0].version, sha: versions[0].sha })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions, detail?.status])

  // （注释略）
  const onRollback = async (v: number) => {
    if (rollingBack) return
    setRollingBack(true)
    setRollbackError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/versions/${v}/rollback`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `回滚失败（${res.status}）`)
      setDetail(body.project as ProjectDetail)
      stream.resetFiles(Object.fromEntries(((body.project?.files ?? []) as { path: string; content: string }[]).map((f) => [f.path, f.content])))
      stream.setStatus('ready')
      stream.setVersion({ version: body.version, sha: body.sha })
    } catch (e) {
      setRollbackError(e instanceof Error ? e.message : String(e))
    } finally {
      setRollingBack(false)
    }
  }

  useEffect(() => {
    setGithub(loadGithub())
  }, [])

  useEffect(() => {
    if (detail?.model) setModel(detail.model)
  }, [detail?.model])

  // （注释略）
  useEffect(() => {
    if (detail?.agent?.startsWith('custom:')) {
      const custom = loadCustom().agents.find((a) => a.id === detail.agent)
      stream.setAgentPrompt(custom?.prompt ?? null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.agent])

  // （注释略）
  useEffect(() => {
    const raw = sessionStorage.getItem(`jlcoding:ctx:${projectId}`)
    if (raw) {
      sessionStorage.removeItem(`jlcoding:ctx:${projectId}`)
      try {
        const { text, chips, links } = JSON.parse(raw)
        if (text) stream.setFileContext(text, chips ?? [])
        for (const url of links ?? []) stream.addLink(url)
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // （注释略）
  useEffect(() => {
    if (!detail) return
    if (detail.status === 'awaiting') {
      const analysis = [...detail.messages].reverse().find((m) => m.step === 'analysis')?.content
      if (analysis) stream.setAwaiting(analysis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail])

  // （注释略）
  useEffect(() => {
    if (!detail || stream.logs.length > 0) return
    const restored: LogEntry[] = []
    for (const m of detail.messages) {
      if (m.role === 'assistant' && m.agent) {
        // （注释略）
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
    // （注释略）
    if (detail.status === 'ready') {
      if (!restored.some((l) => l.agent === '业务分析师' && l.status === 'done')) {
        restored.unshift({ id: `restore-${++restoreId}`, agent: '业务分析师', kind: 'text', title: '业务分析师 输出', detail: '（历史项目：分析阶段已完成）', status: 'done', createdAt: 0 })
      }
      if (!restored.some((l) => l.kind === 'command')) {
        restored.push({ id: `restore-${++restoreId}`, agent: '测试工程师', kind: 'command', title: '$ npm run build', detail: '（历史项目：构建校验已通过）', status: 'done', createdAt: 0 })
      }
    }
    if (restored.length) stream.setLogs(restored)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail])

  // （注释略）
  useEffect(() => {
    if (detail?.status === 'ready') stream.setRestoredReady()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.status])

  // （注释略）
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
  const hasFiles = Object.keys(files).length > 0
  // 发现模式只读：非归属人查看已发布项目（隐藏输入区与全部写操作）
  const readOnly = Boolean(detail && detail.viewerIsOwner === false)

  if (loadError) {
    return <div className="flex h-screen items-center justify-center text-zinc-500">{loadError}</div>
  }

  if (standalone) {
    return (
      <div className="h-screen bg-white">
        {detail ? <PreviewPanel files={files} building={stream.running} projectId={projectId} standalone deployUrl={deploy?.url ?? null} deploySha={deploy?.sha ?? null} deploying={deploying} onDeploy={onDeploy} readOnly={readOnly} /> : null}
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
      <ByokDialog
        open={byokOpen}
        onOpenChange={setByokOpen}
        onSaved={(c) => { setByokConfig(c); setByokActive(true) }}
        onCleared={() => { setByokConfig(null); setByokActive(false) }}
      />
      <TopBar
        projectName={detail?.name ?? '加载中…'}
        projectId={projectId}
        status={detail ? stream.status : 'draft'}
        mode={mode}
        agent={detail?.agent ?? null}
        running={stream.running}
        version={stream.version}
        versions={versions}
        rollingBack={rollingBack}
        onRollback={onRollback}
        deploy={deploy}
        deploying={deploying}
        onDeploy={onDeploy}
        isPythonApp={isPythonProject(Object.keys(files))}
        githubConnected={Boolean(github)}
        pushing={pushing}
        pushUrl={pushUrl}
        onPush={onPush}
        onPause={stream.pause}
        onResume={() => stream.confirmGenerate(model)}
        onOpenSkills={() => setSkillsOpen(true)}
        readOnly={readOnly}
        published={Boolean(detail?.published)}
        author={detail?.author ?? null}
        onTogglePublish={onTogglePublish}
        publishing={publishing}
      />
      {(pushError || rollbackError || deployError || publishError) && (
        <div className="border-b border-red-900 bg-red-950/40 px-4 py-1.5 text-center text-xs text-red-300">
          {pushError ? `GitHub 推送失败：${pushError}（请检查 Token 的 repo 权限）` : rollbackError ? `回滚失败：${rollbackError}` : deployError ? `部署失败：${deployError}` : `发布失败：${publishError}`}
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
      {stream.running || !hasFiles ? (
        // 生成中 / 待确认（尚无产出）：两栏布局（与分析阶段一致），中间预览画布仅在出现文件后弹出
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
                linkChips={stream.linkChips}
                onAddLink={stream.addLink}
                onRemoveLink={stream.removeLink}
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
                byokConfig={byokConfig}
                byokActive={byokActive}
                onByokToggle={onByokToggle}
                onByokSettings={() => setByokOpen(true)}
                mockMode={mockMode && !byokActive}
                onPause={stream.pause}
                readOnly={readOnly}
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
        // （注释略）
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
                linkChips={stream.linkChips}
                onAddLink={stream.addLink}
                onRemoveLink={stream.removeLink}
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
                byokConfig={byokConfig}
                byokActive={byokActive}
                onByokToggle={onByokToggle}
                onByokSettings={() => setByokOpen(true)}
                mockMode={mockMode && !byokActive}
                onPause={stream.pause}
                readOnly={readOnly}
              />
            </section>
          </Panel>
          <PanelResizeHandle className="w-1.5 bg-zinc-900 transition-colors hover:bg-indigo-600" />
          <Panel defaultSize={50} minSize={30}>
            <section className="h-full overflow-hidden bg-zinc-900/40">
              <PreviewPanel files={files} building={stream.running} projectId={projectId} deployUrl={deploy?.url ?? null} deploySha={deploy?.sha ?? null} deploying={deploying} onDeploy={onDeploy} readOnly={readOnly} />
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
