// 线上全链路验证（Render）：注册 → 生成（真实模型）→ 发布到发现 → 他人只读 → 写操作 403 → 取消发布
const BASE = process.env.TARGET || 'https://jlcoding.onrender.com'
const MODEL = 'deepseek-v4.1-flash'

async function main() {
  let pass = 0, fail = 0
  const ok = (n, c, e = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS ✓' : 'FAIL ✗'} ${n}${e ? '  ｜ ' + e : ''}`) }
  const ts = () => new Date().toISOString().slice(11, 19)
  console.log(`目标：${BASE}\n`)

  // 0. 平台状态
  const status = await (await fetch(`${BASE}/api/status`)).json()
  ok('平台状态：真实模型 + Zen 端点', status.hasModel === true && /zen\/v1/.test(status.baseUrl), `baseUrl=${status.baseUrl}`)

  const reg = async (tag) => {
    const r = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${tag}${Date.now().toString(36)}@jlcoding.dev`, password: 'test123456' }) })
    return { cookie: (r.headers.get('set-cookie') ?? '').split(';')[0], status: r.status }
  }
  const sse = async (pid, body, cookie) => {
    const r = await fetch(`${BASE}/api/projects/${pid}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) })
    if (!r.ok) throw new Error(`chat ${r.status}: ${(await r.text()).slice(0, 100)}`)
    const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = ''; const evs = []
    while (true) { const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); const ls = buf.split('\n'); buf = ls.pop() ?? ''; for (const l of ls) if (l.startsWith('data: ')) { try { evs.push(JSON.parse(l.slice(6))) } catch {} } }
    return evs
  }

  // 1. 注册 A + 生成
  const A = await reg('liveA')
  ok('注册 A', A.status === 201)
  let res = await fetch(`${BASE}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: A.cookie }, body: JSON.stringify({ name: `线上验证-${new Date().toISOString().slice(5, 16)}` }) })
  const pid = (await res.json()).id
  console.log(`\n[${ts()}] --- 生成（真实模型 ${MODEL}）---`)
  let ev = null
  for (let i = 1; i <= 3; i++) {
    const t0 = Date.now()
    ev = await sse(pid, { message: '做一个极简待办应用，支持添加和完成', phase: 'analyze', model: MODEL }, A.cookie)
    if (ev.some((e) => e.type === 'awaiting_confirmation')) { console.log(`  ｜ 分析完成 ${((Date.now() - t0) / 1000).toFixed(1)}s`); break }
    console.log(`  ｜ 第 ${i} 次分析失败 → 重试`)
    await new Promise((r) => setTimeout(r, 3000))
  }
  ok('业务分析师阶段成功（真实模型）', ev.some((e) => e.type === 'awaiting_confirmation'))
  const rs = ev.find((e) => e.type === 'run_started')
  ok('run_started：provider=opencode + runId', String(rs?.provider).startsWith('opencode:') && String(rs?.runId).startsWith('req_'), `${rs?.provider} ${rs?.runId}`)

  let tries = 0
  do { tries++; const t0 = Date.now(); ev = await sse(pid, { phase: 'continue', model: MODEL }, A.cookie); if (!ev.some((e) => e.type === 'complete')) { console.log(`  ｜ 第 ${tries} 次生成未完成 → 续跑`); await new Promise((r) => setTimeout(r, 3000)) } else console.log(`  ｜ 生成完成 ${((Date.now() - t0) / 1000).toFixed(1)}s`) } while (!ev.some((e) => e.type === 'complete') && tries < 3)
  ok('生成 complete', ev.some((e) => e.type === 'complete'), `${tries} 次`)
  const v1 = ev.find((e) => e.type === 'version_created')
  ok('版本快照 v1', v1?.version === 1, `sha=${v1?.sha?.slice(0, 8)}`)

  // 2. 部署
  res = await fetch(`${BASE}/api/projects/${pid}/deploy`, { method: 'POST', headers: { cookie: A.cookie } })
  const dep = await res.json()
  ok('部署成功（可访问链接）', res.status === 200 && /^[0-9a-f]{64}$/.test(dep.sha ?? ''), `url=${dep.url}`)
  const appRes = await fetch(`${BASE}${dep.url}`)
  ok('/app/:id 公开可访问（无需登录）', appRes.status === 200, `${(await appRes.text()).length} 字节`)

  // 3. 发布到发现
  res = await fetch(`${BASE}/api/projects/${pid}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: A.cookie }, body: JSON.stringify({ published: true }) })
  ok('发布到「发现」', res.status === 200 && (await res.json()).published === true)
  const list = await (await fetch(`${BASE}/api/discover`)).json()
  const item = Array.isArray(list) ? list.find((x) => x.id === pid) : null
  ok('发现列表（匿名）含该项目 + 作者', Boolean(item) && /\*{3}/.test(item.author.maskedEmail), item ? `${item.author.name}（${item.author.maskedEmail}）` : '-')

  // 4. 他人（B）只读 + 写操作 403
  const B = await reg('liveB')
  const bDetail = await fetch(`${BASE}/api/projects/${pid}`, { headers: { cookie: B.cookie } })
  const bBody = await bDetail.json()
  ok('B 只读可读（viewerIsOwner=false）', bDetail.status === 200 && bBody.viewerIsOwner === false)
  ok('匿名只读可读', (await fetch(`${BASE}/api/projects/${pid}`)).status === 200)
  const writes = [
    ['POST chat', `${BASE}/api/projects/${pid}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: B.cookie }, body: JSON.stringify({ message: 'x', phase: 'analyze' }) }],
    ['DELETE project', `${BASE}/api/projects/${pid}`, { method: 'DELETE', headers: { cookie: B.cookie } }],
    ['POST deploy', `${BASE}/api/projects/${pid}/deploy`, { method: 'POST', headers: { cookie: B.cookie } }],
  ]
  for (const [n, url, init] of writes) ok(`B 写操作被拒（${n}）`, (await fetch(url, init)).status === 403)
  ok('B 可下载 ZIP（公开只读）', (await fetch(`${BASE}/api/projects/${pid}/download`, { headers: { cookie: B.cookie } })).status === 200)

  // 5. 取消发布（清理）
  await fetch(`${BASE}/api/projects/${pid}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: A.cookie }, body: JSON.stringify({ published: false }) })
  await fetch(`${BASE}/api/projects/${pid}`, { method: 'DELETE', headers: { cookie: A.cookie } })
  console.log(`\n[${ts()}] 清理完成（取消发布 + 删除测试项目）`)

  console.log(`\n=== 线上全链路验证 ${fail === 0 ? `全部通过 ✓（${pass} 项）` : `失败 ✗（${fail} 项）`} ===`)
  process.exit(fail === 0 ? 0 : 1)
}
main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
