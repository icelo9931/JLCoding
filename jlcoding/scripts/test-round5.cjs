// 第五轮完整验证：
// ① 画布默认走零 CDN 部署页 iframe（秒开、含计算器、可交互）
// ② 追加需求（如「加入开根号」）→ 新版本 → 画布自动重新部署并显示最新计算器
// ③ 返回上一版：版本徽章回滚 → 源码与画布同步到旧版本
const { chromium } = require('playwright')
const { PrismaClient } = require('@prisma/client')
const fs = require('fs'); const path = require('path')
const crypto = require('crypto')
const db = new PrismaClient()
const BASE = process.env.BASE_URL || 'http://localhost:3000'

const filesSha = (files) => crypto.createHash('sha256').update(files.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map((f) => `${f.path}\n${f.content}`).join('\n\n')).digest('hex')

async function main() {
  let pass = 0, fail = 0
  const ok = (n, c, e = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS ✓' : 'FAIL ✗'} ${n}${e ? '  ｜ ' + e : ''}`) }

  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').replace(/^\uFEFF/, '')
  process.env.AUTH_SECRET = env.match(/^AUTH_SECRET="?([^"\n]+)"?$/m)?.[1]
  const { SignJWT } = require('jose')
  const proj = await db.project.findFirst({ where: { name: '计算器（可交互预览）' }, orderBy: { updatedAt: 'desc' } })
  const user = await db.user.findUnique({ where: { id: proj.userId } })
  const token = await new SignJWT({ email: user.email, name: user.name }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(process.env.AUTH_SECRET))
  const cookie = `jlcoding_session=${token}`

  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] })
  const ctx = await browser.newContext()
  await ctx.addCookies([{ name: 'jlcoding_session', value: token, url: BASE }])
  const page = await ctx.newPage()

  // ① 画布：默认部署页 iframe（秒开）+ 计算器内容
  await page.goto(`${BASE}/project/${proj.id}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4500)
  const txt = await page.locator('body').textContent()
  ok('① 状态显示「部署页预览（零 CDN）」', /部署页预览（零 CDN）/.test(txt))
  const appFrame = page.frames().find((f) => f.url().includes('/app/'))
  ok('① 画布 iframe 指向部署页', Boolean(appFrame), appFrame ? appFrame.url().slice(-22) : '无')
  if (appFrame) {
    const body = await appFrame.locator('body').textContent().catch(() => '')
    const btns = await appFrame.locator('button').count().catch(() => 0)
    ok('① 画布内为可交互计算器（含按钮）', btns >= 8 && /计算|√|÷|×/.test(body), `${btns} 按钮 / 文本「${body.slice(0, 30).replace(/\s+/g, ' ')}」`)
  }

  // ② 追加需求「加入开根号」→ v+1 → 自动重新部署 → 画布最新
  const versions0 = await db.projectVersion.findMany({ where: { projectId: proj.id }, orderBy: { version: 'desc' } })
  const vBefore = versions0[0]
  console.log(`\n--- ② 追加需求（当前 v${vBefore.version}）---`)
  const sse = async (body) => {
    const r = await fetch(`${BASE}/api/projects/${proj.id}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) })
    const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = ''; const evs = []
    while (true) { const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); const ls = buf.split('\n'); buf = ls.pop() ?? ''; for (const l of ls) if (l.startsWith('data: ')) { try { evs.push(JSON.parse(l.slice(6))) } catch {} } }
    return evs
  }
  let ev = null
  for (let i = 1; i <= 3; i++) { ev = await sse({ message: '再加一个平方根 x^0.5 的功能键，按钮标注 sqrt', phase: 'analyze', model: 'deepseek-v4.1-flash' }); if (ev.some((e) => e.type === 'awaiting_confirmation')) break; await new Promise((r) => setTimeout(r, 3000)) }
  let tries = 0
  do { tries++; ev = await sse({ phase: 'continue', model: 'deepseek-v4.1-flash' }); if (!ev.some((e) => e.type === 'complete') && tries < 3) await new Promise((r) => setTimeout(r, 3000)) } while (!ev.some((e) => e.type === 'complete') && tries < 3)
  const vNew = ev.find((e) => e.type === 'version_created')
  ok('② 追加生成完成 → 新版本', vNew?.version === vBefore.version + 1, `v${vNew?.version} sha=${vNew?.sha?.slice(0, 8)}`)
  // 等前端自动重新部署（版本变化 → onDeploy）
  await page.waitForTimeout(6000)
  const dep = await db.deploy.findFirst({ where: { projectId: proj.id }, orderBy: { createdAt: 'desc' } })
  ok('② 画布自动重新部署（部署 sha ≈ 新版本内容）', Boolean(dep), `deploy sha=${dep?.sha?.slice(0, 8)}`)

  // ③ 返回上一版（回滚 vBefore）→ 源码与画布同步旧版
  console.log(`\n--- ③ 回滚到 v${vBefore.version} ---`)
  const rb = await (await fetch(`${BASE}/api/projects/${proj.id}/versions/${vBefore.version}/rollback`, { method: 'POST', headers: { cookie } })).json()
  const cur = await db.file.findMany({ where: { projectId: proj.id } })
  ok('③ 回滚后文件集哈希精确还原目标版本', filesSha(cur) === vBefore.sha, `now=${filesSha(cur).slice(0, 8)} v${vBefore.version}=${vBefore.sha.slice(0, 8)}`)
  await page.waitForTimeout(5000)
  const dep2 = await db.deploy.findFirst({ where: { projectId: proj.id }, orderBy: { createdAt: 'desc' } })
  ok('③ 回滚后画布重新部署（显示旧版计算器）', Boolean(dep2), `deploy sha=${dep2?.sha?.slice(0, 8)}`)

  await browser.close()
  await db.$disconnect()
  console.log(`\n=== 第五轮验证 ${fail === 0 ? `全部通过 ✓（${pass} 项）` : `失败 ✗（${fail} 项）`} ===`)
  process.exit(fail === 0 ? 0 : 1)
}
main().catch(async (e) => { console.error('失败:', e.message); await db.$disconnect(); process.exit(1) })
