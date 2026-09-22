// 增量修改（diff 式）+ token 统计端到端：登录 → 对 ready 项目提修改 → 只改动相关文件
async function main() {
  const base = 'http://localhost:3000'
  const t0 = Date.now()
  const ts = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`

  // 1. 登录（复用端到端测试账号）
  let res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'testmuc1vjzd@jlcoding.dev', password: 'test123456' }),
  })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  console.log(`${ts()} 登录: ${res.status}`)
  if (!cookie) process.exit(1)

  // 2. 找到 ready 的计算器项目
  const projects = await (await fetch(`${base}/api/projects`, { headers: { cookie } })).json()
  const project = projects.find((p) => p.status === 'ready' && /计算器|阴阳历/.test(p.name)) ?? projects[0]
  if (!project) { console.error('没有可用项目'); process.exit(1) }
  const before = await (await fetch(`${base}/api/projects/${project.id}`, { headers: { cookie } })).json()
  const beforeFiles = Object.fromEntries(before.files.map((f) => [f.path, f.content.length]))
  console.log(`${ts()} 目标项目: ${project.name}（${before.files.length} 文件, status=${before.status}）`)

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

  // 3. 提出修改需求 → 分析 → 确认
  let ev = await chat({ message: '在农历结果里同时显示当日生肖和干支纪年', phase: 'analyze', model: 'deepseek-v4-pro' })
  const awaited = ev.find((e) => e.type === 'awaiting_confirmation')
  console.log(`${ts()} 修改分析: ${awaited ? '等待确认 ✓' : 'FAIL ✗'}`)
  if (!awaited) process.exit(1)

  // 4. 确认 → 增量修改生成
  ev = await chat({ phase: 'continue', model: 'deepseek-v4-pro' })
  const complete = ev.find((e) => e.type === 'complete')
  const incrementalMsg = ev.find((e) => e.type === 'agent_start' && e.message?.includes('增量'))
  const created = ev.filter((e) => e.type === 'file_created').map((e) => e.path)
  const updated = ev.filter((e) => e.type === 'file_updated').map((e) => e.path)
  const untouched = ev.filter((e) => e.type === 'agent_start' && e.message?.includes('断点恢复'))
  const usages = ev.filter((e) => e.type === 'usage')
  const tokenIn = usages.reduce((s, u) => s + u.inputTokens, 0)
  const tokenOut = usages.reduce((s, u) => s + u.outputTokens, 0)
  console.log(`${ts()} 增量模式: ${incrementalMsg ? '✓' : '✗'}`)
  console.log(`${ts()} 本轮改动: 新增 ${created.length}（${created.join(', ') || '-'}）｜修改 ${updated.length}（${updated.join(', ') || '-'}）`)
  console.log(`${ts()} 断点跳过（设计未重跑）: ${untouched.length > 0 || !ev.some((e) => e.agent === '架构设计师' && e.type === 'agent_complete') ? '✓' : '设计被重跑'}`)
  console.log(`${ts()} Token 消耗: 入 ${tokenIn.toLocaleString()} · 出 ${tokenOut.toLocaleString()}（${usages.length} 个角色上报）`)

  // 5. 未被重写的文件内容应保持不变
  const after = await (await fetch(`${base}/api/projects/${project.id}`, { headers: { cookie } })).json()
  const afterFiles = Object.fromEntries(after.files.map((f) => [f.path, f.content.length]))
  const touched = new Set([...created, ...updated])
  const untouchedSame = Object.keys(beforeFiles)
    .filter((p) => !touched.has(p))
    .every((p) => beforeFiles[p] === afterFiles[p])
  console.log(`${ts()} 未触及文件保持原样: ${untouchedSame ? 'PASS ✓' : 'FAIL ✗'}`)
  const hasZodiac = after.files.some((f) => /生肖|zodiac|干支/.test(f.content))
  console.log(`${ts()} 修改生效（生肖/干支出现）: ${hasZodiac ? 'PASS ✓' : 'FAIL ✗'}｜最终 status=${after.status}`)

  const pass = complete && incrementalMsg && untouchedSame && hasZodiac && usages.length > 0
  console.log(`\n=== 增量修改 + Token 统计 ${pass ? '全部通过 ✓' : '失败 ✗'} ===`)
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
