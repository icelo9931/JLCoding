// UX 专项验证（据用户实测反馈改造后）：
// 1. 默认语言改 React：不含任何语言关键词的「计算器」需求 → 生成 React（可预览、可线上使用）
// 2. run_started 携带 runId（模型调用卡片数据源）
// 3. 对话流不再直白插「本次生成路径」system 消息（呈现移至工作日志卡片 + 版本历史）
// 4. 部署 → /app/:id 可访问（线上使用）
// 模型用 Zen 免费层（deepseek-v4.1-flash，零成本）
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
    console.log(`${cond ? 'PASS ✓' : 'FAIL ✗'} ${name}${extra ? '  ｜ ' + extra : ''}`)
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

  const email = `ux${Date.now().toString(36)}@jlcoding.dev`
  let res = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test123456' }),
  })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  res = await fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ name: 'UX 计算器' }),
  })
  const pid = (await res.json()).id

  // 1. 分析（需求不含 react/python/网页 等任何语言关键词——纯「计算器」）
  let ev = null
  for (let i = 1; i <= 3; i++) {
    ev = await sse(pid, { message: '做一个计算器：按钮 0-9、加减乘除、等号、清除，显示算式和结果', phase: 'analyze', model }, cookie)
    if (ev.some((e) => e.type === 'awaiting_confirmation')) break
    console.log(`  ｜ 第 ${i} 次分析失败 → 重试`)
    await new Promise((r) => setTimeout(r, 3000))
  }
  ok('分析 awaiting', ev.some((e) => e.type === 'awaiting_confirmation'))
  const rs = ev.find((e) => e.type === 'run_started')
  ok('run_started 携带 runId（req_ 前缀）', Boolean(rs?.runId) && rs.runId.startsWith('req_'), rs ? `runId=${rs.runId}` : '未收到')
  let detail = await (await fetch(`${base}/api/projects/${pid}`, { headers: { cookie } })).json()
  ok('对话流无 system 消息（呈现已移至卡片）', !detail.messages.some((m) => m.role === 'system'))
  ok('Project.provider 落库（评审证据链保留）', String(detail.provider).startsWith('opencode:'), detail.provider)

  // 2. 生成（默认 React 断言：产出 package.json + index 入口，无 .py）
  let tries = 0
  do {
    tries++
    ev = await sse(pid, { phase: 'continue', model }, cookie)
    if (!ev.some((e) => e.type === 'complete') && tries < 3) await new Promise((r) => setTimeout(r, 3000))
  } while (!ev.some((e) => e.type === 'complete') && tries < 3)
  ok('生成 complete', ev.some((e) => e.type === 'complete'), `${tries} 次尝试`)
  detail = await (await fetch(`${base}/api/projects/${pid}`, { headers: { cookie } })).json()
  const paths = detail.files.map((f) => f.path)
  ok('默认 React（无语言关键词的 GUI 需求）', paths.includes('package.json') && !paths.some((p) => p.endsWith('.py')), paths.join(', ').slice(0, 60))
  const v1 = ev.find((e) => e.type === 'version_created')
  ok('v1 快照 + SHA 三方一致', v1?.version === 1 && v1.sha === filesSha(detail.files))

  // 3. 部署（线上使用）
  res = await fetch(`${base}/api/projects/${pid}/deploy`, { method: 'POST', headers: { cookie } })
  const dep = await res.json()
  ok('部署成功', res.status === 200 && /^[0-9a-f]{64}$/.test(dep.sha ?? ''), `sha=${String(dep.sha).slice(0, 8)} 入口=${dep.entry}`)
  const html = await (await fetch(`${base}/app/${pid}`)).text()
  ok('/app/:id 自包含可访问（线上使用链接）', html.includes('id="root"') && /react/i.test(html), `${html.length} 字节`)

  console.log(`\n=== UX 专项 ${fail === 0 ? `全部通过 ✓（${pass} 项）` : `失败 ✗（${fail} 项）`} ===`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
