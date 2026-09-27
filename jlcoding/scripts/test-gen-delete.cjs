// 验证：删除 API 级联 + 新默认模型（deepseek-v4.1-flash）完整生成计算器（全流程畅通）
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const MODEL = 'deepseek-v4.1-flash'

async function main() {
  let pass = 0, fail = 0
  const ok = (n, c, e = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS ✓' : 'FAIL ✗'} ${n}${e ? '  ｜ ' + e : ''}`) }

  const sse = async (pid, body, cookie) => {
    const r = await fetch(`${BASE}/api/projects/${pid}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) })
    if (!r.ok) throw new Error(`chat ${r.status}: ${(await r.text()).slice(0, 150)}`)
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = ''; const evs = []
    while (true) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop() ?? ''; for (const l of lines) if (l.startsWith('data: ')) { try { evs.push(JSON.parse(l.slice(6))) } catch {} } }
    return evs
  }

  // 注册测试账号
  const email = `wk${Date.now().toString(36)}@jlcoding.dev`
  let res = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test123456' }) })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  ok('注册测试账号', res.status === 201, email)

  // 生成计算器（新默认模型）
  res = await fetch(`${BASE}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ name: '编写一个计算器' }) })
  const pid = (await res.json()).id
  console.log(`\n--- 生成「编写一个计算器」（${MODEL}）---`)
  let ev = null
  for (let i = 1; i <= 3; i++) {
    ev = await sse(pid, { message: '编写一个计算器', phase: 'analyze', model: MODEL }, cookie)
    if (ev.some((e) => e.type === 'awaiting_confirmation')) break
    console.log(`  ｜ 第 ${i} 次分析失败（${(ev.find((e) => e.type === 'error')?.message ?? '').slice(0, 70)}）→ 重试`)
    await new Promise((r) => setTimeout(r, 3000))
  }
  ok('业务分析师阶段成功（不再 No output generated）', ev.some((e) => e.type === 'awaiting_confirmation') && !ev.some((e) => e.type === 'error'))
  const rs = ev.find((e) => e.type === 'run_started')
  ok('run_started 模型 = v4.1-flash', rs?.model === MODEL, rs?.model)

  let tries = 0
  do { tries++; ev = await sse(pid, { phase: 'continue', model: MODEL }, cookie); if (!ev.some((e) => e.type === 'complete') && tries < 3) await new Promise((r) => setTimeout(r, 3000)) } while (!ev.some((e) => e.type === 'complete') && tries < 3)
  ok('生成 complete', ev.some((e) => e.type === 'complete'), `${tries} 次尝试`)
  const detail = await (await fetch(`${BASE}/api/projects/${pid}`, { headers: { cookie } })).json()
  ok('计算器文件生成（React）', detail.files.length >= 3 && detail.files.some((f) => f.path === 'package.json'), `${detail.files.length} 文件`)
  const v1 = ev.find((e) => e.type === 'version_created')
  ok('版本 v1 快照', v1?.version === 1, v1 ? v1.sha.slice(0, 8) : '-')

  // 部署（可线上使用）
  res = await fetch(`${BASE}/api/projects/${pid}/deploy`, { method: 'POST', headers: { cookie } })
  const dep = await res.json()
  ok('可部署（线上使用链接）', res.status === 200 && /^[0-9a-f]{64}$/.test(dep.sha ?? ''), `/app/${pid}`)

  // ---------- 删除 API 验证（级联） ----------
  console.log('\n--- 删除 API（级联清理）---')
  const before = { msg: await db.message.count({ where: { projectId: pid } }), file: await db.file.count({ where: { projectId: pid } }), ver: await db.projectVersion.count({ where: { projectId: pid } }), dep: await db.deploy.count({ where: { projectId: pid } }) }
  const unauth = await fetch(`${BASE}/api/projects/${pid}`, { method: 'DELETE' })
  ok('未登录删除 401（项目存在时先验证权限）', unauth.status === 401, `status=${unauth.status}`)
  const del = await fetch(`${BASE}/api/projects/${pid}`, { method: 'DELETE', headers: { cookie } })
  const delBody = await del.json()
  ok('删除 200 + 返回级联统计', del.status === 200 && delBody.ok === true, JSON.stringify(delBody.deleted))
  ok('项目已删除', !(await db.project.findUnique({ where: { id: pid } })))
  ok('级联：消息/文件/版本/部署全清', (await db.message.count({ where: { projectId: pid } })) === 0 && (await db.file.count({ where: { projectId: pid } })) === 0 && (await db.projectVersion.count({ where: { projectId: pid } })) === 0 && (await db.deploy.count({ where: { projectId: pid } })) === 0, before && `原 ${JSON.stringify(before)}`)
  ok('删除后 /app/:id 404', (await fetch(`${BASE}/app/${pid}`)).status === 404)
  ok('删除后再删 → 404（项目不存在）', (await fetch(`${BASE}/api/projects/${pid}`, { method: 'DELETE', headers: { cookie } })).status === 404)

  console.log(`\n=== 生成+删除验证 ${fail === 0 ? `全部通过 ✓（${pass} 项）` : `失败 ✗（${fail} 项）`} ===`)
  await db.$disconnect()
  process.exit(fail === 0 ? 0 : 1)
}
main().catch(async (e) => { console.error('失败:', e.message); await db.$disconnect(); process.exit(1) })
