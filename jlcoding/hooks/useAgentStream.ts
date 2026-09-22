'use client'

import { useCallback, useRef, useState } from 'react'
import type { ServerEvent, LogEntry } from '@/lib/types'
import { DEFAULT_MODEL } from '@/lib/models'
import { loadCustom } from '@/lib/custom-store'

let logId = 0
const nextId = () => `log-${++logId}-${Date.now()}`

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  agent?: string | null
}

export type BuildStatus = 'draft' | 'building' | 'awaiting' | 'paused' | 'ready' | 'error'

export type Phase = 'analyze' | 'continue'

export function useAgentStream(projectId: string, initial: {
  messages: ChatMessage[]
  files: Record<string, string>
  status: BuildStatus
}) {
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
  const lastInputRef = useRef<string | null>(null)
  const lastModelRef = useRef<string>(DEFAULT_MODEL)
  const lastPhaseRef = useRef<Phase>('analyze')
  const abortRef = useRef<AbortController | null>(null)
  const fileContextRef = useRef<string | null>(null)
  const linkContextRef = useRef<string[]>([])
  const agentPromptRef = useRef<string | null>(null)
  const [fileChips, setFileChips] = useState<string[]>([]) // 已附加文件名（展示用）
  const [linkChips, setLinkChips] = useState<string[]>([]) // 已附加链接（展示用）

  const applyEvent = useCallback((event: ServerEvent) => {
    switch (event.type) {
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
        break
      case 'error':
        setError(event.message)
        setStatus('error')
        setLogs((prev) => [...prev, { id: nextId(), agent: '系统', kind: 'text', title: `错误：${event.message}`, status: 'error', createdAt: Date.now() }])
        break
      case 'complete':
        setStatus('ready')
        setRunning(false)
        setAwaiting(null)
        break
    }
  }, [])

  const request = useCallback(async (body: { message?: string; phase: Phase }, model: string) => {
    setRunning(true)
    setError(null)
    setStatus('building')
    if (body.phase === 'continue') setAwaiting(null)
    setUsage(null) // 每轮重置 token 统计
    setUpdatedPaths([])
    const ac = new AbortController()
    abortRef.current = ac

    // 自动携带：用户自定义技能 / MCP 配置 / 附加文件内容
    const custom = loadCustom()
    const extras = {
      skills: custom.skills.length ? custom.skills : undefined,
      mcps: custom.mcps.length ? custom.mcps : undefined,
      fileContext: fileContextRef.current ?? undefined,
      linkContext: linkContextRef.current.length ? linkContextRef.current : undefined,
      agentPrompt: agentPromptRef.current ?? undefined,
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
        // 用户主动暂停
        setStatus('paused')
        setStepLabel('已暂停')
      } else {
        applyEvent({ type: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }, [projectId, applyEvent])

  // 提交需求（或追加内容）：只跑分析，等待确认
  const analyze = useCallback((content: string, model: string) => {
    if (!content.trim() || running) return
    lastInputRef.current = content
    lastModelRef.current = model
    lastPhaseRef.current = 'analyze'
    setMessages((prev) => [...prev, { role: 'user', content }])
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

  const retry = useCallback(() => {
    if (lastPhaseRef.current === 'analyze' && lastInputRef.current) {
      analyze(lastInputRef.current, lastModelRef.current)
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

  return { messages, logs, files, progress, currentStep, stepLabel, status, error, running, awaiting, streaming, usage, updatedPaths, fileChips, linkChips, setFileContext, addLink, removeLink, setAgentPrompt, analyze, confirmGenerate, pause, retry, setLogs, setStatus, setAwaiting, setMessages }
}
