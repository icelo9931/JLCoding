import { db } from '@/lib/db'
import { Sandbox } from '@/lib/sandbox'
import { runAnalyze, runContinue, PausedError, type CompletedStages } from '@/lib/agent'
import { languageOf } from '@/lib/utils'
import { DEFAULT_MODEL, isValidModel } from '@/lib/models'
import { agentHint } from '@/lib/agents'
import { BUILT_IN_SKILLS, customSkillsInjection, mcpInjection, type CustomSkill, type McpConfig } from '@/lib/skills'
import { isDbReachable, dbErrorText } from '@/lib/db-errors'
import { getSessionUser } from '@/lib/auth'
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
  const { message, model, phase, agentId, agentPrompt, skills, mcps, fileContext, linkContext } = await req.json()
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
  // 权限：项目归属人（或无归属的遗留项目）可操作
  if (project.userId) {
    const user = await getSessionUser(req)
    if (!user || user.id !== project.userId) {
      return new Response(JSON.stringify({ error: '无权操作该项目，请登录归属账号' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  const modelId = isValidModel(model) ? model : isValidModel(project.model) ? project.model! : DEFAULT_MODEL
  // 主导 agent：内置（agentHint 生成视角提示）或自定义（前端传 agentPrompt）
  const effectiveAgentId = agentId ?? project.agent
  let hintText = ''
  if (effectiveAgentId?.startsWith('custom:')) {
    const customName = effectiveAgentId.replace('custom:', '')
    if (typeof agentPrompt === 'string' && agentPrompt.trim()) {
      hintText = `\n\n用户指定自定义 agent「${customName}」作为本项目主导视角：${agentPrompt.trim()}请在各阶段输出中优先体现该视角。`
    }
  } else if (effectiveAgentId) {
    hintText = agentHint(effectiveAgentId)
  }
  // 技能注入：内置 TDD（GitHub 注入）+ 用户自定义 skill + MCP 说明
  const skillText =
    BUILT_IN_SKILLS.map((s) => s.injection).join('\n') +
    customSkillsInjection((skills ?? []) as CustomSkill[]) +
    mcpInjection((mcps ?? []) as McpConfig[])
  const fileCtx = [
    typeof fileContext === 'string' ? fileContext : undefined,
    Array.isArray(linkContext) ? await fetchLinkContext(linkContext) : undefined,
  ]
    .filter(Boolean)
    .join('\n\n') || undefined

  await db.project.update({
    where: { id: projectId },
    data: { model: modelId, ...(agentId ? { agent: agentId } : {}) },
  })

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
            agentHintText: hintText,
            fileContext: fileCtx,
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

  // 增量修改检测：已有完整生成，且最新一条 user 消息晚于最后一次生成活动
  // → 本轮 continue 为"修改需求"，工程师进入 diff 式增量模式（不再跳过编码）
  const lastUserAt = [...messages].reverse().find((m) => m.role === 'user')?.createdAt
  const lastGenAt = [...messages]
    .reverse()
    .find((m) => m.step === 'engineering' || m.step === 'validation' || m.step === 'fix')?.createdAt
  const isModification = Boolean(
    completed.engineering && lastUserAt && lastGenAt && new Date(lastUserAt) > new Date(lastGenAt)
  )
  if (isModification) {
    completed.engineering = false // 修改轮必须重新进入编码（增量模式）
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
            agentHintText: hintText,
            fileContext: fileCtx,
            skillsInjection: skillText,
            incremental: isModification,
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

// 链接参考：抓取网页正文（去标签），注入分析上下文（尽力而为，最多 3 条）
async function fetchLinkContext(urls: string[]): Promise<string | undefined> {
  const parts: string[] = []
  for (const url of urls.slice(0, 3)) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'jlcoding/1.0' },
        redirect: 'follow',
      })
      if (!res.ok) {
        parts.push(`【参考链接：${url}】抓取失败（HTTP ${res.status}），仅记录链接供参考`)
        continue
      }
      const html = await res.text()
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      parts.push(`【参考链接：${url}】\n${text.slice(0, 4000)}`)
    } catch {
      parts.push(`【参考链接：${url}】抓取失败（超时或不可达），仅记录链接供参考`)
    }
  }
  return parts.length ? parts.join('\n\n') : undefined
}
