// 验证「追加需求 → 新版本 + 画布更新」与「返回上一版（回滚）」
const { PrismaClient } = require('@prisma/client')
const fs = require('fs'); const path = require('path')
const db = new PrismaClient()
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const MODEL = 'deepseek-v4.1-flash'

async function main() {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').replace(/^\uFEFF/, '')
  process.env.AUTH_SECRET = env.match(/^AUTH_SECRET="?([^"\n]+)"?$/m)?.[1]
  const proj = await db.project.findFirst({ where: { name: '计算器（可交互预览）' }, orderBy: { updatedAt: 'desc' } })
  const user = await db.user.findUnique({ where: { id: proj.userId } })
  const { SignJWT } = require('jose')
  const token = await new SignJWT({ email: user.email, name: user.name }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(process.env.AUTH_SECRET))
  const cookie = `jlcoding_session=${token}`
  const sse = async (body) => {
    const r = await fetch(`${BASE}/api/projects/${proj.id}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) })
    if (!r.ok) throw new Error(`chat ${r.status}: ${(await r.text()).slice(0, 120)}`)
    const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = ''; const evs = []
    while (true) { const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); const ls = buf.split('\n'); buf = ls.pop() ?? ''; for (const l of ls) if (l.startsWith('data: ')) { try { evs.push(JSON.parse(l.slice(6))) } catch {} } }
    return evs
  }
  const versions = await db.projectVersion.findMany({ where: { projectId: proj.id }, orderBy: { version: 'asc' } })
  const before = versions[versions.length - 1]
  console.log(`当前最新版本 v${before?.version}（共 ${versions.length} 版）`)

  console.log('\n--- 追加需求：加入开根号 ---')
  let ev = null
  for (let i = 1; i <= 3; i++) {
    ev = await sse({ message: '给计算器加入开根号（√）功能按钮', phase: 'analyze', model: MODEL })
    if (ev.some((e) => e.type === 'awaiting_confirmation')) break
    console.log(`  ｜ 第 ${i} 次分析失败 → 重试`)
    await new Promise((r) => setTimeout(r, 3000))
  }
  console.log(`  确认卡：${ev.some((e) => e.type === 'awaiting_confirmation') ? '出现' : '未出现'}`)
  let tries = 0
  do { tries++; ev = await sse({ phase: 'continue', model: MODEL }); if (!ev.some((e) => e.type === 'complete') && tries < 3) await new Promise((r) => setTimeout(r, 3000)) } while (!ev.some((e) => e.type === 'complete') && tries < 3)
  console.log(`  生成：${ev.some((e) => e.type === 'complete') ? 'complete' : '失败'}（${tries} 次）`)
  const vNew = ev.find((e) => e.type === 'version_created')
  console.log(`  新版本：v${vNew?.version} sha=${vNew?.sha?.slice(0, 8)}`)
  const filesNow = await db.file.findMany({ where: { projectId: proj.id } })
  const hasSqrt = filesNow.some((f) => /sqrt|开根|√/i.test(f.content))
  console.log(`  新代码含开根号：${hasSqrt ? '有 ✓（说明画布会重编译为最新计算器）' : '未检出'}`)

  console.log('\n--- 返回上一版（回滚到 v' + before.version + '）---')
  const rb = await (await fetch(`${BASE}/api/projects/${proj.id}/versions/${before.version}/rollback`, { method: 'POST', headers: { cookie } })).json()
  console.log(`  回滚：v${before.version} → 新版本 v${rb.version} sha=${String(rb.sha).slice(0, 8)}`)
  const filesRb = await db.file.findMany({ where: { projectId: proj.id } })
  // 判据：回滚后文件集哈希精确等于目标版本（内容级还原），而非关键词
  const crypto = require('crypto')
  const canonical = filesRb.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map((f) => `${f.path}\n${f.content}`).join('\n\n')
  const nowSha = crypto.createHash('sha256').update(canonical).digest('hex')
  const okSha = nowSha === before.sha
  console.log(`  回滚后文件集哈希：${nowSha.slice(0, 8)} vs 目标 v${before.version} ${before.sha.slice(0, 8)} → ${okSha ? '精确还原 ✓' : '不一致 ✗'}`)
  console.log(`  （v${before.version} 本身含开根号=${filesRb.some((f) => /sqrt|开根|√/i.test(f.content))}——回滚目标是该版本，故含开根号属正确）`)
  await db.$disconnect()
}
main().catch(async (e) => { console.error('失败:', e.message); await db.$disconnect(); process.exit(1) })
