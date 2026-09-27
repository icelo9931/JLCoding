import { ToolLoopAgent, tool, isStepCount, type ToolSet } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { z } from 'zod'
import { Sandbox } from './sandbox'
import { webSearch, readUrlText } from './web-tools'
import { ruleIntent, type Intent } from './intent-rules'
import type { ServerEvent } from './types'
import { DEFAULT_MODEL, isValidModel, CLASSIFY_MODEL, CHAT_MODEL, modelEndpoint } from './models'

export interface RunContext {
  userInput: string
  sandbox: Sandbox
  onEvent: (event: ServerEvent) => void
  model?: string
  sessionId?: string // OpenCode Go 网关要求的稳定会话 ID（x-opencode-session）
  abortSignal?: AbortSignal // 暂停：中止信号
  agentHintText?: string // 主导 agent 视角提示
  fileContext?: string // 用户上传文件内容
  skillsInjection?: string // 技能注入（内置 + 自定义 + MCP 说明）
  incremental?: boolean // 增量修改模式：在现有应用上按 diff 式只改需要改的文件
  language?: 'react' | 'python' // 生成语言：用户指定或按需求检测，默认 react（可预览、可线上使用）
  byok?: ByokConfig // BYOK：用户自己的 API Key（OpenAI 兼容端点，仅当次请求使用，不落库）
}

// 用户自有 API Key（Bring Your Own Key）：OpenAI 兼容网关
export interface ByokConfig {
  baseUrl: string
  apiKey: string
  model: string
}

// 断点恢复：已完成阶段由调用方（路由层从 Message.step 读取）传入
export interface CompletedStages {
  analysis: boolean
  design: boolean
  engineering: boolean
}

export class PausedError extends Error {
  constructor() {
    super('PAUSED')
    this.name = 'PausedError'
  }
}

// 超时保护（空闲看门狗 + 管线总闸）：
// - 看门狗：IDLE_TIMEOUT_MS 内无任何流式输出 → 判定死连接（网络中断/模型挂起）→ 中止并报错；
//   每收到一个流式分片即重置计时器 —— 健康的长生成（大应用逐 token 写入 300s+）永不误伤。
// - 管线总闸：PIPELINE_DEADLINE_MS 为整条管线（设计→编码→校验→修复）的时间上限，
//   超时 → error 事件 → status=error 落库，已完成阶段保留可断点续跑。
const IDLE_TIMEOUT_MS = 120_000
// 实测慢网络下大应用（阴阳历）单工程师阶段可达 ~480s，600s 预算会切断修复轮 → 放宽到 900s；
// 超时后已完成阶段保留（DB 落库），用户点「继续生成」从断点续跑，不丢工作
const PIPELINE_DEADLINE_MS = 900_000

interface RunGuard {
  signal: AbortSignal
  bump: (chunk?: unknown) => void
  stop: () => void
  classify: (e: unknown) => Error
}

// 创建流式运行守卫：用户暂停信号 + 空闲看门狗 +（可选）管线截止信号三合一，触发后可区分归类
function createRunGuard(userSignal?: AbortSignal, deadlineAt?: number): RunGuard {
  const controller = new AbortController()
  let idle = false
  let timedOut = false
  const fireIdle = () => { idle = true; controller.abort() }
  let idleTimer = setTimeout(fireIdle, IDLE_TIMEOUT_MS)
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null
  if (deadlineAt !== undefined) {
    deadlineTimer = setTimeout(() => { timedOut = true; controller.abort() }, Math.max(0, deadlineAt - Date.now()))
  }
  const signals: AbortSignal[] = [controller.signal]
  if (userSignal) signals.push(userSignal)
  return {
    signal: AbortSignal.any(signals),
    bump: (chunk?: unknown) => {
      void chunk // 分片到达本身即视为活跃连接（chunk 内容无需使用）
      if (controller.signal.aborted) return
      clearTimeout(idleTimer)
      idleTimer = setTimeout(fireIdle, IDLE_TIMEOUT_MS)
    },
    stop: () => { clearTimeout(idleTimer); if (deadlineTimer) clearTimeout(deadlineTimer) },
    classify: (e: unknown): Error => {
      if (userSignal?.aborted) return new PausedError()
      if (idle) {
        return new Error(`模型连接空闲超时（${IDLE_TIMEOUT_MS / 1000} 秒无任何输出），已完成阶段已保存，可重试或继续生成`)
      }
      if (timedOut) {
        return new Error(`生成超时（整条管线 ${PIPELINE_DEADLINE_MS / 1000} 秒上限），已完成阶段已保存，可点击继续生成从断点续跑`)
      }
      return e instanceof Error ? e : new Error(String(e))
    },
  }
}

const CODE_CONSTRAINTS = `
技术约束（必须严格遵守，否则预览无法渲染）：
- 生成纯前端 React 应用，只依赖 react 和 react-dom，禁止引入任何其他第三方库（无 axios / lodash / antd 等）。
- 所有文件放在项目根目录，使用 JavaScript + JSX，不使用 TypeScript。
- 必须创建以下文件：
  1. package.json — {"name":"app","dependencies":{"react":"^18.2.0","react-dom":"^18.2.0"}}
  2. index.js — 入口，使用 react-dom/client 的 createRoot 渲染 App 组件
  3. App.js — 根组件
  4. styles.css — 全局样式（在 index.js 或 App.js 中 import './styles.css'）
- 可以按需创建更多组件文件（如 TodoItem.js），从 './文件名' 导入。
- 所有交互状态用 React hooks 管理，确保应用可直接运行且无控制台报错。
- 【变量纪律】需要累加/累减/重新赋值的变量一律用 let 声明；const 声明的变量绝对禁止重新赋值（含 +=、-=、++、--），否则编译直接失败。`

// Python 管线约束（默认语言）：标准库优先、单文件 tkinter GUI
const PYTHON_CONSTRAINTS = `
技术约束（Python 应用，必须严格遵守）：
- 默认生成单文件 main.py（tkinter 图形界面，只用 Python 标准库：tkinter / datetime / json / math / calendar 等，禁止第三方依赖如 pygame / pandas / numpy——用户本机无环境装包）。
- 若需求明显是纯计算/脚本类（无界面诉求），生成命令行脚本 main.py（input/print 交互）。
- 结构要求：函数封装逻辑、入口统一为 if __name__ == '__main__':、顶部 docstring 说明用法、关键逻辑写中文注释。
- 界面要求（tkinter）：合理布局（grid/pack）、标题与提示文案清晰、按钮/输入框可用，窗口尺寸适配内容。
- 【变量纪律】需要重新赋值的变量不要命名为全大写常量风格；逻辑函数化，避免超长过程式代码。`

const ROLE_PROMPTS: string[] = [
  `你是资深业务分析师。分析用户需求，输出：
1. 应用名称与一句话定位
2. 功能清单（按优先级排列，每项一句话说明）
3. 3 个核心用户故事（作为…我想要…以便…格式）
输出精炼的中文要点，不要 JSON，不要寒暄。分析完成后直接输出结果，不要调用任何工具。`,

  `你是资深前端架构设计师。基于上文业务分析师的功能清单，设计技术方案，输出（控制在 30 行以内，精炼）：
1. 组件树（缩进文本，只列核心组件，不要过度拆分——总组件数尽量 ≤ 6 个）
2. 每个组件的职责与关键 state（一句话）
3. 文件清单（path → 用途，文件总数尽量 ≤ 6 个）
不要输出数据结构定义细节和长篇说明。设计完成后直接输出结果，不要调用任何工具。`,

  `你是资深代码工程师。严格按架构设计师的文件清单，使用 writeFile 工具创建完整可运行的代码文件。
${CODE_CONSTRAINTS}

性能要求（重要）：
- 在同一次回复中并行调用多个 writeFile，一次性把全部文件写完，不要一个文件一轮对话。
- 每个文件一次写入完整内容（包含全部 import/export），代码精炼不过度设计。
- 农历/历法等算法数据尽量用简化的紧凑表或内置算法，避免超长数据表。
- 全部写完后用一句话总结，不要调用其他工具。`,

  `你是测试工程师。使用 runCommand 工具运行 "npm run build" 校验代码。若校验失败，明确指出所有错误。
然后输出一行校验结论。除 runCommand 外不要调用其他工具。`,

  `你是修复工程师。根据测试工程师报告的错误，使用 writeFile 工具只修复出错的文件（不要重写整个项目），然后使用 runCommand 工具再次运行 "npm run build" 确认修复。
修复完成后用一句话说明修复内容。`,
]

// 增量修改模式的工程师 prompt（diff 式最小改动，按语言取约束）
function modifyEngineerPrompt(language: 'react' | 'python'): string {
  const constraints = language === 'python' ? PYTHON_CONSTRAINTS : CODE_CONSTRAINTS
  return `你是资深代码工程师，正在对现有可运行的应用做增量修改。
${constraints}

性能要求（重要）：
- 优先用 readFile 理解现状，只对需要改动的文件调用 writeFile，一次写入完整内容；
- 与修改无关的文件一律不动；改动面最小化，保持现有风格；
- 若修改涉及新功能，可新增组件/模块文件并从现有文件正确导入；
- 完成后用一句话总结改了哪些文件、为什么。不要调用其他工具。`
}

const ROLE_NAMES = ['业务分析师', '架构设计师', '代码工程师', '测试工程师', '修复工程师']

export function hasModel(): boolean {
  // JLCODING_MOCK=1：显式演示模式开关（本地复现「无 Key」行为——PowerShell 空字符串 env 等于删除变量，
  // 无法用 OPENCODE_API_KEY='' 覆盖 .env，故提供显式开关）
  if (process.env.JLCODING_MOCK === '1') return false
  return Boolean(process.env.OPENCODE_API_KEY)
}

function getModel(modelId?: string, sessionId?: string, byok?: ByokConfig) {
  // BYOK：用户自有 API Key 的 OpenAI 兼容端点（仅当次请求使用，不落库、不打日志）
  if (byok) {
    const own = createOpenAICompatible({
      name: 'byok',
      baseURL: byok.baseUrl,
      apiKey: byok.apiKey,
      headers: { 'User-Agent': 'jlcoding/1.0' },
    })
    return own(byok.model)
  }
  // 按模型所属池选择端点（实测差异：v4.1-flash/glm-5.3 走 zen/v1；v4-pro 走 go 池，
  // 在 zen/v1 会 404——真实踩坑致「业务分析师 No output generated」）
  const id = isValidModel(modelId) ? modelId! : DEFAULT_MODEL
  const endpoint = modelEndpoint(id)
  const baseURL = endpoint === 'go'
    ? (process.env.OPENCODE_GO_BASE_URL || 'https://opencode.ai/zen/go/v1')
    : (process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/v1')
  const opencode = createOpenAICompatible({
    name: 'opencode',
    baseURL,
    apiKey: process.env.OPENCODE_API_KEY,
    headers: {
      'User-Agent': 'jlcoding/1.0',
      ...(sessionId ? { 'x-opencode-session': sessionId } : {}),
    },
  })
  return opencode(id)
}

// 流内错误转明确文案：把 AI SDK 吞掉的 error part（404/429/403）还原成可操作提示，
// 而不是模糊的「No output generated. Check the stream for errors.」
function describeStreamError(e: unknown, modelId?: string): string {
  const msg = e instanceof Error ? e.message : String(e)
  const status = (e as { statusCode?: number })?.statusCode
    ?? (e as { data?: { statusCode?: number } })?.data?.statusCode
    ?? (e as { cause?: { statusCode?: number } })?.cause?.statusCode
  if (status === 404) return `模型「${modelId ?? '默认'}」在当前端点不可用（404）——请在模型下拉切换其他模型`
  if (status === 429) {
    return /GoUsageLimit/i.test(msg)
      ? 'OpenCode Go 额度已用尽（429）——可切换 GLM 5.3 / DeepSeek V4 Flash，或在模型下拉配置 BYOK 自有 Key'
      : '请求频率受限（429）——请稍后重试'
  }
  if (status === 403) return `模型不可用（403）：${msg.slice(0, 140)}（免费层模型不支持外部 API 调用，请改选付费模型或 BYOK）`
  return msg
}

// ---------- 阶段 1：业务分析师（独立运行，产出需求理解，等待用户确认） ----------

// 纯文本角色：单轮生成，逐 token 流式输出（模块级，两个阶段共用）
// 迭代 fullStream：既取 text-delta 流式推送，也捕获 error part（不再吞成「No output generated」）；
// 空文本无错误时自动重试一次（网络瞬断兜底）
async function askSingle(
  c: RunContext, roleName: string, instructions: string, prompt: string, deadlineAt?: number
): Promise<string> {
  const started = Date.now()
  const modelId = c.byok ? `byok:${c.byok.model}` : (c.model ?? DEFAULT_MODEL)
  const agent = new ToolLoopAgent({
    model: getModel(c.model, c.sessionId, c.byok),
    instructions,
    stopWhen: isStepCount(1),
  })
  const guard = createRunGuard(c.abortSignal, deadlineAt)
  let lastStreamError: unknown = null
  try {
    let text = ''
    for (let attempt = 1; attempt <= 2; attempt++) {
      let streamError: unknown = null
      let gotText = false
      const result = await agent.stream({ prompt, abortSignal: guard.signal })
      for await (const part of result.fullStream) {
        guard.bump(part)
        if (part.type === 'text-delta') {
          gotText = true
          c.onEvent({ type: 'agent_delta', agent: roleName, delta: part.text })
        } else if (part.type === 'error') {
          streamError = (part as { error?: unknown }).error
        }
      }
      lastStreamError = streamError
      if (streamError) {
        // 流内错误 → 直接还原明确文案（确定性错误不重试）
        throw new Error(describeStreamError(streamError, modelId))
      }
      text = ((await result.text) ?? '').trim()
      emitUsage(c, roleName, result)
      if (text) break
      if (gotText) break // 有输出但被 trim 为空（极罕见），不重试
      if (attempt === 1) console.log(`[jlcoding] ${roleName} 空输出，重试一次（可能是瞬断）`)
    }
    if (!text) throw new Error(`模型「${modelId}」未返回任何输出（已重试一次）——请切换模型或稍后再试`)
    console.log(`[jlcoding] ${roleName} 完成，耗时 ${((Date.now() - started) / 1000).toFixed(1)}s model=${modelId}`)
    return text
  } catch (e) {
    if (e instanceof PausedError) throw e
    if (lastStreamError && /No output generated/i.test(e instanceof Error ? e.message : '')) {
      throw new Error(describeStreamError(lastStreamError, modelId))
    }
    throw guard.classify(e)
  } finally {
    guard.stop()
  }
}

// usage 采集：token 消耗随事件推送前端（生成管线与 QA 直答共用）
async function emitUsage(c: { onEvent: (event: ServerEvent) => void }, roleName: string, result: { usage: PromiseLike<{ inputTokens?: number; outputTokens?: number }> }) {
  try {
    const usage = await result.usage
    if (usage && (usage.inputTokens || usage.outputTokens)) {
      c.onEvent({ type: 'usage', agent: roleName, inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 })
    }
  } catch { /* usage 不可用时忽略 */ }
}

// ---------- writeFile 参数流实时解码 ----------

// 计算流式 JSON 字符串中"已确定安全"的长度（截掉尾部不完整转义：奇数个反斜杠、不完整的 \uXXXX）
function safeJsonPrefixLen(raw: string): number {
  let len = raw.length
  // 尾部奇数个连续反斜杠 → 最后一个转义不完整
  let backslashes = 0
  for (let i = len - 1; i >= 0 && raw[i] === '\\'; i--) backslashes++
  if (backslashes % 2 === 1) len -= 1
  // 不完整的 \uXXXX
  const um = raw.slice(0, len).match(/\\u[0-9a-fA-F]{0,3}$/)
  if (um) len -= um[0].length
  return len
}

// JSON 字符串片段反转义（\\n → 换行等）
function unescapeJson(s: string): string {
  try {
    return JSON.parse(`"${s}"`)
  } catch {
    return s
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
  }
}

export async function runAnalyze(ctx: RunContext): Promise<string> {
  // mock 兜底：平台无 Key 且用户未提供 BYOK 时走预置演示数据
  if (!hasModel() && !ctx.byok) return runMockAnalyze(ctx)
  const instructions = `${ROLE_PROMPTS[0]}${ctx.agentHintText ?? ''}${formatFileContext(ctx.fileContext)}`
  const analysis = await askSingle(ctx, ROLE_NAMES[0], instructions, `用户需求：${ctx.userInput}`)
  return analysis
}

function formatFileContext(fileContext?: string): string {
  if (!fileContext) return ''
  return `\n\n用户上传的参考文件内容（数据分析 agent 视角，提炼其中事实供后续阶段使用）：\n${fileContext.slice(0, 6000)}`
}

// ---------- 阶段 2：设计 → 编码 → 校验 → 修复（支持断点跳过与暂停） ----------

export async function runContinue(
  ctx: RunContext & { priorAnalysis: string; existingFiles?: { path: string; content: string }[] },
  completed: CompletedStages
): Promise<void> {
  // mock 兜底：平台无 Key 且用户未提供 BYOK 时走预置演示数据
  if (!hasModel() && !ctx.byok) {
    await runMockContinue(ctx, completed)
    return
  }
  const { userInput, sandbox, onEvent, model, sessionId, abortSignal, byok } = ctx
  const deadline = Date.now() + PIPELINE_DEADLINE_MS
  const checkPaused = () => {
    if (abortSignal?.aborted) throw new PausedError()
    if (Date.now() > deadline) {
      throw new Error(`生成超时（整条管线 ${PIPELINE_DEADLINE_MS / 1000} 秒上限），已完成阶段已保存，可点击继续生成从断点续跑`)
    }
  }

  let lastValidation: { exitCode: number; stderr: string } = { exitCode: 0, stderr: '' }
  let validationRan = false

  const tools: ToolSet = {
    writeFile: tool({
      description: '将完整代码文件写入沙箱文件系统',
      inputSchema: z.object({
        path: z.string().describe('文件路径，如 App.js'),
        content: z.string().describe('完整文件内容'),
      }),
      execute: async ({ path, content }) => {
        if (abortSignal?.aborted) throw new PausedError()
        const isNew = sandbox.read(path) === null
        sandbox.write(path, content)
        onEvent({ type: isNew ? 'file_created' : 'file_updated', path, content })
        return { success: true, path }
      },
    }),
    runCommand: tool({
      description: '在沙箱中执行 shell 命令，如 npm run build',
      inputSchema: z.object({ command: z.string() }),
      execute: async ({ command }) => {
        if (abortSignal?.aborted) throw new PausedError()
        const result = await sandbox.run(command)
        if (command.includes('build') || command.includes('test')) {
          lastValidation = { exitCode: result.exitCode, stderr: result.stderr }
          validationRan = true
        }
        onEvent({ type: 'command_run', command, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode })
        return result
      },
    }),
    readFile: tool({
      description: '读取沙箱中的文件内容',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        const content = sandbox.read(path)
        return content === null ? { error: `文件不存在: ${path}` } : { path, content }
      },
    }),
  }

  // 工具角色：ToolLoopAgent 工具循环，prepareStep 注入角色指令与工具白名单；文本逐 token 流式
  const runToolLoop = async (
    roleName: string, instructions: string, prompt: string, activeTools: string[], maxSteps: number
  ): Promise<string> => {
    const started = Date.now()
    const agent = new ToolLoopAgent({
      model: getModel(model, sessionId, byok),
      tools,
      stopWhen: isStepCount(maxSteps),
      prepareStep: () => ({ instructions, activeTools }),
    })
    const guard = createRunGuard(abortSignal, deadline)
    let streamError: unknown = null // 提到 try 外：`await result.text` 会先抛「No output generated」，需在 catch 里转明确文案
    try {
      const result = await agent.stream({ prompt, abortSignal: guard.signal })
      // 关键体验：writeFile 的文件内容在工具参数流中逐 token 生成，
      // 实时解码为代码文本推送（否则大文件生成期间界面数分钟无输出）
      const writers = new Map<string, { buf: string; emitted: number; header: string | null }>()
      for await (const part of result.fullStream) {
        guard.bump(part)
        if (part.type === 'text-delta') {
          onEvent({ type: 'agent_delta', agent: roleName, delta: part.text })
        } else if (part.type === 'error') {
          streamError = (part as { error?: unknown }).error
        } else if (part.type === 'tool-input-start' && part.toolName === 'writeFile') {
          writers.set(part.id, { buf: '', emitted: 0, header: null })
        } else if (part.type === 'tool-input-delta' && writers.has(part.id)) {
          const w = writers.get(part.id)!
          w.buf += part.delta
          // 文件头：首次提取到完整 path 时宣告"正在写入 X"
          if (!w.header) {
            const pm = w.buf.match(/"path"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,/)
            if (pm) {
              w.header = unescapeJson(pm[1])
              onEvent({ type: 'agent_delta', agent: roleName, delta: `\n\n【正在写入 ${w.header}】\n` })
            }
          }
          // content 字段：推送"已确定安全部分"的新增文本
          const cm = w.buf.match(/"content"\s*:\s*"/)
          if (cm && cm.index !== undefined) {
            const raw = w.buf.slice(cm.index + cm[0].length)
            const safeLen = safeJsonPrefixLen(raw)
            if (safeLen > w.emitted) {
              const chunk = unescapeJson(raw.slice(w.emitted, safeLen))
              if (chunk) {
                w.emitted = safeLen
                onEvent({ type: 'agent_delta', agent: roleName, delta: chunk })
              }
            }
          }
        } else if (part.type === 'tool-input-end') {
          writers.delete(part.id)
        }
      }
      const text = ((await result.text) ?? '').trim()
      const steps = await result.steps
      emitUsage(ctx, roleName, result)
      // 流内错误透出（404/429/403 → 可操作提示），避免上层只看到空输出
      if (streamError && !text) {
        throw new Error(describeStreamError(streamError, model ?? DEFAULT_MODEL))
      }
      console.log(`[jlcoding] ${roleName} 完成（${steps.length} 步），耗时 ${((Date.now() - started) / 1000).toFixed(1)}s model=${model ?? 'default'}`)
      return text
    } catch (e) {
      // `await result.text` 在流有错误时会先抛「No output generated」/ APICallError——优先还原真实原因
      if (streamError) throw new Error(describeStreamError(streamError, model ?? DEFAULT_MODEL))
      const msg = e instanceof Error ? e.message : String(e)
      if (/No output generated|Not Found|AI_APICallError|APICallError/i.test(msg)) {
        throw new Error(describeStreamError(e, model ?? DEFAULT_MODEL))
      }
      throw guard.classify(e)
    } finally {
      guard.stop()
    }
  }

  // Step 1 架构设计师（断点跳过）
  let design = ''
  if (!completed.design) {
    checkPaused()
    onEvent({ type: 'agent_start', agent: ROLE_NAMES[1], message: '正在设计架构' })
    onEvent({ type: 'task_progress', step: 2, total: 5, label: '架构设计师' })
    design = await askSingle(ctx, ROLE_NAMES[1], `${ROLE_PROMPTS[1]}${ctx.agentHintText ?? ''}${formatFileContext(ctx.fileContext)}`, `用户需求：${userInput}\n\n业务分析师输出：\n${ctx.priorAnalysis}`, deadline)
    onEvent({ type: 'agent_complete', agent: ROLE_NAMES[1], result: design })
    // 落库由路由层在 onEvent 中处理（step 由路由写入）
  } else {
    design = '[断点恢复] 架构设计已完成，直接进入编码'
  }

  // Step 2 代码工程师（断点跳过；增量修改模式 = diff 式只改需要的文件）
  if (!completed.engineering) {
    checkPaused()
    const isModify = Boolean(ctx.incremental && ctx.existingFiles?.length)
    const language = ctx.language ?? 'react'
    onEvent({
      type: 'agent_start',
      agent: ROLE_NAMES[2],
      message: isModify
        ? `正在增量修改代码（${language === 'python' ? 'Python' : 'React'}，只改需要改的文件）`
        : `正在编写 ${language === 'python' ? 'Python（main.py）' : 'React'} 代码`,
    })
    onEvent({ type: 'task_progress', step: 3, total: 5, label: '代码工程师' })
    const fileList = ctx.existingFiles?.map((f) => f.path).join(', ')
    const engineerExtra = isModify
      ? `
【增量修改模式】用户在现有可运行的应用上提出了新的修改需求。沙箱中已有完整文件（内容已持久化）：${fileList}
严格遵守：
1. 先用 readFile 读取与本次修改相关的文件，理解现有结构；
2. 只对需要改动的文件调用 writeFile（一次写入改动后的完整文件内容）；
3. 与本次修改无关的文件绝对不要重写、不要调用 writeFile；
4. 保持现有命名、结构与风格，最小化改动面。`
      : ctx.existingFiles?.length
        ? `\n注意：沙箱中已存在以下文件（来自上次中断，内容已持久化）：${fileList}。这些文件视为已完成，除非用户需求未覆盖——只补写缺失的文件，不要重写已有文件。`
        : ''
    const basePrompt = isModify ? modifyEngineerPrompt(language) : ROLE_PROMPTS[2].replace(CODE_CONSTRAINTS, language === 'python' ? PYTHON_CONSTRAINTS : CODE_CONSTRAINTS)
    const engineerSummary = await runToolLoop(
      ROLE_NAMES[2],
      `${basePrompt}${ctx.skillsInjection ?? ''}${engineerExtra}${formatFileContext(ctx.fileContext)}`,
      `用户原始需求：${userInput.split('\n【追加】')[0]}
${ctx.incremental ? `\n本次修改需求（重点）：${[...userInput.split('\n【追加】')].slice(-1)[0]}` : ''}
${design ? `\n架构设计：\n${design}` : ''}`,
      ['writeFile', 'readFile'],
      12
    )
    onEvent({ type: 'agent_complete', agent: ROLE_NAMES[2], result: engineerSummary || '已完成全部代码文件编写' })
  } else {
    onEvent({ type: 'agent_start', agent: ROLE_NAMES[2], message: '代码已生成（断点恢复），跳过编码' })
  }

  if (!sandbox.hasFiles()) {
    throw new Error('Agent 未能生成任何代码文件，请重试或换一个更明确的需求描述')
  }

  // Step 3 测试工程师
  checkPaused()
  onEvent({ type: 'agent_start', agent: ROLE_NAMES[3], message: '正在校验构建' })
  onEvent({ type: 'task_progress', step: 4, total: 5, label: '测试工程师' })
  const testSummary = await runToolLoop(
    ROLE_NAMES[3],
    ROLE_PROMPTS[3],
    `用户需求：${userInput}\n\n已生成的文件：${sandbox.list().map((f) => f.path).join(', ')}`,
    ['runCommand', 'readFile'],
    4
  )
  if (!validationRan) {
    const result = await sandbox.run('npm run build')
    lastValidation = { exitCode: result.exitCode, stderr: result.stderr }
    onEvent({ type: 'command_run', command: 'npm run build', stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode })
  }
  const passed = lastValidation.exitCode === 0
  onEvent({
    type: 'agent_complete',
    agent: ROLE_NAMES[3],
    result: testSummary || (passed ? '构建校验：通过 ✓' : '构建校验：发现错误'),
  })

  // Step 4 修复工程师（多轮自动修复循环：最多 3 轮，直到校验通过）
  let fixAttempt = 0
  const MAX_FIX_ROUNDS = 3
  while (lastValidation.exitCode !== 0 && fixAttempt < MAX_FIX_ROUNDS) {
    checkPaused()
    fixAttempt++
    onEvent({
      type: 'agent_start',
      agent: ROLE_NAMES[4],
      message: `正在修复错误（第 ${fixAttempt}/${MAX_FIX_ROUNDS} 轮）`,
    })
    onEvent({ type: 'task_progress', step: 5, total: 5, label: `修复工程师 · 第 ${fixAttempt} 轮` })
    const fixSummary = await runToolLoop(
      ROLE_NAMES[4],
      `${ROLE_PROMPTS[4]}\n\n构建错误信息（修复后必须让校验通过）：\n${lastValidation.stderr}`,
      `用户需求：${userInput}\n\n当前文件：${sandbox.list().map((f) => f.path).join(', ')}`,
      ['writeFile', 'runCommand', 'readFile'],
      8
    )
    // 权威复检（无论模型是否自己跑过）
    const recheck = await sandbox.run('npm run build')
    lastValidation = { exitCode: recheck.exitCode, stderr: recheck.stderr }
    onEvent({ type: 'command_run', command: 'npm run build', stdout: recheck.stdout, stderr: recheck.stderr, exitCode: recheck.exitCode })
    onEvent({
      type: 'agent_complete',
      agent: ROLE_NAMES[4],
      result: fixSummary || (lastValidation.exitCode === 0 ? '修复完成，校验通过 ✓' : `第 ${fixAttempt} 轮修复完成，继续验证`),
    })
  }

  if (lastValidation.exitCode !== 0) {
    onEvent({
      type: 'agent_start',
      agent: '系统',
      message: `警告：经 ${MAX_FIX_ROUNDS} 轮修复静态校验仍未通过（${lastValidation.stderr.split('\n')[0]}），预览以 Sandpack 实际编译结果为准`,
    })
  }
}

// ---------- Mock 模式（无 API Key 时走完整两阶段事件流） ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------- 意图路由：CODE（生成/修改）| VERSION（版本对比/回滚/列表）| QA（问答直答） ----------
// 规则层抽至 lib/intent-rules.ts（纯函数零依赖，scripts/test-intent-rules.cjs 确定性单测）

export type { Intent }

interface ClassifyDeps {
  model?: string
  sessionId?: string
  byok?: ByokConfig
}

// LLM 兜底分类（规则未命中的模糊输入）：极简提示词只输出一个词，用 Zen 免费模型（零成本，~1-2s）
async function classifyIntentLLM(deps: ClassifyDeps, text: string): Promise<'code' | 'version' | 'qa'> {
  const agent = new ToolLoopAgent({
    model: getModel(CLASSIFY_MODEL, deps.sessionId, deps.byok),
    instructions: `将用户输入分类为以下之一，只输出一个词，不要任何解释、标点或换行：
- CODE：要求创建新代码/应用，或修改现有代码
- VERSION：对比、回滚、查询历史版本
- QA：提问、求解释、求分析、闲聊

背景：这是一个代码生成工作台，用户在其中提交需求生成应用，当前处于项目会话中。`,
    stopWhen: isStepCount(1),
  })
  const guard = createRunGuard()
  try {
    const result = await agent.stream({
      prompt: `用户输入：${text.slice(0, 200)}`,
      abortSignal: guard.signal,
    })
    for await (const delta of result.textStream) guard.bump(delta) // 逐分片重置空闲看门狗
    const out = ((await result.text) ?? '').trim().toUpperCase()
    if (out.includes('CODE')) return 'code'
    if (out.includes('VERSION')) return 'version'
    return 'qa' // 默认问答：宁可直答也不误触发生成
  } catch {
    return 'qa' // 分类失败降级为问答（不冒进生成）
  } finally {
    guard.stop()
  }
}

// 意图解析总入口：规则优先；未命中且有 LLM 时兜底分类；mock（无 Key 无 BYOK）纯规则，
// 未命中默认 QA——由 mockChatReply 如实告知「演示模式」，不假装分类成功
export async function resolveIntent(deps: ClassifyDeps, text: string): Promise<Intent> {
  const rule = ruleIntent(text)
  if (rule) return rule
  if (!hasModel() && !deps.byok) return 'qa'
  const llm = await classifyIntentLLM(deps, text)
  if (llm === 'code') return 'code'
  if (llm === 'version') return 'version_list' // 粗分类到版本模块：列表展示 + 提示可进一步说「对比 v1/v2」「回滚到 v1」
  return 'qa'
}

// ---------- QA 直答：智能助手多步工具循环 + 流式输出（无确认卡，不进构建管线） ----------

export interface ChatReplyContext {
  history: { role: string; agent?: string | null; content: string }[]
  projectBrief: string
  files: { path: string; content: string }[]
}

export interface ChatReplyRun {
  userInput: string
  onEvent: (event: ServerEvent) => void
  model?: string
  sessionId?: string
  byok?: ByokConfig
  abortSignal?: AbortSignal
  chat: ChatReplyContext
}

const CHAT_ROLE = '智能助手'

export async function runChatReply(run: ChatReplyRun): Promise<string> {
  if (!hasModel() && !run.byok) return mockChatReply()

  const tools: ToolSet = {
    web_search: tool({
      description: '联网搜索（关键词查询，返回前 5 条结果；不可达时如实返回说明）',
      inputSchema: z.object({ query: z.string().describe('搜索关键词') }),
      execute: async ({ query }) => webSearch(query),
    }),
    read_url: tool({
      description: '读取网页正文（用户给出具体链接时优先使用，最多 4000 字）',
      inputSchema: z.object({ url: z.string().describe('完整 URL') }),
      execute: async ({ url }) => readUrlText(url),
    }),
    read_file: tool({
      description: '读取当前项目生成的源码文件（回答本项目相关问题优先使用，按需查看实际代码）',
      inputSchema: z.object({ path: z.string().describe('文件路径，如 src/App.jsx') }),
      execute: async ({ path }) => {
        const f = run.chat.files.find((x) => x.path === path)
        if (!f) {
          return {
            error: `文件不存在：${path}`,
            available: run.chat.files.map((x) => x.path).join(', ') || '（项目暂无文件）',
          }
        }
        return { path, content: f.content.slice(0, 8000) }
      },
    }),
  }

  const historyText = run.chat.history
    .slice(-10)
    .map((m) => `${m.role === 'user' ? '用户' : (m.agent ?? '助手')}：${m.content.slice(0, 300)}`)
    .join('\n')

  const agent = new ToolLoopAgent({
    model: getModel(CHAT_MODEL, run.sessionId, run.byok),
    tools,
    instructions: `你是 jlCoding 工作台的${CHAT_ROLE}。用户在这个工作台用自然语言生成应用，现在向你提问——直接回答问题，不要生成代码文件，也不要调用除下列之外的工具。

${run.chat.projectBrief}

可用工具与使用原则：
- 回答与本项目相关的问题（功能实现、版本差异、代码分析）优先 read_file 查看实际代码后再回答
- 需要外部资料时用 web_search；用户给了链接时用 read_url
- 工具失败（网络不可达等）时如实说明，不要编造结果

要求：中文回答、简洁直接、先给结论；引用项目代码时给关键片段即可；与生成/修改应用相关的新需求，提醒用户在工作台输入框直接描述即可。`,
    stopWhen: isStepCount(6),
  })
  const guard = createRunGuard(run.abortSignal)
  try {
    const result = await agent.stream({
      prompt: `对话历史（最近）：\n${historyText || '（无）'}\n\n用户最新提问：${run.userInput}`,
      abortSignal: guard.signal,
    })
    for await (const part of result.fullStream) {
      guard.bump()
      if (part.type === 'text-delta') {
        run.onEvent({ type: 'agent_delta', agent: CHAT_ROLE, delta: part.text })
      }
    }
    const text = ((await result.text) ?? '').trim()
    emitUsage(run, CHAT_ROLE, result)
    return text || '（模型未返回内容，请重试）'
  } catch (e) {
    throw guard.classify(e)
  } finally {
    guard.stop()
  }
}

async function mockChatReply(): Promise<string> {
  await sleep(500)
  return '【演示模式】当前平台未配置真实模型 API Key，暂无法回答这类问题（不假装分类与回答成功）。可在模型选择中配置「我自己的 API Key」（BYOK）后重试；或描述一个想做的应用，体验完整生成流程（该路径有预置演示数据）。'
}

async function runMockAnalyze({ userInput }: RunContext): Promise<string> {
  await sleep(900)
  return `【mock 模式：未配置 OPENCODE_API_KEY，使用预置演示数据】

应用定位：${userInput.slice(0, 40)}…

功能清单：
1. 任务添加与删除
2. 完成状态切换
3. 全部/进行中/已完成筛选
4. 待完成计数

用户故事：
- 作为用户，我想要快速添加待办，以便不遗漏事项
- 作为用户，我想要勾选完成，以便掌握进度
- 作为用户，我想要筛选查看，以便聚焦当前任务`
}

const TODO_FILES: Record<string, string> = {
  'package.json': `{
  "name": "todo-app",
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
`,
  'index.js': `import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')).render(<App />)
`,
  'App.js': `import React, { useState } from 'react'
import TodoItem from './TodoItem'

export default function App() {
  const [todos, setTodos] = useState([
    { id: 1, text: '欢迎使用 jlCoding 生成的待办应用', done: false },
    { id: 2, text: '在输入框添加新任务', done: false },
  ])
  const [input, setInput] = useState('')
  const [filter, setFilter] = useState('all')

  const addTodo = () => {
    const text = input.trim()
    if (!text) return
    setTodos((t) => [...t, { id: Date.now(), text, done: false }])
    setInput('')
  }

  const toggle = (id) =>
    setTodos((t) => t.map((x) => (x.id === id ? { ...x, done: !x.done } : x)))
  const remove = (id) => setTodos((t) => t.filter((x) => x.id !== id))

  const shown = todos.filter((x) =>
    filter === 'all' ? true : filter === 'active' ? !x.done : x.done
  )

  return (
    <div className="container">
      <h1>我的待办</h1>
      <div className="input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTodo()}
          placeholder="想做点什么？"
        />
        <button onClick={addTodo}>添加</button>
      </div>
      <div className="filters">
        {['all', 'active', 'done'].map((f) => (
          <button
            key={f}
            className={filter === f ? 'active' : ''}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? '全部' : f === 'active' ? '进行中' : '已完成'}
          </button>
        ))}
      </div>
      <ul className="todo-list">
        {shown.map((todo) => (
          <TodoItem key={todo.id} todo={todo} onToggle={toggle} onRemove={remove} />
        ))}
      </ul>
      <p className="count">{todos.filter((t) => !t.done).length} 项待完成</p>
    </div>
  )
}
`,
  'TodoItem.js': `import React from 'react'

export default function TodoItem({ todo, onToggle, onRemove }) {
  return (
    <li className={todo.done ? 'done' : ''}>
      <label>
        <input type="checkbox" checked={todo.done} onChange={() => onToggle(todo.id)} />
        <span>{todo.text}</span>
      </label>
      <button className="delete" onClick={() => onRemove(todo.id)}>✕</button>
    </li>
  )
}
`,
  'styles.css': `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, 'Segoe UI', sans-serif; background: #f5f6fa; color: #222; }
.container { max-width: 480px; margin: 48px auto; background: #fff; border-radius: 16px; padding: 32px; box-shadow: 0 8px 32px rgba(0,0,0,.08); }
h1 { font-size: 22px; margin-bottom: 20px; }
.input-row { display: flex; gap: 8px; margin-bottom: 16px; }
.input-row input { flex: 1; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; outline: none; }
.input-row input:focus { border-color: #6366f1; }
button { border: none; background: #6366f1; color: #fff; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-size: 14px; }
.filters { display: flex; gap: 8px; margin-bottom: 16px; }
.filters button { background: #eef0f6; color: #555; padding: 6px 12px; }
.filters button.active { background: #6366f1; color: #fff; }
.todo-list { list-style: none; }
.todo-list li { display: flex; align-items: center; justify-content: space-between; padding: 10px 4px; border-bottom: 1px solid #f0f0f0; }
.todo-list label { display: flex; align-items: center; gap: 10px; cursor: pointer; flex: 1; }
.todo-list li.done span { text-decoration: line-through; color: #aaa; }
.delete { background: none; color: #c33; padding: 4px 8px; font-size: 14px; }
.count { margin-top: 16px; color: #888; font-size: 13px; }
`,
}

async function runMockContinue(ctx: RunContext & { priorAnalysis: string }, completed: CompletedStages): Promise<void> {
  const { sandbox, onEvent } = ctx
  if (!completed.design) {
    onEvent({ type: 'agent_start', agent: '架构设计师', message: '正在设计架构' })
    onEvent({ type: 'task_progress', step: 2, total: 5, label: '架构设计师' })
    await sleep(800)
    onEvent({
      type: 'agent_complete',
      agent: '架构设计师',
      result: '组件树：\nApp\n├─ 输入区（input + 添加按钮）\n├─ 筛选器（all/active/done）\n└─ TodoItem × n\n\n状态管理：App 内 useState 管理 todos / input / filter，props 下发给 TodoItem。\n\n文件清单：package.json、index.js、App.js、TodoItem.js、styles.css',
    })
  }
  if (!completed.engineering) {
    onEvent({ type: 'agent_start', agent: '代码工程师', message: '正在编写代码' })
    onEvent({ type: 'task_progress', step: 3, total: 5, label: '代码工程师' })
    for (const [path, content] of Object.entries(TODO_FILES)) {
      if (ctx.abortSignal?.aborted) throw new PausedError()
      sandbox.write(path, content)
      onEvent({ type: 'file_created', path, content })
      await sleep(400)
    }
    onEvent({ type: 'agent_complete', agent: '代码工程师', result: '已创建 5 个文件：package.json、index.js、App.js、TodoItem.js、styles.css' })
  }
  onEvent({ type: 'agent_start', agent: '测试工程师', message: '正在校验构建' })
  onEvent({ type: 'task_progress', step: 4, total: 5, label: '测试工程师' })
  const result = await sandbox.run('npm run build')
  onEvent({ type: 'command_run', command: 'npm run build', stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode })
  onEvent({ type: 'agent_complete', agent: '测试工程师', result: '构建校验：通过 ✓' })
}
