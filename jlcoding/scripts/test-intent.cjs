// 意图路由专项（第三轮实测反馈落地验证）：
// S1 QA 直答（无确认卡、不动构建状态/进度条）/ S2 CODE 走确认管线 / S3 增量轮 → v2
// S4 VERSION 列表 / S5 VERSION 结构化 diff / S6 对话触发回滚（文件集哈希精确还原 + append-only）
// S7 模糊输入 LLM 兜底分类（不误触发生成）
// 模型用 Zen 免费层（deepseek-v4.1-flash，零成本）；自适应 mock/real 双路径断言
const crypto = require('crypto')
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')
function filesSha(files) {
  const canonical = [...files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => `${f.path}\n${f.content}`)
    .join('\n\n')
  return sha256(canonical)
}

async function main() {
  const base = process.env.BASE_URL || 'http://localhost:3000'
  const model = 'deepseek-v4.1-flash'
  let pass = 0, fail = 0
  const ok = (name, cond, extra = '') => {
    cond ? pass++ : fail++
    console.log(`  ${cond ? 'PASS ✓' : 'FAIL ✗'} ${name}${extra ? '  ｜ ' + extra : ''}`)
  }
  const sse = async (pid, body, cookie) => {
    const r = await fetch(`${base}/api/projects/${pid}/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(`chat ${r.status}: ${(await r.text()).slice(0, 150)}`)
    const reader = r.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const events = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('data: ')) { try { events.push(JSON.parse(line.slice(6))) } catch { /* partial */ } }
      }
    }
    return events
  }
  const detailOf = async (pid, cookie) =>
    (await (await fetch(`${base}/api/projects/${pid}`, { headers: { cookie } })).json())

  const analyzeWithRetry = async (pid, message, cookie, label) => {
    for (let i = 1; i <= 3; i++) {
      const ev = await sse(pid, { message, phase: 'analyze', model }, cookie)
      if (ev.some((e) => e.type === 'awaiting_confirmation') || ev.some((e) => e.type === 'complete') || ev.some((e) => e.type === 'agent_complete')) return ev
      console.log(`  ｜ ${label} 第 ${i} 次失败（${(ev.find((e) => e.type === 'error')?.message ?? '').slice(0, 60)}）→ 重试`)
      await new Promise((r) => setTimeout(r, 3000))
    }
    return null
  }

  const email = `it${Date.now().toString(36)}@jlcoding.dev`
  let res = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test123456' }),
  })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  res = await fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ name: '意图路由验证' }),
  })
  const pid = (await res.json()).id

  // 生成路径自适应：mock（额度受限/无 Key）下机制断言全验（VERSION 模块无 LLM 依赖），内容断言适配
  const status = await (await fetch(`${base}/api/status`)).json()
  const isMock = !status.hasModel
  console.log(`生成路径：${isMock ? 'Mock（平台额度受限）' : '真实模型（OpenCode Zen · 免费层）'}—— 意图路由/版本模块机制断言全验`)

  // ===== S1 QA：直接回答，不进构建管线 =====
  console.log('\n--- S1 QA 直答（空项目上提问） ---')
  let ev = await analyzeWithRetry(pid, '什么是 React 的 useState？为什么我生成的应用里要用它？', cookie, 'S1')
  if (!ev) throw new Error('S1 分析三次失败')
  let detail = await detailOf(pid, cookie)
  ok('S1 无确认卡（不进分析管线）', !ev.some((e) => e.type === 'awaiting_confirmation'))
  ok('S1 run_started intent=chat（模型调用卡片照常）', ev.find((e) => e.type === 'run_started')?.intent === 'chat')
  ok('S1 智能助手回复落库（step=chat，mock 下如实标注演示模式）',
    detail.messages.some((m) => m.role === 'assistant' && m.step === 'chat' && (isMock ? /演示模式/.test(m.content) : m.agent === '智能助手')))
  ok('S1 complete intent=chat', ev.find((e) => e.type === 'complete')?.intent === 'chat')
  ok('S1 构建状态未被改变（draft 保持 draft）', detail.status === 'draft', `status=${detail.status}`)
  ok('S1 无 task_progress（进度条不动）', !ev.some((e) => e.type === 'task_progress'))

  // ===== S2 CODE：照常走确认管线 =====
  console.log('\n--- S2 CODE 走确认管线（番茄钟） ---')
  ev = await analyzeWithRetry(pid, '做一个极简番茄钟计时器，开始和暂停', cookie, 'S2')
  if (!ev) throw new Error('S2 分析三次失败')
  ok('S2 出现确认卡（awaiting_confirmation）', ev.some((e) => e.type === 'awaiting_confirmation'))
  ok('S2 run_started intent=code', ev.find((e) => e.type === 'run_started')?.intent === 'code')
  detail = await detailOf(pid, cookie)
  ok('S2 状态 awaiting', detail.status === 'awaiting')
  let tries = 0
  do {
    tries++
    ev = await sse(pid, { phase: 'continue', model }, cookie)
    if (!ev.some((e) => e.type === 'complete') && tries < 3) await new Promise((r) => setTimeout(r, 3000))
  } while (!ev.some((e) => e.type === 'complete') && tries < 3)
  const v1 = ev.find((e) => e.type === 'version_created')
  ok('S2 生成完成 v1', v1?.version === 1, `sha=${v1 ? v1.sha.slice(0, 8) : '-'}`)

  // ===== S3 增量修改轮 → v2 =====
  console.log('\n--- S3 增量修改 → v2 ---')
  ev = await analyzeWithRetry(pid, '给番茄钟加上重置按钮，并在顶部显示当前是工作还是休息阶段', cookie, 'S3')
  if (!ev) throw new Error('S3 分析三次失败')
  ok('S3 修改轮照常确认', ev.some((e) => e.type === 'awaiting_confirmation'))
  tries = 0
  do {
    tries++
    ev = await sse(pid, { phase: 'continue', model }, cookie)
    if (!ev.some((e) => e.type === 'complete') && tries < 3) await new Promise((r) => setTimeout(r, 3000))
  } while (!ev.some((e) => e.type === 'complete') && tries < 3)
  const v2 = ev.find((e) => e.type === 'version_created')
  ok('S3 增量完成 v2', v2?.version === 2, `sha=${v2 ? v2.sha.slice(0, 8) : '-'}`)
  ok(isMock ? 'S3 Mock 增量内容确定性一致（预置文件哈希不变）' : 'S3 v2 sha 变化（增量真实生效）',
    isMock ? v2.sha === v1.sha : v2.sha !== v1.sha)

  // ===== S4 VERSION 列表 =====
  console.log('\n--- S4 VERSION 列表 ---')
  ev = await sse(pid, { message: '现在有几个版本了？把版本历史列出来', phase: 'analyze', model }, cookie)
  const listReply = ev.find((e) => e.type === 'agent_complete' && e.agent === '版本助手')
  ok('S4 版本助手回复（无确认卡）', Boolean(listReply) && !ev.some((e) => e.type === 'awaiting_confirmation'))
  ok('S4 列表含 v1/v2 与 append-only 说明', /v2/.test(listReply?.result ?? '') && /v1/.test(listReply?.result ?? '') && /append-only/.test(listReply?.result ?? ''))
  ok('S4 complete intent=version 且状态保持 ready', ev.find((e) => e.type === 'complete')?.intent === 'version' && (await detailOf(pid, cookie)).status === 'ready')

  // ===== S5 VERSION 结构化 diff =====
  console.log('\n--- S5 VERSION 结构化 diff ---')
  ev = await sse(pid, { message: '对比一下这两轮生成的结果有什么区别', phase: 'analyze', model }, cookie)
  const diffReply = ev.find((e) => e.type === 'agent_complete' && e.agent === '版本助手')
  ok('S5 diff 回复（无确认卡、未误触发生成）', Boolean(diffReply) && !ev.some((e) => e.type === 'awaiting_confirmation') && !ev.some((e) => e.type === 'run_started'))
  ok('S5 结构化对比（v1 → v2 + 内容变更/未变化 + SHA）',
    /v1 → v2/.test(diffReply?.result ?? '') &&
    /(内容变更|未变化|新增文件|删除文件)/.test(diffReply?.result ?? '') &&
    /SHA/.test(diffReply?.result ?? ''))

  // ===== S6 对话触发回滚 =====
  console.log('\n--- S6 对话触发回滚（回滚到 v1） ---')
  ev = await sse(pid, { message: '回滚到 v1', phase: 'analyze', model }, cookie)
  const rbEvent = ev.find((e) => e.type === 'version_created')
  ok('S6 触发回滚（version_created v3）', rbEvent?.version === 3, `v${rbEvent?.version ?? '-'}`)
  detail = await detailOf(pid, cookie)
  const versions = await (await fetch(`${base}/api/projects/${pid}/versions`, { headers: { cookie } })).json()
  const v1Sha = versions.find((v) => v.version === 1)?.sha
  ok('S6 回滚后文件集哈希精确还原 v1', v1Sha && filesSha(detail.files) === v1Sha,
    `now=${filesSha(detail.files).slice(0, 8)} v1=${String(v1Sha).slice(0, 8)}`)
  ok('S6 append-only 历史保留（3 个版本）', versions.length === 3 && versions.map((v) => v.version).join(',') === '3,2,1')

  // ===== S7 模糊输入 LLM 兜底（不误触发生成） =====
  console.log('\n--- S7 模糊输入 LLM 兜底 ---')
  ev = await analyzeWithRetry(pid, '帮我看看这个项目的整体情况如何', cookie, 'S7')
  if (!ev) throw new Error('S7 分析三次失败')
  ok('S7 未误触发生成（无确认卡、无 version_created）',
    !ev.some((e) => e.type === 'awaiting_confirmation') && !ev.some((e) => e.type === 'version_created'))
  ok('S7 有回复完成', ev.some((e) => e.type === 'complete'))

  console.log(`\n=== 意图路由专项 ${fail === 0 ? `全部通过 ✓（${pass} 项）` : `失败 ✗（${fail} 项）`} ===`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
