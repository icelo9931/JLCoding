// 复核点 4 + 7 专项：恢复矩阵（生成完成刷新 / 退出登录 / 全新浏览器会话重登 → 项目/对话/源码/版本恢复）
// + 越权矩阵（B 账号对 A 项目 detail/files/ZIP/chat/versions/rollback/deploy 全 403，含 ZIP 断言非 zip 流）
// + 生成中客户端断开 → paused → 断点续跑。浏览器内 Preview 真实渲染由 test-preview-browser.cjs 覆盖。
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
  const password = 'test123456'
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
  const detailOf = async (pid, cookie) =>
    (await (await fetch(`${base}/api/projects/${pid}`, { headers: cookie ? { cookie } : {} })))

  // 1. 注册 A + 项目 + 分析确认
  const email = `rs${Date.now().toString(36)}@jlcoding.dev`
  let res = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  res = await fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ name: '恢复矩阵' }),
  })
  const pid = (await res.json()).id
  await sse(pid, { message: '做一个极简待办应用，React 网页版', phase: 'analyze', model }, cookie)

  // 2. 生成中客户端断开（模拟刷新/锁屏）：不等 complete，1.5s 后 abort → 服务端 paused
  console.log('\n--- 生成中断开 → paused → 断点续跑 ---')
  const abortCtrl = new AbortController()
  const r = await fetch(`${base}/api/projects/${pid}/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ phase: 'continue', model }),
    signal: abortCtrl.signal,
  })
  const reader = r.body.getReader()
  const consume = (async () => { try { while (true) { const { done } = await reader.read(); if (done) break } } catch { /* aborted */ } })()
  await new Promise((resolve) => setTimeout(resolve, 1500))
  abortCtrl.abort()
  await consume
  await new Promise((resolve) => setTimeout(resolve, 2500)) // 等服务端 cancel → paused 落库
  let d = await detailOf(pid, cookie)
  let detail = await d.json()
  ok('断开后服务端状态收敛 paused', detail.status === 'paused', `status=${detail.status}`)

  let ev = await sse(pid, { phase: 'continue', model }, cookie)
  ok('断点续跑 complete', ev.some((e) => e.type === 'complete'))
  const v1 = ev.find((e) => e.type === 'version_created')
  detail = await (await detailOf(pid, cookie)).json()
  const readySnapshot = {
    status: detail.status,
    messages: detail.messages.map((m) => [m.role, m.step, m.content.length]),
    filesSha: filesSha(detail.files),
    provider: detail.provider,
    version: v1?.version,
    sha: v1?.sha,
  }
  ok('生成完成 ready + v1 + provider', readySnapshot.status === 'ready' && readySnapshot.version === 1 && String(readySnapshot.provider).startsWith('opencode:'))

  // 3. 刷新恢复（新请求 = 页面刷新所做的事）
  console.log('\n--- 刷新恢复 ---')
  detail = await (await detailOf(pid, cookie)).json()
  ok('刷新后：项目/对话/源码/版本/provider 完整恢复',
    detail.status === 'ready' &&
    detail.messages.length === readySnapshot.messages.length &&
    filesSha(detail.files) === readySnapshot.filesSha &&
    String(detail.provider) === String(readySnapshot.provider))
  const vs = await (await fetch(`${base}/api/projects/${pid}/versions`, { headers: { cookie } })).json()
  ok('刷新后：版本历史恢复（v1 + sha 一致）', vs.length === 1 && vs[0].sha === readySnapshot.sha)

  // 4. 退出登录：浏览器清除 cookie（Max-Age=0）→ 后续请求无 cookie → 401。
  //    说明：JWT 为无状态 30 天令牌，登出靠客户端清 cookie（演示项目标准取舍；
  //    「携带已登出的旧 cookie」等价于被盗令牌场景，不作为断言）
  console.log('\n--- 退出登录 ---')
  const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { cookie } })
  const cleared = (logout.headers.get('set-cookie') ?? '').includes('Max-Age=0')
  const afterLogoutDetail = await detailOf(pid, null) // 退出后的浏览器：无 cookie
  const afterLogoutList = await (await fetch(`${base}/api/projects`)).json()
  ok('退出后：cookie 清除指令 + 无 cookie 详情 401 + 项目列表空', cleared && afterLogoutDetail.status === 401 && Array.isArray(afterLogoutList) && afterLogoutList.length === 0,
    `clear=${cleared} detail=${afterLogoutDetail.status}`)
  const zipUnauth = await fetch(`${base}/api/projects/${pid}/download`)
  ok('退出后：ZIP 401（非 zip 流）', zipUnauth.status === 401 && (zipUnauth.headers.get('content-type') ?? '').includes('json'))

  // 5. 全新浏览器会话（无任何 cookie）重新登录 → 完整恢复
  console.log('\n--- 全新会话重登恢复 ---')
  const relogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const cookie2 = (relogin.headers.get('set-cookie') ?? '').split(';')[0]
  ok('重登 200', relogin.status === 200)
  detail = await (await detailOf(pid, cookie2)).json()
  ok('重登后：项目/对话/源码/provider 完整恢复',
    detail.status === 'ready' &&
    detail.messages.length === readySnapshot.messages.length &&
    filesSha(detail.files) === readySnapshot.filesSha &&
    String(detail.provider) === String(readySnapshot.provider))
  const vs2 = await (await fetch(`${base}/api/projects/${pid}/versions`, { headers: { cookie: cookie2 } })).json()
  ok('重登后：版本恢复', vs2.length === 1 && vs2[0].sha === readySnapshot.sha)
  const dep = await (await fetch(`${base}/api/projects/${pid}/deploy`, { method: 'POST', headers: { cookie: cookie2 } })).json()
  const appHtml = await (await fetch(`${base}/app/${pid}`)).text()
  ok('重登后：可部署 + /app/:id 公开可访问（无需登录）', Boolean(dep.sha) && appHtml.includes('id="root"'), `sha=${String(dep.sha).slice(0, 8)}`)

  // 6. B 账号越权矩阵（复核点 7：含 ZIP 独立断言）
  console.log('\n--- B 账号越权矩阵 ---')
  const resB = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `rsb${Date.now().toString(36)}@jlcoding.dev`, password }),
  })
  const cookieB = (resB.headers.get('set-cookie') ?? '').split(';')[0]
  const cases = [
    ['GET detail', `/api/projects/${pid}`, { headers: { cookie: cookieB } }],
    ['GET files', `/api/projects/${pid}/files`, { headers: { cookie: cookieB } }],
    ['GET ZIP', `/api/projects/${pid}/download`, { headers: { cookie: cookieB } }],
    ['GET versions', `/api/projects/${pid}/versions`, { headers: { cookie: cookieB } }],
    ['POST chat', `/api/projects/${pid}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookieB }, body: JSON.stringify({ message: 'x', phase: 'analyze' }) }],
    ['POST rollback', `/api/projects/${pid}/versions/1/rollback`, { method: 'POST', headers: { cookie: cookieB } }],
    ['POST deploy', `/api/projects/${pid}/deploy`, { method: 'POST', headers: { cookie: cookieB } }],
  ]
  for (const [name, path, init] of cases) {
    const resp = await fetch(`${base}${path}`, init)
    const isJson = (resp.headers.get('content-type') ?? '').includes('json')
    ok(`${name} → 403（JSON 错误而非数据流）`, resp.status === 403 && isJson, `status=${resp.status}`)
  }
  // ZIP 特别断言：响应体不是 zip 二进制
  const zipB = await fetch(`${base}/api/projects/${pid}/download`, { headers: { cookie: cookieB } })
  const zipBody = Buffer.from(await zipB.arrayBuffer())
  ok('B 账号 ZIP 响应体为 JSON 错误（PK 头不存在）', zipBody.slice(0, 2).toString() !== 'PK', `${zipBody.slice(0, 40).toString().slice(0, 40)}`)
  // owner ZIP 正常
  const zipA = Buffer.from(await (await fetch(`${base}/api/projects/${pid}/download`, { headers: { cookie: cookie2 } })).arrayBuffer())
  ok('owner ZIP 正常（PK 头）', zipA.slice(0, 2).toString() === 'PK', `${zipA.length} bytes`)

  console.log(`\n=== 复核点 4+7 恢复/越权矩阵 ${fail === 0 ? `全部通过 ✓（${pass} 项）` : `失败 ✗（${fail} 项）`} ===`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
