// P0 专项冒烟：权限矩阵（401/403）/ 409 并发防护 / provider 记录级区分 / 陈旧 building 自愈 / 重试防双写
// 运行前提：本地 dev 服务已启动（默认 http://localhost:3000）且 .env 配置了 OPENCODE_API_KEY
// 模型用 Zen 免费层（deepseek-v4.1-flash，零成本）
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const base = process.env.BASE_URL || 'http://localhost:3000'
  const password = 'test123456'
  const model = 'deepseek-v4.1-flash'
  let pass = 0, fail = 0
  const ok = (name, cond, extra = '') => {
    cond ? pass++ : fail++
    console.log(`${cond ? 'PASS ✓' : 'FAIL ✗'} ${name}${extra ? '  ｜ ' + extra : ''}`)
  }

  const sse = async (body, cookie) => {
    const r = await fetch(`${base}/api/projects/${body.__pid}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(`chat ${r.status}: ${(await r.text()).slice(0, 120)}`)
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
        if (line.startsWith('data: ')) {
          try { events.push(JSON.parse(line.slice(6))) } catch { /* partial */ }
        }
      }
    }
    return events
  }
  const getDetail = async (cookie, pid) =>
    (await (await fetch(`${base}/api/projects/${pid}`, { headers: { cookie } })).json())

  // 0. /api/status：真实模型路径 + 网关可达
  let res = await fetch(`${base}/api/status`)
  const status = await res.json()
  ok('/api/status 返回且 hasModel=true（真实 Provider）', res.status === 200 && status.hasModel === true, `provider=${status.provider ?? '-'} baseUrl=${status.baseUrl ?? '-'}`)
  ok('网关可达', status.gatewayReachable === true)

  // 1. 注册 A + 建项目
  const email = `p0a${Date.now().toString(36)}@jlcoding.dev`
  res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  ok('注册 A', res.status === 201)
  res = await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ name: 'P0 冒烟' }),
  })
  const project = await res.json()
  const pid = project.id
  ok('创建项目', res.status === 201 && pid, `id=${pid?.slice(-6)}`)

  // 2. 真实 analyze：run_started 事件 + provider 落库
  const req = '做一个极简待办应用，React 网页版，支持添加和完成'
  const events = await sse({ __pid: pid, message: req, phase: 'analyze', model }, cookie)
  const runStarted = events.find((e) => e.type === 'run_started')
  ok('SSE run_started 事件（含 req_ runId）', Boolean(runStarted?.runId) && runStarted.runId.startsWith('req_'), runStarted ? `provider=${runStarted.provider}` : '未收到')
  ok('run_started.provider 前缀 opencode:', Boolean(runStarted && String(runStarted.provider).startsWith('opencode:')))
  ok('awaiting_confirmation 到达', events.some((e) => e.type === 'awaiting_confirmation'))

  let detail = await getDetail(cookie, pid)
  ok('Project.provider 落库', typeof detail.provider === 'string' && detail.provider.startsWith('opencode:'), `provider=${detail.provider ?? 'null'}`)

  // 3. 重试防双写：10 分钟内相同内容再 analyze → 用户消息数不变
  const userCountBefore = detail.messages.filter((m) => m.role === 'user').length
  await sse({ __pid: pid, message: req, phase: 'analyze', model }, cookie)
  detail = await getDetail(cookie, pid)
  const userCountAfter = detail.messages.filter((m) => m.role === 'user').length
  ok('重试防双写（相同内容不重复落库）', userCountAfter === userCountBefore, `user 消息 ${userCountBefore} → ${userCountAfter}`)

  // 4. 409 并发防护：生成运行中再发起 → 409；首次生成正常完成（网络波动断点续跑 ≤3 次）
  let tries = 0
  let contEvents = []
  let complete = false
  while (tries < 3 && !complete) {
    tries++
    const run = sse({ __pid: pid, phase: 'continue', model }, cookie)
    await new Promise((r) => setTimeout(r, 1500))
    if (tries === 1) {
      res = await fetch(`${base}/api/projects/${pid}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ phase: 'continue', model }),
      })
      ok('并发防护 409', res.status === 409, `status=${res.status}`)
    }
    contEvents = await run
    complete = contEvents.some((e) => e.type === 'complete')
    if (!complete) {
      const errEv = contEvents.find((e) => e.type === 'error')
      detail = await getDetail(cookie, pid)
      ok(`第 ${tries} 次尝试失败已落库（status=${detail.status}）`, detail.status === 'error' || detail.status === 'paused', `原因=${(errEv?.message ?? '').slice(0, 60)}`)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
  ok('生成 complete', complete, `尝试 ${tries} 次`)
  detail = await getDetail(cookie, pid)
  ok('生成后 status=ready 且文件齐备', detail.status === 'ready' && detail.files.length >= 3, `files=${detail.files.length}`)

  // 5. 权限矩阵：未登录 401 / B 账号 403（detail / files / ZIP / chat 全覆盖）
  const resB = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `p0b${Date.now().toString(36)}@jlcoding.dev`, password }),
  })
  const cookieB = (resB.headers.get('set-cookie') ?? '').split(';')[0]
  const matrix = [
    ['GET detail', `/api/projects/${pid}`, {}],
    ['GET files', `/api/projects/${pid}/files`, {}],
    ['GET zip', `/api/projects/${pid}/download`, {}],
    ['POST chat', `/api/projects/${pid}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'x', phase: 'analyze' }) }],
  ]
  for (const [name, path, init] of matrix) {
    const un = (await fetch(`${base}${path}`, init)).status
    const b = (await fetch(`${base}${path}`, { ...init, headers: { ...(init.headers ?? {}), cookie: cookieB } })).status
    ok(`${name}：未登录 401 / B 账号 403`, un === 401 && b === 403, `un=${un} b=${b}`)
  }
  res = await fetch(`${base}/api/projects/${pid}/download`, { headers: { cookie } })
  const zipBuf = Buffer.from(await res.arrayBuffer())
  ok('owner ZIP 200 且为合法 zip', res.status === 200 && zipBuf.slice(0, 2).toString() === 'PK', `${zipBuf.length} bytes`)

  // 6. 陈旧 building 自愈：runStartedAt 为 10 分钟前 → GET detail → paused（可续跑）
  await db.project.update({ where: { id: pid }, data: { status: 'building', runStartedAt: new Date(Date.now() - 10 * 60_000) } })
  detail = await getDetail(cookie, pid)
  ok('陈旧 building 自愈 → paused', detail.status === 'paused')

  // 7. 新近 building 不误判：runStartedAt=now → 保持 building（另一实例可能仍在跑）
  await db.project.update({ where: { id: pid }, data: { status: 'building', runStartedAt: new Date() } })
  detail = await getDetail(cookie, pid)
  ok('新近 building 不误判（保持 building）', detail.status === 'building')
  await db.project.update({ where: { id: pid }, data: { status: 'ready' } })

  console.log(`\n=== P0 冒烟 ${fail === 0 ? `全部通过 ✓（${pass} 项）` : `失败 ✗（${fail}/${pass + fail} 项）`} ===`)
  await db.$disconnect()
  if (fail > 0) process.exit(1)
}

main().catch(async (e) => {
  console.error('失败:', e.message)
  await db.$disconnect()
  process.exit(1)
})
