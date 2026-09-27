import { db } from '@/lib/db'
import { Sandbox } from '@/lib/sandbox'
import { runAnalyze, runContinue, runChatReply, resolveIntent, PausedError, hasModel, type CompletedStages } from '@/lib/agent'
import { languageOf } from '@/lib/utils'
import { DEFAULT_MODEL, isValidModel } from '@/lib/models'
import { agentHint } from '@/lib/agents'
import { BUILT_IN_SKILLS, customSkillsInjection, mcpInjection, type CustomSkill, type McpConfig } from '@/lib/skills'
import { requireProjectAccess } from '@/lib/access'
import { markRunning, unmarkRunning, isRunning } from '@/lib/run-registry'
import { createVersionSnapshot, sha8, diffSnapshots, parseRollbackTarget, parseDiffPair, rollbackToVersion, formatVersionBrief } from '@/lib/versions'
import { isValidByok } from '@/lib/byok'
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
  const { message, model, phase, agentId, agentPrompt, skills, mcps, fileContext, linkContext, byok } = await req.json()
  const projectId = params.id

  // 权限边界：与详情/文件/ZIP 接口共用同一套访问控制（503/404/401/403）
  const access = await requireProjectAccess(req, projectId)
  if (!access.ok) return access.response
  const project = access.project

  // 并发防护：同项目重复发起生成直接拒绝，避免两条管线交错写文件
  if (isRunning(projectId)) {
    return new Response(JSON.stringify({ error: '该项目正在生成中，请等待完成或先暂停' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    })
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

  // 编程语言决策：用户指定（Python）> 需求关键词 > 项目既有文件推断 > 默认 React。
  // 默认 React 的取舍（据真实用户实测反馈调整）：计算器/待办等 GUI 需求，用户预期「直接看到画面并线上使用」
  // ——React 可浏览器实时预览 + 一键部署 /app/:id；Python 桌面应用两者皆不可，仅在用户明确说 Python 时生成。
  const text = `${typeof message === 'string' ? message : ''}`
  const existingPaths = (await db.file.findMany({ where: { projectId }, select: { path: true } })).map((f) => f.path)
  let language: 'react' | 'python'
  if (/python|tkinter|py脚本|\.py/i.test(text)) language = 'python'
  else if (/react|jsx|javascript|type ?script|网页|网站|web|h5|前端|组件|浏览器/i.test(text)) language = 'react'
  else if (existingPaths.some((p) => p.endsWith('.py')) && !existingPaths.some((p) => /^(package\.json|App\.(js|jsx)|index\.js)$/.test(p))) language = 'python'
  else language = 'react' // 平台默认：可预览、可一键线上使用

  // BYOK：用户自有 API Key（OpenAI 兼容端点）。仅当次请求内存使用——不落库、不打日志（key 绝不外泄）
  const userByok = isValidByok(byok) ? byok : undefined

  // 生成路径记录级区分：BYOK（byok:<model>）/ 真实模型（opencode:<modelId>）/ Mock 演示（mock）。
  // 呈现交给前端「模型调用」卡片与版本历史（不在对话流直白插消息）
  const provider = userByok
    ? `byok:${userByok.model}`
    : hasModel()
      ? `opencode:${modelId}`
      : 'mock'
  const runId = `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
  const runModel = userByok ? userByok.model : modelId
  console.log(`[jlcoding] run ${projectId} phase=${phase ?? 'continue'} provider=${provider} runId=${runId}`)

  await db.project.update({
    where: { id: projectId },
    data: { model: modelId, provider, ...(agentId ? { agent: agentId } : {}) },
  })

  // ---------- 阶段 1：需求分析（产出理解，等待用户确认/追加） ----------
  if (phase === 'analyze') {
    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: '消息不能为空' }), { status: 400 })
    }
    // 重试防双写：10 分钟内已有相同内容的用户消息（上次失败后的重试）不再重复落库
    const [lastUser] = await db.message.findMany({
      where: { projectId, role: 'user' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })
    const isRetryOfFailed = Boolean(
      lastUser && lastUser.content === message.trim() && Date.now() - lastUser.createdAt.getTime() < 10 * 60_000
    )
    if (!isRetryOfFailed) {
      await db.message.create({
        data: { projectId, role: 'user', content: message.trim() },
      })
    }
    // 追加场景：合并该项目全部 user 消息作为完整需求
    const userMessages = await db.message.findMany({
      where: { projectId, role: 'user' },
      orderBy: { createdAt: 'asc' },
    })
    const fullRequirement = userMessages.map((m) => m.content).join('\n【追加】')
    const latestUserText = message.trim()

    // QA 上下文：最近对话（不含最后一条本次提问，避免重复）+ 项目简报由 QA 分支组装
    const recentForChat = await db.message.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 12,
    })
    const chatHistory = recentForChat
      .reverse()
      .filter((m) => (m.role === 'user' || (m.role === 'assistant' && m.step !== 'analysis')) && m.content !== latestUserText)
      .map((m) => ({ role: m.role, agent: m.agent, content: m.content }))

    const sandbox = new Sandbox()
    const encoder = new TextEncoder()
    // 暂停/停止支持：QA 直答与需求分析同享中止信号（客户端断开 → cancel() → abort）
    const abortController = new AbortController()
    markRunning(projectId)
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false
        const send = (event: ServerEvent) => {
          if (closed) return
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)) } catch { closed = true }
        }
        let pipelineStarted = false
        try {
          // 意图识别（规则零延迟优先；未命中 LLM 兜底）：
          // CODE → 现有构建管线；QA/VERSION → 回复型任务，不进构建状态机、不需要需求确认
          const intent = await resolveIntent({ model: modelId, sessionId: projectId, byok: userByok }, message.trim())
          console.log(`[jlcoding] intent=${intent}（${latestUserText.slice(0, 30)}…）`)

          // ---------- QA：智能助手直答（web_search / read_url / read_file 工具） ----------
          if (intent === 'qa') {
            send({ type: 'run_started', provider, model: runModel, runId, intent: 'chat' })
            send({ type: 'agent_start', agent: '智能助手', message: '正在思考' })
            const files = await db.file.findMany({ where: { projectId }, select: { path: true, content: true } })
            const versions = await db.projectVersion.findMany({
              where: { projectId }, orderBy: { version: 'desc' }, take: 8,
              select: { version: true, summary: true },
            })
            const projectBrief = `项目「${project.name}」当前状态：${project.status}；文件（${files.length} 个）：${files.map((f) => f.path).join(', ') || '（暂无）'}；版本历史：${versions.map((v) => `v${v.version}（${v.summary}）`).join('；') || '（无）'}`
            const reply = await runChatReply({
              userInput: message.trim(),
              onEvent: send,
              model: modelId,
              sessionId: projectId,
              byok: userByok,
              abortSignal: abortController.signal,
              chat: {
                history: chatHistory,
                projectBrief,
                files: files.map((f) => ({ path: f.path, content: f.content })),
              },
            })
            await db.message.create({
              data: { projectId, role: 'assistant', content: reply, agent: '智能助手', step: 'chat' },
            })
            send({ type: 'agent_complete', agent: '智能助手', result: reply })
            send({ type: 'complete', projectId, intent: 'chat' })
            return
          }

          // ---------- VERSION：版本模块（确定性，不经 LLM 循环；对比/回滚/列表） ----------
          if (intent === 'version_list' || intent === 'version_diff' || intent === 'version_rollback') {
            send({ type: 'agent_start', agent: '版本助手', message: '正在读取版本历史' })
            const versions = await db.projectVersion.findMany({
              where: { projectId }, orderBy: { version: 'desc' },
              select: { version: true, sha: true, summary: true, provider: true, createdAt: true, filesJson: true },
            })
            const latest = versions[0]?.version ?? 0
            let replyText = ''

            if (intent === 'version_list' || latest === 0) {
              replyText = latest === 0
                ? '当前项目还没有版本记录——完成一次生成后会自动创建 v1 快照（append-only）。'
                : `共 ${latest} 个版本（append-only，最新在前）：\n${versions.map((v) => formatVersionBrief(v)).join('\n')}\n\n可以说「对比 v1 和 v2」查看差异，或「回滚到 v1」恢复历史版本。`
            } else if (intent === 'version_rollback') {
              const target = parseRollbackTarget(message.trim(), latest)
              if (!target) {
                replyText = `没找到明确的回滚目标：当前共 ${latest} 个版本（v1…v${latest}）。可以说「回滚到 v2」或「恢复到上一版」。`
              } else {
                const rb = await rollbackToVersion({ projectId, targetVersion: target, provider })
                if (!rb.ok) {
                  replyText = `回滚失败：${rb.error}`
                } else {
                  send({ type: 'version_created', version: rb.nextVersion, sha: rb.sha, summary: `回滚自 v${target}` })
                  console.log(`[jlcoding] 对话触发回滚 v${target} → v${rb.nextVersion}`)
                  replyText = `已回滚到 v${target}（文件集哈希精确还原，SHA-256 前 8 位 ${rb.sha.slice(0, 8)}），并按 append-only 语义产生新版本 v${rb.nextVersion}（历史不丢，可再次回滚）。\n\n预览已同步更新为 v${target} 的内容，可继续查看、修改或部署。`
                }
              }
            } else {
              // version_diff：两版本快照的结构化对比（确定性，零 token 零幻觉）
              const pair = parseDiffPair(message.trim(), latest)
              const from = pair ? versions.find((v) => v.version === pair[0]) : undefined
              const to = pair ? versions.find((v) => v.version === pair[1]) : undefined
              if (!from || !to) {
                replyText = latest < 2
                  ? '当前只有 1 个版本，暂无可对比的历史——完成一次修改后会生成 v2，届时可说「上一版哪里变了」。'
                  : `没找到可对比的版本：当前共 ${latest} 个版本。可以说「对比 v1 和 v2」或「上一版哪里变了」。`
              } else {
                let diff: ReturnType<typeof diffSnapshots>
                try {
                  diff = diffSnapshots(JSON.parse(from.filesJson), JSON.parse(to.filesJson))
                } catch {
                  replyText = '版本快照数据损坏，无法对比。'
                  diff = null as unknown as ReturnType<typeof diffSnapshots>
                }
                if (diff) {
                  const lines = [
                    `版本对比：v${from.version} → v${to.version}（${from.summary} → ${to.summary}）`,
                    diff.added.length ? `新增文件（${diff.added.length}）：${diff.added.join('、')}` : null,
                    diff.removed.length ? `删除文件（${diff.removed.length}）：${diff.removed.join('、')}` : null,
                    diff.changed.length
                      ? `内容变更（${diff.changed.length} 个文件）：\n${diff.changed.map((c) => `  · ${c.path}（${c.delta >= 0 ? '+' : ''}${c.delta} 字符）`).join('\n')}`
                      : null,
                    `未变化：${diff.unchangedCount} 个文件（内容级哈希一致）`,
                    `文件集 SHA：${from.sha.slice(0, 8)} → ${to.sha.slice(0, 8)}`,
                  ].filter(Boolean)
                  replyText = lines.join('\n')
                }
              }
            }

            await db.message.create({
              data: { projectId, role: 'assistant', content: replyText, agent: '版本助手', step: 'version' },
            })
            send({ type: 'agent_complete', agent: '版本助手', result: replyText })
            send({ type: 'complete', projectId, intent: 'version' })
            return
          }

          // ---------- CODE：现有构建管线（分析 → 确认 → 生成） ----------
          pipelineStarted = true
          send({ type: 'run_started', provider, model: runModel, runId, intent: 'code' })
          send({ type: 'agent_start', agent: '业务分析师', message: '正在分析需求' })
          send({ type: 'task_progress', step: 1, total: 5, label: '分析需求' })
          await db.project.update({ where: { id: projectId }, data: { status: 'building', runStartedAt: new Date() } })

          const analysis = await runAnalyze({
            userInput: fullRequirement,
            sandbox,
            sessionId: projectId,
            model: modelId,
            byok: userByok,
            abortSignal: abortController.signal,
            agentHintText: hintText + `\n\n实现语言决策：本次将使用 ${language === 'python' ? 'Python（tkinter 单文件，用户明确指定）' : 'React（浏览器可实时预览、生成后可一键线上使用）'}。请在功能清单中写明将采用的语言。`,
            fileContext: fileCtx,
            language,
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
            // 中止：CODE 管线落库 paused（断点保留）；回复型任务（QA/VERSION）不改项目状态
            if (pipelineStarted) {
              await db.project.update({ where: { id: projectId }, data: { status: 'paused' } }).catch(() => {})
            }
            send({ type: 'paused' })
          } else if (!pipelineStarted) {
            // 回复型任务（QA/VERSION）失败：仅报错，不改变项目构建状态
            console.error('[jlcoding] 回复任务失败:', error instanceof Error ? error.message : error)
            send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
          } else {
            console.error('[jlcoding] 分析阶段失败:', error instanceof Error ? error.message : error)
            send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
            await db.project.update({ where: { id: projectId }, data: { status: 'error' } })
          }
        } finally {
          unmarkRunning(projectId)
          closed = true
          controller.close()
        }
      },
      // 客户端断开（面板内暂停按钮）：中止需求分析 / QA 直答（回复型任务不改项目状态）
      async cancel() {
        abortController.abort()
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
  markRunning(projectId)
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
        send({ type: 'run_started', provider, model: runModel, runId })
        await db.project.update({ where: { id: projectId }, data: { status: 'building', runStartedAt: new Date() } })
        await runContinue(
          {
            userInput: fullRequirement,
            priorAnalysis,
            existingFiles,
            sandbox,
            sessionId: projectId,
            model: modelId,
            byok: userByok,
            abortSignal: abortController.signal,
            agentHintText: hintText,
            fileContext: fileCtx,
            skillsInjection: skillText,
            incremental: isModification,
            language,
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

        await db.project.update({ where: { id: projectId }, data: { status: 'ready' } })

        // 版本快照（append-only）：初始化生成 / 增量修改 各记一条；provider 随版本留存（评审可追溯每次生成走的路径）
        const latestUser = userMessages[userMessages.length - 1]?.content ?? ''
        const summary = isModification
          ? `增量修改：${latestUser.slice(0, 40)}`
          : `初始化生成（${sandbox.list().length} 个文件）`
        let versionEvent: Extract<ServerEvent, { type: 'version_created' }> | null = null
        try {
          const snapshot = await createVersionSnapshot({
            projectId,
            files: sandbox.list(),
            provider,
            summary,
          })
          versionEvent = { type: 'version_created', version: snapshot.version, sha: snapshot.sha, summary }
          console.log(`[jlcoding] version snapshot v${snapshot.version} sha=${sha8(snapshot.sha)} files=${sandbox.list().length}`)
        } catch (e) {
          console.error('[jlcoding] 版本快照失败（不影响生成结果）:', e instanceof Error ? e.message : e)
        }

        send({ type: 'task_progress', step: 5, total: 5, label: '预览就绪' })
        send({ type: 'preview_ready' })
        send({ type: 'complete', projectId })
        if (versionEvent) send(versionEvent)
      } catch (error) {
        if (error instanceof PausedError || abortController.signal.aborted) {
          await db.project.update({ where: { id: projectId }, data: { status: 'paused' } }).catch(() => {})
          send({ type: 'paused' })
        } else {
          console.error('[jlcoding] 生成阶段失败:', error instanceof Error ? error.message : error)
          send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
          await db.project.update({ where: { id: projectId }, data: { status: 'error' } })
        }
      } finally {
        clearInterval(heartbeat)
        unmarkRunning(projectId)
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
