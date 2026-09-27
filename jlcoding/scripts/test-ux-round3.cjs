// 第三轮反馈的浏览器级验证：① 无 mock 横幅（真实模式）② 生成中「暂停」按钮可点 → 状态 paused
// ③ 消息 hover「复制」（已复制反馈）④ 用户消息「修改重发」（内容填入输入框）
// 运行前提：dev 服务 + 库中存在带历史的项目（先跑 test-intent.cjs）
const { chromium } = require('playwright')
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const base = process.env.BASE_URL || 'http://localhost:3000'
  let pass = 0, fail = 0
  const ok = (name, cond, extra = '') => {
    cond ? pass++ : fail++
    console.log(`${cond ? 'PASS ✓' : 'FAIL ✗'} ${name}${extra ? '  ｜ ' + extra : ''}`)
  }

  // 找带历史的项目 + owner 登录
  const proj = await db.project.findFirst({
    where: { name: '意图路由验证' },
    orderBy: { updatedAt: 'desc' },
    include: { user: { select: { email: true } }, messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!proj) throw new Error('找不到意图路由验证项目（先跑 test-intent.cjs）')
  // 供修改重发断言用的首条用户消息
  const firstUserMsg = proj.messages.find((m) => m.role === 'user')?.content ?? ''
  console.log(`项目 ${proj.id.slice(-6)}：${proj.messages.length} 条消息，首条用户消息「${firstUserMsg.slice(0, 20)}…」`)

  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: proj.user.email, password: 'test123456' }),
  })
  if (login.status !== 200) throw new Error('owner 登录失败')
  const token = (login.headers.get('set-cookie') ?? '').split(';')[0].split('=').slice(1).join('=')

  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] })
  const ctx = await browser.newContext()
  await ctx.addCookies([{ name: 'jlcoding_session', value: token, url: base }])
  const page = await ctx.newPage()
  await page.goto(`${base}/project/${proj.id}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('text=描述你想要的应用', { timeout: 30_000 }).catch(() => {})

  // ① 无 mock 横幅（真实模式）
  const bodyText = await page.locator('body').textContent()
  ok('① 无 mock 横幅（真实模式，不是演示模式）', !/演示模式（平台未配置真实模型/.test(bodyText))

  // ③ 消息「复制」：hover 用户消息 → 点复制 → 出现「已复制」反馈
  const userBubble = page.locator(`text=${firstUserMsg.slice(0, 16)}`).first()
  await userBubble.hover()
  const copyBtn = page.locator('button:has-text("复制")').first()
  try {
    await copyBtn.waitFor({ state: 'attached', timeout: 5000 })
    await copyBtn.click({ force: true })
    await page.waitForSelector('text=已复制', { timeout: 3000 })
    ok('③ 消息「复制」按钮出现且点击有「已复制」反馈', true)
  } catch (e) {
    ok('③ 消息「复制」按钮出现且点击有「已复制」反馈', false, String(e).slice(0, 60))
  }

  // ④ 用户消息「修改重发」：点击后内容填入输入框
  try {
    const editBtn = page.locator('button:has-text("修改重发")').first()
    await editBtn.waitFor({ state: 'attached', timeout: 5000 })
    await editBtn.click({ force: true })
    const val = await page.locator('textarea').first().inputValue()
    ok('④ 「修改重发」点击后内容填入输入框', val.includes(firstUserMsg.slice(0, 12)), `输入框=「${val.slice(0, 24)}…」`)
    // 清空输入框，避免影响后续暂停测试
    await page.locator('textarea').first().fill('')
  } catch (e) {
    ok('④ 「修改重发」点击后内容填入输入框', false, String(e).slice(0, 60))
  }

  // ② 生成中「暂停」按钮：提交一个 CODE 需求（分析阶段耗时足够观察）→ 面板内暂停按钮出现 → 点击 → 状态 paused
  console.log('\n--- ② 生成中暂停 ---')
  await page.click('textarea')
  await page.type('textarea', '做一个简单的待办清单应用', { delay: 25 })
  await page.keyboard.press('Enter')
  try {
    await page.waitForSelector('button:has-text("暂停")', { timeout: 20_000 })
    const pauseBtns = await page.locator('button:has-text("暂停")').count()
    ok('② 生成中「暂停」按钮出现（面板内 + 顶栏）', pauseBtns >= 1, `${pauseBtns} 个`)
    // 点面板内的暂停（第一个匹配即面板内按钮）
    await page.locator('button:has-text("暂停")').last().click({ force: true })
    // 状态收敛：顶栏出现「已暂停」或分析中止
    await page.waitForSelector('text=已暂停', { timeout: 15_000 })
    ok('② 点击暂停后状态变为「已暂停」', true)
    // DB 状态确认（analysis 阶段中止 → pipelineStarted=true → paused 落库）
    await new Promise((r) => setTimeout(r, 2500))
    const refreshed = await db.project.findUnique({ where: { id: proj.id }, select: { status: true } })
    ok('② 服务端状态落库 paused（可断点续跑）', refreshed.status === 'paused', `status=${refreshed.status}`)
  } catch (e) {
    ok('② 生成中「暂停」按钮出现并生效', false, String(e).slice(0, 80))
  }

  await browser.close()
  await db.$disconnect()
  console.log(`\n=== 第三轮反馈浏览器级验证 ${fail === 0 ? `全部通过 ✓（${pass} 项）` : `失败 ✗（${fail} 项）`} ===`)
  process.exit(fail === 0 ? 0 : 1)
}
main().catch(async (e) => { console.error('失败:', e.message); await db.$disconnect(); process.exit(1) })
