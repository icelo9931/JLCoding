'use client'

import { useCallback, useRef, useState } from 'react'
import type { ServerEvent, LogEntry } from '@/lib/types'
import { DEFAULT_MODEL } from '@/lib/models'
import { loadCustom } from '@/lib/custom-store'
import type { ByokConfig } from '@/lib/byok'

let logId = 0
const nextId = () => `log-${++logId}-${Date.now()}`

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  agent?: string | null
}

export type BuildStatus = 'draft' | 'building' | 'awaiting' | 'paused' | 'ready' | 'error'

export type Phase = 'analyze' | 'continue'

// 流结束后从 DB 收敛状态的回调（detail 为 GET /api/projects/:id 的完整响应）
export type SyncedDetail = {
  status: string
  messages?: unknown[]
  files?: unknown[]
  [key: string]: unknown
}

export function useAgentStream(projectId: string, initial: {
  messages: ChatMessage[]
  files: Record<string, string>
  status: BuildStatus
}, options?: { onSynced?: (detail: SyncedDetail) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [files, setFiles] = useState<Record<string, string>>(initial.files)
  const [progress, setProgress] = useState(initial.status === 'ready' ? 100 : 0)
  const [currentStep, setCurrentStep] = useState(0) // 1-5，精确高亮当前阶段（避免多步同时转圈）
  const [stepLabel, setStepLabel] = useState('')
  const [status, setStatus] = useState<BuildStatus>(initial.status)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [awaiting, setAwaiting] = useState<string | null>(null) // 待确认的分析结果
  const [streaming, setStreaming] = useState<{ agent: string; text: string } | null>(null) // 正在流式输出的角色
  const [usage, setUsage] = useState<{ input: number; output: number } | null>(null) // 本轮 token 消耗
  const [updatedPaths, setUpdatedPaths] = useState<string[]>([]) // 本轮被修改的文件（diff 式可视化）
  const [version, setVersion] = useState<{ version: number; sha: string } | null>(null) // 当前版本（快照/回滚后更新）
  const lastInputRef = useRef<string | null>(null)
  const lastModelRef = useRef<string>(DEFAULT_MODEL)
  const lastPhaseRef = useRef<Phase>('analyze')
  const abortRef = useRef<AbortController | null>(null)
  const fileContextRef = useRef<string | null>(null)
  const linkContextRef = useRef<string[]>([])
  const agentPromptRef = useRef<string | null>(null)
  const byokRef = useRef<ByokConfig | null>(null) // BYOK 自有 API Key（Workspace 依据模型选择注入）
  const [fileChips, setFileChips] = useState<string[]>([]) // 已附加文件名（展示用）
  const [linkChips, setLinkChips] = useState<string[]>([]) // 已附加链接（展示用）
  const [runInfo, setRunInfo] = useState<{ provider: string; model: string; runId: string } | null>(null) // 本轮模型调用信息（工作日志卡片展示）
  const optionsRef = useRef(options)
  optionsRef.current = options
  const runLogIdRef = useRef<string | null>(null) // 本轮「模型调用」卡片对应的日志 id
  const runStartedAtRef = useRef<number | null>(null)
  const firstTokenRef = useRef(true)

  // 「模型调用」卡片：Provider / Model / Request ID / 首 Token 延迟（首 delta 到达时补上）
  const finalizeRunLog = (extra?: string, status: 'done' | 'error' = 'done') => {
    const entryId = runLogIdRef.current
    if (!entryId) return
    runLogIdRef.current = null
    setLogs((prev) => prev.map((l) => (l.id === entryId ? { ...l, status, detail: extra ? `${l.detail}\n${extra}` : l.detail } : l)))
  }

  const providerLabel = (provider: string) =>
    provider === 'mock' ? 'Mock 演示' : provider.startsWith('byok:') ? '自有 API Key（BYOK）' : 'OpenCode Zen'

  const applyEvent = useCallback((event: ServerEvent) => {
    switch (event.type) {
      case 'run_started':
        // 模型调用记录（工作日志卡片呈现，不在对话流直白插消息）：
        // Provider / Model / Request ID；首 Token 延迟由第一个 agent_delta 补记
        // 仅 CODE 意图进入构建状态机（QA/VERSION 回复任务状态保持）
        if (!event.intent || event.intent === 'code') setStatus('building')
        runStartedAtRef.current = Date.now()
        firstTokenRef.current = true
        const id = nextId()
        runLogIdRef.current = id
        setRunInfo({ provider: event.provider, model: event.model, runId: event.runId })
        setLogs((prev) => [
          ...prev,
          {
            id,
            agent: '系统',
            kind: 'text',
            title: `模型调用 · ${providerLabel(event.provider)}`,
            detail: `Provider: ${providerLabel(event.provider)}${event.provider === 'mock' ? '（未配置真实模型）' : ''}\nModel: ${event.provider.startsWith('byok:') ? event.provider.slice(5) : event.model}\nRequest ID: ${event.runId}`,
            status: 'running',
            createdAt: Date.now(),
          },
        ])
        break
      case 'agent_delta':
        // 首 Token 延迟：run_started → 第一个输出分片
        if (runLogIdRef.current && firstTokenRef.current) {
          firstTokenRef.current = false
          const latency = runStartedAtRef.current ? ((Date.now() - runStartedAtRef.current) / 1000).toFixed(1) : null
          finalizeRunLog(latency ? `首 Token 延迟: ${latency}s` : undefined)
        }
        setStreaming((prev) =>
          prev && prev.agent === event.agent
            ? { agent: prev.agent, text: prev.text + event.delta }
            : { agent: event.agent, text: event.delta }
        )
        break
      case 'agent_start':
        setLogs((prev) => [
          ...prev,
          { id: nextId(), agent: event.agent, kind: 'text', title: event.message, status: 'running', createdAt: Date.now() },
        ])
        setStreaming({ agent: event.agent, text: '' })
        break
      case 'agent_delta':
        setStreaming((prev) =>
          prev && prev.agent === event.agent
            ? { agent: prev.agent, text: prev.text + event.delta }
            : { agent: event.agent, text: event.delta }
        )
        break
      case 'agent_complete':
        setStreaming(null)
        setLogs((prev) => {
          const next = [...prev]
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].agent === event.agent && next[i].status === 'running') {
              next[i] = { ...next[i], status: 'done' }
              break
            }
          }
          return [
            ...next,
            { id: nextId(), agent: event.agent, kind: 'text', title: `${event.agent} 输出`, detail: event.result, status: 'done', createdAt: Date.now() },
          ]
        })
        if (event.agent !== '业务分析师') {
          setMessages((prev) => [...prev, { role: 'assistant', content: event.result, agent: event.agent }])
        }
        break
      case 'file_created':
      case 'file_updated':
        setFiles((prev) => ({ ...prev, [event.path]: event.content }))
        if (event.type === 'file_updated') setUpdatedPaths((prev) => (prev.includes(event.path) ? prev : [...prev, event.path]))
        setLogs((prev) => [
          ...prev,
          { id: nextId(), agent: '代码工程师', kind: 'file', title: `${event.type === 'file_created' ? '创建' : '更新'} ${event.path}`, path: event.path, content: event.content, status: 'done', createdAt: Date.now() },
        ])
        break
      case 'command_run':
        setLogs((prev) => [
          ...prev,
          {
            id: nextId(),
            agent: '测试工程师',
            kind: 'command',
            title: `$ ${event.command}`,
            detail: [event.stdout, event.stderr].filter(Boolean).join('\n'),
            status: event.exitCode === 0 ? 'done' : 'error',
            createdAt: Date.now(),
          },
        ])
        break
      case 'task_progress':
        setProgress(Math.round((event.step / event.total) * 100))
        setCurrentStep(event.step)
        setStepLabel(event.label)
        break
      case 'usage':
        setUsage((prev) => ({
          input: (prev?.input ?? 0) + event.inputTokens,
          output: (prev?.output ?? 0) + event.outputTokens,
        }))
        break
      case 'awaiting_confirmation':
        setAwaiting(event.analysis)
        setStatus('awaiting')
        setRunning(false)
        setProgress(20)
        setStepLabel('等待确认')
        finalizeRunLog()
        break
      case 'preview_ready':
        setProgress(100)
        setCurrentStep(5)
        setStatus('ready')
        setStepLabel('预览就绪')
        setAwaiting(null)
        break
      case 'paused':
        setStatus('paused')
        setRunning(false)
        setStepLabel('已暂停')
        finalizeRunLog('已暂停（断点保留）')
        break
      case 'error':
        setError(event.message)
        setStatus('error')
        setLogs((prev) => [...prev, { id: nextId(), agent: '系统', kind: 'text', title: `错误：${event.message}`, status: 'error', createdAt: Date.now() }])
        finalizeRunLog(`失败：${event.message.slice(0, 80)}`, 'error')
        break
      case 'version_created':
        // 版本快照/回滚完成：更新徽章数据源
        setVersion({ version: event.version, sha: event.sha })
        break
      case 'complete':
        setRunning(false)
        setAwaiting(null)
        // 仅 CODE 意图标记就绪（QA/VERSION 回复任务：状态以 DB 为准，syncFromDb 收敛——
        // 例：draft 项目问一个问题不应显示"已就绪"）
        if (!event.intent || event.intent === 'code') {
          setStatus('ready')
          setProgress(100)
          setCurrentStep(5)
          setStepLabel('预览就绪')
        }
        finalizeRunLog()
        break
    }
  }, [])

  // DB 收敛：流结束后以服务端为唯一真源对齐状态/进度（进度条不会卡在中间值）
  const syncFromDb = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}`)
      if (!r.ok) return
      const detail = (await r.json()) as SyncedDetail
      if (detail.status) setStatus(detail.status as BuildStatus)
      if (detail.status === 'ready') {
        setProgress(100)
        setCurrentStep(5)
        setStepLabel('预览就绪')
      } else if (detail.status === 'awaiting') {
        setProgress(20)
        setStepLabel('等待确认')
      } else if (detail.status === 'paused') {
        setStepLabel('已暂停')
      }
      optionsRef.current?.onSynced?.(detail)
    } catch { /* 网络异常时保留本地事件驱动状态 */ }
  }, [projectId])

  const request = useCallback(async (body: { message?: string; phase: Phase }, model: string) => {
    setRunning(true)
    setError(null)
    // 注意：不预设 building——仅 CODE 意图（run_started intent==='code'）进入构建状态机；
    // QA/VERSION 回复型任务状态保持不变，结束后由 syncFromDb 以 DB 为准收敛
    if (body.phase === 'continue') setAwaiting(null)
    setUsage(null) // 每轮重置 token 统计
    setUpdatedPaths([])
    const ac = new AbortController()
    abortRef.current = ac

    // 自动携带：用户自定义技能 / MCP 配置 / 附加文件内容 / BYOK 自有 Key
    const custom = loadCustom()
    const extras = {
      skills: custom.skills.length ? custom.skills : undefined,
      mcps: custom.mcps.length ? custom.mcps : undefined,
      fileContext: fileContextRef.current ?? undefined,
      linkContext: linkContextRef.current.length ? linkContextRef.current : undefined,
      agentPrompt: agentPromptRef.current ?? undefined,
      byok: byokRef.current ?? undefined,
    }

    try {
      const response = await fetch(`/api/projects/${projectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, model, ...extras }),
        signal: ac.signal,
      })
      if (!response.ok || !response.body) {
        const detail = await response.text()
        throw new Error(detail || `请求失败 (${response.status})`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            applyEvent(JSON.parse(line.slice(6)) as ServerEvent)
          } catch { /* 忽略不完整行 */ }
        }
      }
    } catch (e) {
      if (ac.signal.aborted) {
        // 用户主动暂停：服务端 cancel() 会落库 paused，本地直接呈现，不 refetch（避免读到中止过渡期的 building）
        setStatus('paused')
        setStepLabel('已暂停')
      } else {
        applyEvent({ type: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    } finally {
      setRunning(false)
      abortRef.current = null
      // 三出口统一收敛：①正常结束 ②网络/流异常 ③服务端超时 error 事件 → 均以 DB 最终状态为准
      if (!ac.signal.aborted) void syncFromDb()
    }
  }, [projectId, applyEvent, syncFromDb])

  // 提交需求（或追加内容）：只跑分析，等待确认。silent=true 用于失败重试（用户消息已在列表与库中，防双写）
  const analyze = useCallback((content: string, model: string, opts?: { silent?: boolean }) => {
    if (!content.trim() || running) return
    lastInputRef.current = content
    lastModelRef.current = model
    lastPhaseRef.current = 'analyze'
    if (!opts?.silent) setMessages((prev) => [...prev, { role: 'user', content }])
    return request({ message: content, phase: 'analyze' }, model)
  }, [running, request])

  // 确认分析，继续生成（断点恢复也走这里）
  const confirmGenerate = useCallback((model: string) => {
    if (running) return
    lastModelRef.current = model
    lastPhaseRef.current = 'continue'
    return request({ phase: 'continue' }, model)
  }, [running, request])

  // 暂停：中止请求流，服务端标记 paused，已完成阶段已落库
  const pause = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  // 重试：分析阶段重试不重复追加用户消息（本地 silent + 服务端内容去重双保险）
  const retry = useCallback(() => {
    if (lastPhaseRef.current === 'analyze' && lastInputRef.current) {
      analyze(lastInputRef.current, lastModelRef.current, { silent: true })
    } else {
      confirmGenerate(lastModelRef.current)
    }
  }, [analyze, confirmGenerate])

  // 附加文件（上传后设置；发送后清空）
  const setFileContext = useCallback((text: string | null, chips: string[]) => {
    fileContextRef.current = text
    setFileChips(chips)
  }, [])

  // 附加链接（Agent 分析时抓取网页文本注入上下文）
  const addLink = useCallback((url: string) => {
    const normalized = /^https?:\/\//.test(url) ? url : `https://${url}`
    if (!linkContextRef.current.includes(normalized)) {
      linkContextRef.current = [...linkContextRef.current, normalized]
    }
    setLinkChips([...linkContextRef.current])
  }, [])

  const removeLink = useCallback((url: string) => {
    linkContextRef.current = linkContextRef.current.filter((u) => u !== url)
    setLinkChips([...linkContextRef.current])
  }, [])

  // 自定义 agent 的主导 prompt（Workspace 依据 project.agent 注入）
  const setAgentPrompt = useCallback((prompt: string | null) => {
    agentPromptRef.current = prompt
  }, [])

  // BYOK：选择「使用我自己的 API Key」时随请求携带（localStorage 存储，不经过服务器持久化）
  const setByok = useCallback((config: ByokConfig | null) => {
    byokRef.current = config
  }, [])

  // 刷新恢复：就绪项目进度归位（detail 到达前 progress 初值为 0，需回填 100%）
  const setRestoredReady = useCallback(() => {
    setProgress(100)
    setCurrentStep(5)
    setStepLabel('预览就绪')
    setStatus('ready')
  }, [])

  // 回滚/恢复同步：用服务端文件集整体替换本地文件 state（旧 state 不得遮蔽恢复数据），Preview 随之重新编译
  const resetFiles = useCallback((next: Record<string, string>) => {
    setFiles(next)
    setUpdatedPaths([])
  }, [])

  return { messages, logs, files, progress, currentStep, stepLabel, status, error, running, awaiting, streaming, usage, updatedPaths, version, runInfo, fileChips, linkChips, setFileContext, addLink, removeLink, setAgentPrompt, setByok, analyze, confirmGenerate, pause, retry, setLogs, setStatus, setAwaiting, setMessages, setVersion, resetFiles, setRestoredReady }
}
