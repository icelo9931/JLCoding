import { db } from '@/lib/db'
import { Sandbox } from '@/lib/sandbox'
import { runAgent } from '@/lib/agent'
import { languageOf } from '@/lib/utils'
import { DEFAULT_MODEL, isValidModel } from '@/lib/models'
import type { ServerEvent } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { message, model } = await req.json()
  const projectId = params.id

  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) {
    return new Response(JSON.stringify({ error: '项目不存在' }), { status: 404 })
  }
  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: '消息不能为空' }), { status: 400 })
  }

  const modelId = isValidModel(model) ? model : isValidModel(project.model) ? project.model! : DEFAULT_MODEL

  await db.message.create({
    data: { projectId, role: 'user', content: message.trim() },
  })
  await db.project.update({ where: { id: projectId }, data: { status: 'building', model: modelId } })

  const existingFiles = await db.file.findMany({ where: { projectId } })
  const sandbox = new Sandbox(
    Object.fromEntries(existingFiles.map((f) => [f.path, f.content]))
  )

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const send = (event: ServerEvent) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          closed = true
        }
      }

      // SSE 心跳：防止长时间无事件导致代理/客户端超时断开
      const heartbeat = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`))
        } catch {
          closed = true
        }
      }, 15000)

      try {
        send({ type: 'agent_start', agent: '业务分析师', message: '开始分析需求' })
        send({ type: 'task_progress', step: 1, total: 5, label: '分析需求' })

        await runAgent({
          userInput: message.trim(),
          sandbox,
          model: modelId,
          sessionId: projectId,
          onEvent: async (event) => {
            send(event)
            // 事件落库：文件与角色输出持久化
            if (event.type === 'file_created' || event.type === 'file_updated') {
              await db.file.upsert({
                where: { projectId_path: { projectId, path: event.path } },
                create: { projectId, path: event.path, content: event.content, language: languageOf(event.path) },
                update: { content: event.content, language: languageOf(event.path) },
              })
            }
            if (event.type === 'agent_complete') {
              await db.message.create({
                data: { projectId, role: 'assistant', content: event.result, agent: event.agent },
              })
            }
            if (event.type === 'command_run') {
              await db.message.create({
                data: {
                  projectId,
                  role: 'system',
                  content: `$ ${event.command}\n${event.stdout || event.stderr}`,
                  agent: '测试工程师',
                  step: 'validation',
                },
              })
            }
          },
          existingFiles,
        })

        send({ type: 'task_progress', step: 5, total: 5, label: '预览就绪' })
        send({ type: 'preview_ready' })
        send({ type: 'complete', projectId })
        await db.project.update({ where: { id: projectId }, data: { status: 'ready' } })
      } catch (error) {
        send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
        await db.project.update({ where: { id: projectId }, data: { status: 'error' } })
      } finally {
        clearInterval(heartbeat)
        closed = true
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
