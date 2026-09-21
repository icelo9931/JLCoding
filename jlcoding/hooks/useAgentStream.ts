'use client'

import { useCallback, useRef, useState } from 'react'
import type { ServerEvent, LogEntry } from '@/lib/types'

let logId = 0
const nextId = () => `log-${++logId}-${Date.now()}`

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  agent?: string | null
}

export type BuildStatus = 'draft' | 'building' | 'ready' | 'error'

export function useAgentStream(projectId: string, initial: {
  messages: ChatMessage[]
  files: Record<string, string>
  status: BuildStatus
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [files, setFiles] = useState<Record<string, string>>(initial.files)
  const [progress, setProgress] = useState(initial.status === 'ready' ? 100 : 0)
  const [stepLabel, setStepLabel] = useState('')
  const [status, setStatus] = useState<BuildStatus>(initial.status)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const lastInputRef = useRef<string | null>(null)

  const applyEvent = useCallback((event: ServerEvent) => {
    switch (event.type) {
      case 'agent_start':
        setLogs((prev) => [
          ...prev,
          { id: nextId(), agent: event.agent, kind: 'text', title: event.message, status: 'running', createdAt: Date.now() },
        ])
        break
      case 'agent_complete':
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
        setMessages((prev) => [...prev, { role: 'assistant', content: event.result, agent: event.agent }])
        break
      case 'file_created':
      case 'file_updated':
        setFiles((prev) => ({ ...prev, [event.path]: event.content }))
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
        setStepLabel(event.label)
        break
      case 'preview_ready':
        setProgress(100)
        setStatus('ready')
        setStepLabel('预览就绪')
        break
      case 'error':
        setError(event.message)
        setStatus('error')
        setLogs((prev) => [...prev, { id: nextId(), agent: '系统', kind: 'text', title: `错误：${event.message}`, status: 'error', createdAt: Date.now() }])
        break
      case 'complete':
        setStatus('ready')
        break
    }
  }, [])

  const send = useCallback(async (content: string, model?: string) => {
    if (!content.trim() || running) return
    lastInputRef.current = content
    setRunning(true)
    setError(null)
    setStatus('building')
    setMessages((prev) => [...prev, { role: 'user', content }])

    try {
      const response = await fetch(`/api/projects/${projectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, model }),
      })
      if (!response.ok || !response.body) {
        const body = await response.text()
        throw new Error(body || `请求失败 (${response.status})`)
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
      applyEvent({ type: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setRunning(false)
    }
  }, [projectId, running, applyEvent])

  const retry = useCallback(() => {
    if (lastInputRef.current) send(lastInputRef.current)
  }, [send])

  return { messages, logs, files, progress, stepLabel, status, error, running, send, retry, setLogs }
}
