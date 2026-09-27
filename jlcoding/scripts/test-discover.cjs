// 「发现」模块验证：发布 → 公开列表（作者/脱敏邮箱）→ B 与匿名只读 ✓ → B 写操作 403 ✓ → 取消发布
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const MODEL = 'deepseek-v4.1-flash'

async function main() {
  let pass = 0, fail = 0
  const ok = (n, c, e = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS ✓' : 'FAIL ✗'} ${n}${e ? '  ｜ ' + e : ''}`) }
  const reg = async (tag) => {
    const r = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${tag}${Date.now().toString(36)}@jlcoding.dev`, password: 'test123456' }) })
    return (r.headers.get('set-cookie') ?? '').split(';')[0]
  }
  const sse = async (pid, body, cookie) => {
    const r = await fetch(`${BASE}/api/projects/${pid}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) })
    if (!r.ok) throw new Error(`chat ${r.status}`)
    const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = ''; const evs = []
    while (true) { const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); const ls = buf.split('\n'); buf = ls.pop() ?? ''; for (const l of ls) if (l.startsWith('data: ')) { try { evs.push(JSON.parse(l.slice(6))) } catch {} } }
    return evs
  }

  // A 注册 + 生成一个小应用 + 发布
  const cookieA = await reg('disA')
  const emailA = (await (await fetch(`${BASE}/api/auth/me`, { headers: { cookie: cookieA } })).json()).user?.email
  let res = await fetch(`${BASE}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookieA }, body: JSON.stringify({ name: '发现验证-待办' }) })
  const pid = (await res.json()).id
  let ev = null
  for (let i = 1; i <= 3; i++) { ev = await sse(pid, { message: '做一个极简待办应用', phase: 'analyze', model: MODEL }, cookieA); if (ev.some((e) => e.type === 'awaiting_confirmation')) break }
  let tries = 0
  do { tries++; ev = await sse(pid, { phase: 'continue', model: MODEL }, cookieA); if (!ev.some((e) => e.type === 'complete') && tries < 3) await new Promise((r) => setTimeout(r, 3000)) } while (!ev.some((e) => e.type === 'complete') && tries < 3)
  ok('A 生成完成（可发布前提）', ev.some((e) => e.type === 'complete'))

  // 未发布时：B 无法访问
  const cookieB = await reg('disB')
  ok('未发布：B 访问 detail 403', (await fetch(`${BASE}/api/projects/${pid}`, { headers: { cookie: cookieB } })).status === 403)
  ok('未发布：匿名访问 detail 401', (await fetch(`${BASE}/api/projects/${pid}`)).status === 401)

  // 发布
  res = await fetch(`${BASE}/api/projects/${pid}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookieA }, body: JSON.stringify({ published: true }) })
  const pub = await res.json()
  ok('A 发布成功', res.status === 200 && pub.published === true, `publishedAt=${String(pub.publishedAt).slice(0, 19)}`)
  ok('非 owner 发布被拒（403）', (await fetch(`${BASE}/api/projects/${pid}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookieB }, body: JSON.stringify({ published: true }) })).status === 403)

  // 发现列表（公开）
  const list = await (await fetch(`${BASE}/api/discover`)).json()
  const item = Array.isArray(list) ? list.find((x) => x.id === pid) : null
  ok('发现列表（无需登录）含该项目', Boolean(item), `共 ${Array.isArray(list) ? list.length : '?'} 项`)
  ok('列表展示发布者（用户名 + 脱敏邮箱）', Boolean(item?.author?.name) && /\*{3}/.test(item?.author?.maskedEmail ?? ''), item ? `${item.author.name}（${item.author.maskedEmail}）` : '-')
  ok('列表含规模统计（对话/版本/文件）', item && item.rounds > 0 && item.files > 0 && item.versions > 0, item ? `${item.rounds} 对话 / ${item.versions} 版本 / ${item.files} 文件` : '-')

  // 已发布：B 与匿名只读可访问
  const bDetail = await fetch(`${BASE}/api/projects/${pid}`, { headers: { cookie: cookieB } })
  const bBody = await bDetail.json()
  ok('已发布：B 可读 detail（viewerIsOwner=false）', bDetail.status === 200 && bBody.viewerIsOwner === false && bBody.messages.length > 0)
  ok('已发布：匿名可读 detail + 匿名非 owner', (await fetch(`${BASE}/api/projects/${pid}`)).status === 200)
  ok('已发布：B 可读 versions / files / ZIP', (await fetch(`${BASE}/api/projects/${pid}/versions`, { headers: { cookie: cookieB } })).status === 200 && (await fetch(`${BASE}/api/projects/${pid}/files`, { headers: { cookie: cookieB } })).status === 200 && (await fetch(`${BASE}/api/projects/${pid}/download`, { headers: { cookie: cookieB } })).status === 200)
  const zipB = Buffer.from(await (await fetch(`${BASE}/api/projects/${pid}/download`, { headers: { cookie: cookieB } })).arrayBuffer())
  ok('已发布：ZIP 内容合法（PK 头）', zipB.slice(0, 2).toString() === 'PK', `${zipB.length} bytes`)

  // 已发布：写操作仍 owner-only
  const writes = [
    ['POST chat', `/api/projects/${pid}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookieB }, body: JSON.stringify({ message: 'x', phase: 'analyze' }) }],
    ['POST rollback', `/api/projects/${pid}/versions/1/rollback`, { method: 'POST', headers: { cookie: cookieB } }],
    ['POST deploy', `/api/projects/${pid}/deploy`, { method: 'POST', headers: { cookie: cookieB } }],
    ['DELETE project', `/api/projects/${pid}`, { method: 'DELETE', headers: { cookie: cookieB } }],
  ]
  for (const [name, path, init] of writes) {
    const s = (await fetch(`${BASE}${path}`, init)).status
    ok(`已发布：B 写操作被拒（${name} → 403）`, s === 403, `status=${s}`)
  }

  // 取消发布
  res = await fetch(`${BASE}/api/projects/${pid}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookieA }, body: JSON.stringify({ published: false }) })
  ok('A 取消发布', res.status === 200 && (await res.json()).published === false)
  const list2 = await (await fetch(`${BASE}/api/discover`)).json()
  ok('取消后：发现列表不再包含', !(Array.isArray(list2) && list2.some((x) => x.id === pid)))
  ok('取消后：B 访问 detail 恢复 403', (await fetch(`${BASE}/api/projects/${pid}`, { headers: { cookie: cookieB } })).status === 403)

  // 清理
  await fetch(`${BASE}/api/projects/${pid}`, { method: 'DELETE', headers: { cookie: cookieA } })
  await db.$disconnect()
  console.log(`\n=== 「发现」模块验证 ${fail === 0 ? `全部通过 ✓（${pass} 项）` : `失败 ✗（${fail} 项）`} ===`)
  process.exit(fail === 0 ? 0 : 1)
}
main().catch(async (e) => { console.error('失败:', e.message); await db.$disconnect(); process.exit(1) })
