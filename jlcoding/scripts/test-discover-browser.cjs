// 把用户账号的「计算器（可交互预览）」发布到发现 + 浏览器级验证只读视图
const { chromium } = require('playwright')
const { PrismaClient } = require('@prisma/client')
const fs = require('fs'); const path = require('path')
const db = new PrismaClient()
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const EMAIL = 'jl993138486s@gmail.com'

async function main() {
  let pass = 0, fail = 0
  const ok = (n, c, e = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS ✓' : 'FAIL ✗'} ${n}${e ? '  ｜ ' + e : ''}`) }

  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').replace(/^\uFEFF/, '')
  process.env.AUTH_SECRET = env.match(/^AUTH_SECRET="?([^"\n]+)"?$/m)?.[1]
  const { SignJWT } = require('jose')
  const user = await db.user.findUnique({ where: { email: EMAIL } })
  const proj = await db.project.findFirst({ where: { userId: user.id, name: '计算器（可交互预览）' }, orderBy: { updatedAt: 'desc' } })
  if (!proj) throw new Error('找不到计算器项目')
  const token = await new SignJWT({ email: user.email, name: user.name }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt().setExpirationTime('2h').sign(new TextEncoder().encode(process.env.AUTH_SECRET))
  const cookie = `jlcoding_session=${token}`

  // 发布
  let res = await fetch(`${BASE}/api/projects/${proj.id}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ published: true }) })
  ok('发布计算器到「发现」', res.status === 200 && (await res.json()).published === true, proj.name)

  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] })

  // ① 匿名（无 cookie）访问 /discover：应能看到已发布卡片（含作者）
  {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`${BASE}/discover`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    const txt = await page.locator('body').textContent()
    ok('① 发现页（未登录可访问）包含项目卡片', txt.includes('计算器（可交互预览）'), txt.includes('计算器（可交互预览）') ? '' : '未找到卡片')
    ok('① 卡片展示发布者（用户名 + 脱敏邮箱）', /jl993138486s/.test(txt) && /\*{3}/.test(txt), (txt.match(/jl993138486s（[^）]*）/) ?? ['-'])[0])
    ok('① 卡片展示统计（对话/版本/文件）', /条对话/.test(txt) && /个版本/.test(txt) && /个文件/.test(txt))
    // 点卡片 → 只读工作台
    await page.locator('text=计算器（可交互预览）').first().click()
    await page.waitForURL(/\/project\//, { timeout: 15000 })
    await page.waitForTimeout(3500)
    const w = await page.locator('body').textContent()
    ok('① 点开 → 进入项目页', page.url().includes('/project/'), page.url().slice(-16))
    ok('① 只读徽章「只读 · 发布者」', /只读 · 发布者/.test(w), (w.match(/只读 · 发布者[^进]*/) ?? ['-'])[0].slice(0, 40))
    ok('① 只读：无输入框（textarea 数为 0）', (await page.locator('textarea').count()) === 0)
    ok('① 只读：可见多轮对话历史', /给计算器|开根号|计算器/.test(w))
    ok('① 只读：引导条「回到首页开始」', /回到首页开始/.test(w))
    await ctx.close()
  }

  // ② owner 视角：仍可见发布按钮（已发布态）与完整操作
  {
    const ctx = await browser.newContext()
    await ctx.addCookies([{ name: 'jlcoding_session', value: token, url: BASE }])
    const page = await ctx.newPage()
    await page.goto(`${BASE}/project/${proj.id}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    const txt = await page.locator('body').textContent()
    ok('② owner 视角：显示「已发布 · 取消」', /已发布 · 取消/.test(txt))
    ok('② owner 视角：有输入框（可继续编辑）', (await page.locator('textarea').count()) >= 1)
    await ctx.close()
  }

  await browser.close()
  await db.$disconnect()
  console.log(`\n=== 「发现」发布 + 浏览器验证 ${fail === 0 ? `全部通过 ✓（${pass} 项）` : `失败 ✗（${fail} 项）`} ===`)
  console.log(`\n你的账号项目已发布：${BASE}/discover  （点卡片即可只读查看）`)
  process.exit(fail === 0 ? 0 : 1)
}
main().catch(async (e) => { console.error('失败:', e.message); await db.$disconnect(); process.exit(1) })
