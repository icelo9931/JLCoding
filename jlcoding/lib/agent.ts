import { ToolLoopAgent, tool, isStepCount, type ToolSet } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { z } from 'zod'
import { Sandbox } from './sandbox'
import type { ServerEvent } from './types'
import { DEFAULT_MODEL, isValidModel } from './models'

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
- 所有交互状态用 React hooks 管理，确保应用可直接运行且无控制台报错。`

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

// 增量修改模式的工程师 prompt（diff 式最小改动）
const MODIFY_ENGINEER_PROMPT = `你是资深代码工程师，正在对现有可运行的应用做增量修改。
${CODE_CONSTRAINTS}

性能要求（重要）：
- 优先用 readFile 理解现状，只对需要改动的文件调用 writeFile，一次写入完整内容；
- 与修改无关的文件一律不动；改动面最小化，保持现有风格；
- 若修改涉及新功能，可新增组件文件并从现有文件正确导入；
- 完成后用一句话总结改了哪些文件、为什么。不要调用其他工具。`

const ROLE_NAMES = ['业务分析师', '架构设计师', '代码工程师', '测试工程师', '修复工程师']

export function hasModel(): boolean {
  return Boolean(process.env.OPENCODE_API_KEY)
}

function getModel(modelId?: string, sessionId?: string) {
  const opencode = createOpenAICompatible({
    name: 'opencode',
    baseURL: process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/go/v1',
    apiKey: process.env.OPENCODE_API_KEY,
    headers: {
      'User-Agent': 'jlcoding/1.0',
      ...(sessionId ? { 'x-opencode-session': sessionId } : {}),
    },
  })
  return opencode(isValidModel(modelId) ? modelId! : DEFAULT_MODEL)
}

// ---------- 阶段 1：业务分析师（独立运行，产出需求理解，等待用户确认） ----------

// 纯文本角色：单轮生成，逐 token 流式输出（模块级，两个阶段共用）
async function askSingle(
  c: RunContext, roleName: string, instructions: string, prompt: string
): Promise<string> {
  const started = Date.now()
  const agent = new ToolLoopAgent({
    model: getModel(c.model, c.sessionId),
    instructions,
    stopWhen: isStepCount(1),
  })
  try {
    const result = await agent.stream({ prompt, abortSignal: c.abortSignal })
    for await (const delta of result.textStream) {
      c.onEvent({ type: 'agent_delta', agent: roleName, delta })
    }
    const text = ((await result.text) ?? '').trim()
    emitUsage(c, roleName, result)
    console.log(`[jlcoding] ${roleName} 完成，耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`)
    return text
  } catch (e) {
    if (c.abortSignal?.aborted || (e instanceof Error && e.name === 'AbortError')) throw new PausedError()
    throw e
  }
}

// usage 采集：token 消耗随事件推送前端
async function emitUsage(c: RunContext, roleName: string, result: { usage: PromiseLike<{ inputTokens?: number; outputTokens?: number }> }) {
  try {
    const usage = await result.usage
    if (usage && (usage.inputTokens || usage.outputTokens)) {
      c.onEvent({ type: 'usage', agent: roleName, inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 })
    }
  } catch { /* usage 不可用时忽略 */ }
}

export async function runAnalyze(ctx: RunContext): Promise<string> {
  if (!hasModel()) return runMockAnalyze(ctx)
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
  if (!hasModel()) {
    await runMockContinue(ctx, completed)
    return
  }
  const { userInput, sandbox, onEvent, model, sessionId, abortSignal } = ctx
  const checkPaused = () => {
    if (abortSignal?.aborted) throw new PausedError()
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
      model: getModel(model, sessionId),
      tools,
      stopWhen: isStepCount(maxSteps),
      prepareStep: () => ({ instructions, activeTools }),
    })
    try {
      const result = await agent.stream({ prompt, abortSignal })
      for await (const delta of result.textStream) {
        onEvent({ type: 'agent_delta', agent: roleName, delta })
      }
      const text = ((await result.text) ?? '').trim()
      const steps = await result.steps
      emitUsage(ctx, roleName, result)
      console.log(`[jlcoding] ${roleName} 完成（${steps.length} 步），耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`)
      return text
    } catch (e) {
      if (abortSignal?.aborted || (e instanceof Error && e.name === 'AbortError')) throw new PausedError()
      throw e
    }
  }

  // Step 1 架构设计师（断点跳过）
  let design = ''
  if (!completed.design) {
    checkPaused()
    onEvent({ type: 'agent_start', agent: ROLE_NAMES[1], message: '正在设计架构' })
    onEvent({ type: 'task_progress', step: 2, total: 5, label: '架构设计师' })
    design = await askSingle(ctx, ROLE_NAMES[1], `${ROLE_PROMPTS[1]}${ctx.agentHintText ?? ''}${formatFileContext(ctx.fileContext)}`, `用户需求：${userInput}\n\n业务分析师输出：\n${ctx.priorAnalysis}`)
    onEvent({ type: 'agent_complete', agent: ROLE_NAMES[1], result: design })
    // 落库由路由层在 onEvent 中处理（step 由路由写入）
  } else {
    design = '[断点恢复] 架构设计已完成，直接进入编码'
  }

  // Step 2 代码工程师（断点跳过；增量修改模式 = diff 式只改需要的文件）
  if (!completed.engineering) {
    checkPaused()
    const isModify = Boolean(ctx.incremental && ctx.existingFiles?.length)
    onEvent({
      type: 'agent_start',
      agent: ROLE_NAMES[2],
      message: isModify ? '正在增量修改代码（只改需要改的文件）' : '正在编写代码',
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
    const engineerSummary = await runToolLoop(
      ROLE_NAMES[2],
      `${ctx.incremental ? MODIFY_ENGINEER_PROMPT : ROLE_PROMPTS[2]}${ctx.skillsInjection ?? ''}${engineerExtra}${formatFileContext(ctx.fileContext)}`,
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
