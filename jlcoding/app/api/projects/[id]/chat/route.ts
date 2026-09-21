import { db } from '@/lib/db'
import { Sandbox } from '@/lib/sandbox'
import { runAnalyze, runContinue, PausedError, type CompletedStages } from '@/lib/agent'
import { languageOf } from '@/lib/utils'
import { DEFAULT_MODEL, isValidModel } from '@/lib/models'
import { isDbReachable, dbErrorText } from '@/lib/db-errors'
import type { ServerEvent } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 300

const STEP_OF_AGENT: Record<string, string> = {
  业务分析师: 'analysis',
  架构设计师: 'design',
  代码工程师: 'engineering',
  测试工程师: 'validation',
  修复工程师: 'fix',
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { message, model, phase } = await req.json()
  const projectId = params.id

  if (!(await isDbReachable())) {
    return new Response(JSON.stringify({ error: dbErrorText() }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) {
    return new Response(JSON.stringify({ error: '项目不存在' }), { status: 404 })
  }

  const modelId = isValidModel(model) ? model : isValidModel(project.model) ? project.model! : DEFAULT_MODEL
  await db.project.update({ where: { id: projectId }, data: { model: modelId } })

  // ---------- 阶段 1：需求分析（产出理解，等待用户确认/追加） ----------
  if (phase === 'analyze') {
    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: '消息不能为空' }), { status: 400 })
    }
    await db.message.create({
      data: { projectId, role: 'user', content: message.trim() },
    })
    // 追加场景：合并该项目全部 user 消息作为完整需求
    const userMessages = await db.message.findMany({
      where: { projectId, role: 'user' },
      orderBy: { createdAt: 'asc' },
    })
    const fullRequirement = userMessages.map((m) => m.content).join('\n【追加】')

    const sandbox = new Sandbox()
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false
        const send = (event: ServerEvent) => {
          if (closed) return
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)) } catch { closed = true }
        }
        try {
          send({ type: 'agent_start', agent: '业务分析师', message: '正在分析需求' })
          send({ type: 'task_progress', step: 1, total: 5, label: '分析需求' })
          await db.project.update({ where: { id: projectId }, data: { status: 'building' } })

          const analysis = await runAnalyze({
            userInput: fullRequirement,
            sandbox,
            sessionId: projectId,
            model: modelId,
            onEvent: send,
          })

          await db.message.create({
            data: { projectId, role: 'assistant', content: analysis, agent: '业务分析师', step: 'analysis' },
          })
          await db.project.update({ where: { id: projectId }, data: { status: 'awaiting' } })

          send({ type: 'agent_complete', agent: '业务分析师', result: analysis })
          send({ type: 'awaiting_confirmation', analysis })
        } catch (error) {
          if (error instanceof PausedError) {
            await db.project.update({ where: { id: projectId }, data: { status: 'paused' } }).catch(() => {})
            send({ type: 'paused' })
          } else {
            send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
            await db.project.update({ where: { id: projectId }, data: { status: 'error' } })
          }
        } finally {
          closed = true
          controller.close()
        }
      },
    })
    return sse(stream)
  }

  // ---------- 阶段 2：确认后继续（设计 → 编码 → 校验 → 修复，支持断点跳过与暂停） ----------
  const messages = await db.message.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } })
  const priorAnalysis = [...messages].reverse().find((m) => m.step === 'analysis')?.content
  if (!priorAnalysis) {
    return new Response(JSON.stringify({ error: '请先提交需求完成分析' }), { status: 400 })
  }
  const userMessages = messages.filter((m) => m.role === 'user')
  const fullRequirement = userMessages.map((m) => m.content).join('\n【追加】')

  const completed: CompletedStages = {
    analysis: true,
    design: messages.some((m) => m.step === 'design'),
    engineering: messages.some((m) => m.step === 'engineering'),
  }

  const existingFiles = await db.file.findMany({ where: { projectId } })
  const sandbox = new Sandbox(Object.fromEntries(existingFiles.map((f) => [f.path, f.content])))

  const abortController = new AbortController()
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const send = (event: ServerEvent) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)) } catch { closed = true }
      }
      const heartbeat = setInterval(() => {
        if (closed) return
        try { controller.enqueue(encoder.encode(`: ping\n\n`)) } catch { closed = true }
      }, 15000)

      try {
        await db.project.update({ where: { id: projectId }, data: { status: 'building' } })
        await runContinue(
          {
            userInput: fullRequirement,
            priorAnalysis,
            existingFiles,
            sandbox,
            sessionId: projectId,
            model: modelId,
            abortSignal: abortController.signal,
            onEvent: async (event) => {
              send(event)
              if (event.type === 'file_created' || event.type === 'file_updated') {
                await db.file.upsert({
                  where: { projectId_path: { projectId, path: event.path } },
                  create: { projectId, path: event.path, content: event.content, language: languageOf(event.path) },
                  update: { content: event.content, language: languageOf(event.path) },
                })
              }
              if (event.type === 'agent_complete') {
                const step = STEP_OF_AGENT[event.agent]
                // 断点恢复时跳过重复落库
                if (step && !(step === 'design' && completed.design) && !(step === 'engineering' && completed.engineering)) {
                  await db.message.create({
                    data: { projectId, role: 'assistant', content: event.result, agent: event.agent, step },
                  })
                }
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
          },
          completed
        )

        send({ type: 'task_progress', step: 5, total: 5, label: '预览就绪' })
        send({ type: 'preview_ready' })
        send({ type: 'complete', projectId })
        await db.project.update({ where: { id: projectId }, data: { status: 'ready' } })
      } catch (error) {
        if (error instanceof PausedError || abortController.signal.aborted) {
          await db.project.update({ where: { id: projectId }, data: { status: 'paused' } }).catch(() => {})
          send({ type: 'paused' })
        } else {
          send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
          await db.project.update({ where: { id: projectId }, data: { status: 'error' } })
        }
      } finally {
        clearInterval(heartbeat)
        closed = true
        controller.close()
      }
    },
    // 客户端断开（暂停按钮/锁屏）：中止管线，标记 paused
    async cancel() {
      abortController.abort()
      await db.project.update({ where: { id: projectId }, data: { status: 'paused' } }).catch(() => {})
    },
  })
  return sse(stream)
}

function sse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
