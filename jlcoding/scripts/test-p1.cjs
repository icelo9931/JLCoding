// P1 专项冒烟：版本快照（v1 初始化 / v2 增量）/ append-only 回滚（文件集哈希回到 v1）/ 部署（esbuild /app/:id / SHA / Python 范围拒绝）
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
  const password = 'test123456'
  const model = 'deepseek-v4.1-flash'
  let pass = 0, fail = 0
  const ok = (name, cond, extra = '') => {
    cond ? pass++ : fail++
    console.log(`${cond ? 'PASS ✓' : 'FAIL ✗'} ${name}${extra ? '  ｜ ' + extra : ''}`)
  }

  const sse = async (pid, body, cookie) => {
    const r = await fetch(`${base}/api/projects/${pid}/chat`, {
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
  const detailOf = async (pid, cookie) =>
    (await (await fetch(`${base}/api/projects/${pid}`, { headers: { cookie } })).json())
  const versionsOf = async (pid, cookie) =>
    (await (await fetch(`${base}/api/projects/${pid}/versions`, { headers: { cookie } })).json())

  const analyzeWithRetry = async (pid, message, cookie, label) => {
    for (let i = 1; i <= 3; i++) {
      const ev = await sse(pid, { message, phase: 'analyze', model }, cookie)
      if (ev.some((e) => e.type === 'awaiting_confirmation') || ev.some((e) => e.type === 'agent_complete')) return ev
      console.log(`  ｜ ${label} 第 ${i} 次分析失败（${(ev.find((e) => e.type === 'error')?.message ?? '').slice(0, 60)}）→ 重试`)
      await new Promise((r) => setTimeout(r, 3000))
    }
    return null
  }

  // 1. 生成 React 待办应用 → v1
  const email = `p1a${Date.now().toString(36)}@jlcoding.dev`
  let res = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  res = await fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ name: 'P1 版本冒烟' }),
  })
  const pid = (await res.json()).id
  console.log(`\n--- 项目 ${pid.slice(-6)}：生成 v1（React 待办） ---`)

  let ev = await analyzeWithRetry(pid, '做一个极简待办应用，React 网页版，支持添加和完成', cookie, 'v1')
  if (!ev) throw new Error('v1 分析三次失败')
  const runProvider = (ev.find((e) => e.type === 'run_started')?.provider ?? '').startsWith('opencode:') ? 'opencode' : 'mock'
  console.log(`  ｜ 生成路径：${runProvider === 'mock' ? 'Mock（额度受限）' : '真实模型（Zen）'}—— Mock 下跳过模型依赖断言，机制断言全保留`)

  let tries = 0
  do {
    tries++
    ev = await sse(pid, { phase: 'continue', model }, cookie)
    if (!ev.some((e) => e.type === 'complete') && tries < 3) await new Promise((r) => setTimeout(r, 3000))
  } while (!ev.some((e) => e.type === 'complete') && tries < 3)
  ok('v1 complete', ev.some((e) => e.type === 'complete'), `${tries} 次尝试`)
  let v1 = ev.find((e) => e.type === 'version_created')
  ok('v1 version_created 事件（version=1）', v1?.version === 1, v1 ? `sha=${v1.sha.slice(0, 8)}` : '未收到')

  let detail = await detailOf(pid, cookie)
  let vs = await versionsOf(pid, cookie)
  ok('版本列表 v1（初始化生成 + provider 记录）',
    vs.length === 1 && vs[0].version === 1 && /初始化/.test(vs[0].summary) &&
    String(vs[0].provider).startsWith(runProvider === 'mock' ? 'mock' : 'opencode:'))
  ok('v1 事件 sha == 列表 sha == 详情文件哈希（三方一致）',
    v1.sha === vs[0].sha && v1.sha === filesSha(detail.files),
    `event=${v1.sha.slice(0, 8)} list=${vs[0].sha.slice(0, 8)} files=${filesSha(detail.files).slice(0, 8)}`)

  // 2. 增量修改轮 → v2（版本递增、SHA 变化、内容级不变断言）
  console.log('--- 增量修改轮 → v2 ---')
  const filesBefore = Object.fromEntries(detail.files.map((f) => [f.path, f.content]))
  ev = await analyzeWithRetry(pid, '给每个待办加一个删除按钮，并在底部显示已完成数量', cookie, 'v2')
  if (!ev) throw new Error('v2 分析三次失败')
  tries = 0
  do {
    tries++
    ev = await sse(pid, { phase: 'continue', model }, cookie)
    if (!ev.some((e) => e.type === 'complete') && tries < 3) await new Promise((r) => setTimeout(r, 3000))
  } while (!ev.some((e) => e.type === 'complete') && tries < 3)
  ok('修改轮 complete', ev.some((e) => e.type === 'complete'))
  const v2 = ev.find((e) => e.type === 'version_created')
  ok('v2 version_created（version=2）', v2?.version === 2, v2 ? `sha=${v2.sha.slice(0, 8)}` : '未收到')
  ok(runProvider === 'opencode' ? 'v2 sha 变化（增量修改真实生效）' : 'Mock v2 sha 确定性不变（预置文件一致）',
    runProvider === 'opencode' ? v2.sha !== v1.sha : v2.sha === v1.sha)

  detail = await detailOf(pid, cookie)
  const filesAfter = Object.fromEntries(detail.files.map((f) => [f.path, f.content]))
  if (runProvider === 'opencode') {
    const changed = Object.keys(filesAfter).filter((p) => sha256(filesAfter[p]) !== sha256(filesBefore[p] ?? ''))
    const untouched = Object.keys(filesAfter).filter((p) => filesBefore[p] !== undefined && sha256(filesAfter[p]) === sha256(filesBefore[p]))
    console.log(`  ｜ 文件变更：改动 ${changed.length} 个（${changed.join(', ')}），内容不变 ${untouched.length} 个（内容级哈希比对）`)
    ok('增量改动面 < 全部文件（不整项目重写）', changed.length > 0 && changed.length < Object.keys(filesAfter).length, `${changed.length}/${Object.keys(filesAfter).length}`)
  } else {
    const identical = Object.keys(filesAfter).every((p) => filesBefore[p] !== undefined && sha256(filesAfter[p]) === sha256(filesBefore[p]))
    ok('Mock 增量轮：文件内容确定性一致（哈希自校验）', identical)
  }

  // 3. 越权：B 账号 versions / rollback 403
  const resB = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `p1b${Date.now().toString(36)}@jlcoding.dev`, password }),
  })
  const cookieB = (resB.headers.get('set-cookie') ?? '').split(';')[0]
  const vB = (await fetch(`${base}/api/projects/${pid}/versions`, { headers: { cookie: cookieB } })).status
  const rbB = (await fetch(`${base}/api/projects/${pid}/versions/1/rollback`, { method: 'POST', headers: { cookie: cookieB } })).status
  ok('越权：B 账号 versions/rollback 403', vB === 403 && rbB === 403, `versions=${vB} rollback=${rbB}`)

  // 4. 回滚到 v1（append-only：产生 v3，文件集哈希必须精确等于 v1）
  console.log('--- 回滚 v1 → v3 ---')
  res = await fetch(`${base}/api/projects/${pid}/versions/1/rollback`, { method: 'POST', headers: { cookie } })
  const rb = await res.json()
  ok('回滚 200 且产生新版本 v3', res.status === 200 && rb.version === 3 && rb.rolledBackFrom === 1, `v${rb.version} sha=${String(rb.sha).slice(0, 8)}`)
  detail = await detailOf(pid, cookie)
  ok('回滚后文件集哈希 == v1（真实回滚，非指针切换）', filesSha(detail.files) === v1.sha,
    `now=${filesSha(detail.files).slice(0, 8)} v1=${v1.sha.slice(0, 8)}`)
  vs = await versionsOf(pid, cookie)
  ok('版本历史 append-only（v3/v2/v1 全保留）', vs.length === 3 && vs.map((x) => x.version).join(',') === '3,2,1')
  ok('回滚条目摘要标注来源', /回滚自 v1/.test(vs[0].summary))

  // 5. 部署（React）：/app/:id 从 404 → 200 自包含 HTML
  console.log('--- 部署 ---')
  let appRes = await fetch(`${base}/app/${pid}`)
  ok('部署前 /app/:id 404', appRes.status === 404)
  res = await fetch(`${base}/api/projects/${pid}/deploy`, { method: 'POST', headers: { cookie } })
  const dep = await res.json()
  ok('deploy 200 且返回 url + 64 位 SHA + 入口', res.status === 200 && dep.url === `/app/${pid}` && /^[0-9a-f]{64}$/.test(dep.sha ?? '') && /\.(js|jsx)$/.test(dep.entry ?? ''), `sha=${String(dep.sha).slice(0, 8)} entry=${dep.entry}`)
  appRes = await fetch(`${base}/app/${pid}`)
  const html = await appRes.text()
  ok('/app/:id 200 且为自包含 HTML（root 挂载点 + 内联 bundle）',
    appRes.status === 200 && /text\/html/.test(appRes.headers.get('content-type') ?? '') && html.includes('id="root"') && html.includes('<script>'),
    `${html.length} 字节`)
  ok('部署 HTML 内含 react 运行时（bundle 自包含，无外部依赖）', /react|useState|jsx/i.test(html))

  // 6. 部署范围：Python 项目明确拒绝（400，说明性错误）——需要真实模型生成 Python，Mock 下跳过
  if (runProvider === 'mock') {
    console.log('--- Python 部署范围：Mock 路径跳过（需真实模型；由 test-python.cjs + 本节复跑覆盖） ---')
  } else {
    console.log('--- Python 部署范围 ---')
    res = await fetch(`${base}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ name: 'P1 Python' }),
    })
    const pyid = (await res.json()).id
    ev = await analyzeWithRetry(pyid, '用 Python 做一个 BMI 计算器，输入身高体重输出 BMI 和建议', cookie, 'py')
    if (ev) {
      tries = 0
      do {
        tries++
        ev = await sse(pyid, { phase: 'continue', model }, cookie)
        if (!ev.some((e) => e.type === 'complete') && tries < 3) await new Promise((r) => setTimeout(r, 3000))
      } while (!ev.some((e) => e.type === 'complete') && tries < 3)
      const pyDetail = await detailOf(pyid, cookie)
      ok('Python 项目生成完成（明确指定 Python）', pyDetail.files.some((f) => f.path.endsWith('.py')))
      res = await fetch(`${base}/api/projects/${pyid}/deploy`, { method: 'POST', headers: { cookie } })
      const pyDep = await res.json()
      ok('Python 部署如实拒绝 400（范围仅限 React）', res.status === 400 && /Python/.test(pyDep.error ?? ''), String(pyDep.error ?? '').slice(0, 40))
    }
  }

  console.log(`\n=== P1 冒烟 ${fail === 0 ? `全部通过 ✓（${pass} 项）` : `失败 ✗（${fail}/${pass + fail} 项）`} ===`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
