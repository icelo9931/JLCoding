// Phase 3 端到端：注册登录 → 新会话 → 阴阳历计算器 → ready/ZIP/权限
async function main() {
  const base = 'http://localhost:3000'
  const email = `test${Date.now().toString(36)}@jlcoding.dev`
  const password = 'test123456'
  const t0 = Date.now()
  const ts = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`
  let cookie = ''

  // 1. 注册（自动登录）
  let res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const user = await res.json()
  cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  console.log(`${ts()} 1. 注册: ${res.status} ${user.email ?? user.error}`)
  if (res.status !== 201) process.exit(1)

  // 2. me
  res = await fetch(`${base}/api/auth/me`, { headers: { cookie } })
  const me = await res.json()
  console.log(`${ts()} 2. 会话校验: ${res.status} user=${me.user?.email}`)
  if (!me.user) process.exit(1)

  // 3. 未登录门控
  res = await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x' }),
  })
  console.log(`${ts()} 3. 未登录创建被拦截: ${res.status === 401 ? 'PASS ✓' : 'FAIL ✗'}`)

  // 4. 登录态创建项目（小白模式 + 代码工程师主导）
  res = await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ name: '阴阳历计算器', mode: 'novice', agent: 'engineer' }),
  })
  const project = await res.json()
  console.log(`${ts()} 4. 新会话: ${res.status} id=${project.id?.slice(-6)} userId=${project.userId ? '已绑定 ✓' : 'FAIL'}`)
  if (res.status !== 201) process.exit(1)

  const chat = async (body) => {
    const r = await fetch(`${base}/api/projects/${project.id}/chat`, {
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

  // 5. 别人（无 cookie）不能操作我的项目
  res = await fetch(`${base}/api/projects/${project.id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'x', phase: 'analyze' }),
  })
  console.log(`${ts()} 5. 越权操作被拦截: ${res.status === 403 ? 'PASS ✓' : 'FAIL ✗(' + res.status + ')'}`)

  // 6. 分析 → 确认
  let ev = await chat({ message: '生成一个计算器，计算阳历和阴历日期，输入一个阳历或者阴历日期，计算出对应的另一个日期', phase: 'analyze', model: 'deepseek-v4-pro' })
  const awaited = ev.find((e) => e.type === 'awaiting_confirmation')
  console.log(`${ts()} 6. 分析并等待确认: ${awaited ? 'PASS ✓' : 'FAIL ✗'}`)
  if (!awaited) process.exit(1)

  // 7. 确认 → 全程生成
  ev = await chat({ phase: 'continue', model: 'deepseek-v4-pro' })
  const complete = ev.find((e) => e.type === 'complete')
  const files = ev.filter((e) => e.type === 'file_created')
  const cmd = ev.filter((e) => e.type === 'command_run')
  console.log(`${ts()} 7. 生成完成: ${complete ? 'PASS ✓' : 'FAIL ✗'}｜${files.length} 文件｜校验 exit=${cmd.map((c) => c.exitCode).join(',')}`)

  // 8. 详情 + 隔离（我的项目列表只含我的）
  const detail = await (await fetch(`${base}/api/projects/${project.id}`, { headers: { cookie } })).json()
  const mine = await (await fetch(`${base}/api/projects`, { headers: { cookie } })).json()
  const hasLunar = detail.files.some((f) => /lunar|农历/i.test(f.content) || /农历/i.test(f.path))
  console.log(`${ts()} 8. 持久化: status=${detail.status}｜农历逻辑=${hasLunar ? '有 ✓' : '无 ✗'}｜我的项目数=${mine.length}`)

  // 9. ZIP
  res = await fetch(`${base}/api/projects/${project.id}/download`, { headers: { cookie } })
  const zipBuf = Buffer.from(await res.arrayBuffer())
  console.log(`${ts()} 9. ZIP: ${res.status} ${zipBuf.length} bytes PK=${zipBuf.slice(0, 2).toString() === 'PK'}`)

  const allPass = complete && hasLunar && zipBuf.length > 500 && mine.length >= 1
  console.log(`\n=== 认证 + 阴阳历计算器端到端 ${allPass ? '全部通过 ✓' : '失败 ✗'} ===`)
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
