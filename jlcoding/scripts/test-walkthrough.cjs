// 全流程 walkthrough（Playwright + Edge）：首页输入需求 → （已登录）自动建项目进会话 → 确认 → 生成完成
// → 中间画布/版本徽章/对话历史 → 刷新 → 回首页侧栏点开项目（直接进入查看）→ 历史恢复
// → 侧栏删除项目（内联二次确认）→ 列表消失
// 登录方式：API 注册拿 cookie 注入浏览器（登录卡 UI 非本次验证重点，避免选择器脆弱）
// 运行前提：dev 服务 + 真实模型可用（deepseek-v4.1-flash）
const { chromium } = require('playwright')
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const base = process.env.BASE_URL || 'http://localhost:3000'
  let pass = 0, fail = 0
  const ok = (n, c, e = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS ✓' : 'FAIL ✗'} ${n}${e ? '  ｜ ' + e : ''}`) }

  // 0. API 注册拿会话 cookie（注入浏览器 = 已登录状态）
  const email = `wk${Date.now().toString(36)}@jlcoding.dev`
  const reg = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test123456' }),
  })
  ok('注册账号', reg.status === 201, email)
  const token = (reg.headers.get('set-cookie') ?? '').split(';')[0].split('=').slice(1).join('=')

  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] })
  const ctx = await browser.newContext()
  await ctx.addCookies([{ name: 'jlcoding_session', value: token, url: base }])
  const page = await ctx.newPage()

  // 1. 首页输入需求 → 开始生成（已登录 → 直接建项目进会话）
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('textarea', { timeout: 30_000 })
  await page.click('textarea')
  await page.type('textarea', '编写一个计算器', { delay: 25 })
  await page.click('button:has-text("开始生成")')

  // 2. 自动进入项目页 → 等确认卡片
  try {
    await page.waitForURL(/\/project\//, { timeout: 30_000 })
    ok('开始生成 → 自动进入项目会话', true)
  } catch {
    ok('开始生成 → 自动进入项目会话', false, page.url().slice(-30))
  }
  let reachedConfirm = false
  try {
    await page.waitForSelector('text=需求确认', { timeout: 120_000 })
    reachedConfirm = true
    ok('需求确认卡片出现', true)
    await page.click('button:has-text("确认，开始生成")')
  } catch {
    ok('需求确认卡片出现', false, '120s 超时')
  }

  // 3. 等生成完成（TopBar「已就绪」徽章——注意：「预览就绪」是进度条静态步骤文案，不能作为完成标志）
  let done = false
  if (reachedConfirm) {
    try {
      await page.waitForFunction(
        () => {
          const t = document.body.textContent || ''
          return t.includes('已就绪') && !t.includes('构建中')
        },
        { timeout: 420_000 }
      )
      done = true
      ok('生成完成（TopBar 已就绪）', true)
    } catch {
      ok('生成完成（TopBar 已就绪）', false, '420s 超时')
    }
  }

  if (done) {
    // 版本徽章：轮询等待（version_created 事件在 complete 之后到达 + effect 刷新，最多 15s）
    let badge = null
    for (let i = 0; i < 15 && !badge; i++) {
      const t = await page.locator('body').textContent()
      badge = (t.match(/v\d+\s*·\s*[0-9a-f]{8}/) ?? [])[0] ?? null
      if (!badge) await page.waitForTimeout(1000)
    }
    ok('版本徽章出现（vN · sha8）', Boolean(badge), badge ?? '（15s 未出现）')
    const text = await page.locator('body').textContent()
    ok('对话历史含需求消息', text.includes('编写一个计算器'))
    ok('预览工具栏「线上使用」按钮', text.includes('线上使用'))

    // 4. 刷新 → 历史恢复
    await page.reload({ waitUntil: 'domcontentloaded' })
    try {
      await page.waitForSelector('text=编写一个计算器', { timeout: 20_000 })
      ok('刷新后对话历史恢复', true)
    } catch {
      ok('刷新后对话历史恢复', false, '20s 超时')
    }

    // 5. 回首页 → 侧栏点开该项目（直接进入查看）
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=我的项目', { timeout: 20_000 })
    try {
      await page.locator('text=编写一个计算器').first().click({ timeout: 8000 })
      await page.waitForURL(/\/project\//, { timeout: 15_000 })
      await page.waitForSelector('text=编写一个计算器', { timeout: 15_000 })
      ok('侧栏点开项目直接进入查看（历史可见）', true, page.url().slice(-24))
    } catch (e) {
      ok('侧栏点开项目直接进入查看（历史可见）', false, String(e).slice(0, 50))
    }

    // 6. 侧栏删除项目（内联二次确认）
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=我的项目', { timeout: 20_000 })
    const row = page.locator('div.group:has-text("编写一个计算器")').first()
    await row.hover()
    try {
      await page.locator('button[title="删除项目"]').first().click({ force: true })
      await page.waitForSelector('button:has-text("确认删除？")', { timeout: 5000 })
      ok('删除按钮 → 内联二次确认出现', true)
      await page.locator('button:has-text("确认删除？")').first().click({ force: true })
      await page.waitForTimeout(2500)
      const after = await page.locator('body').textContent()
      ok('删除后列表移除该项目', !after.includes('编写一个计算器'))
    } catch (e) {
      ok('删除按钮 → 内联二次确认出现并生效', false, String(e).slice(0, 60))
    }
  }

  await browser.close()
  await db.$disconnect()
  console.log(`\n=== Walkthrough ${fail === 0 ? `全部通过 ✓（${pass} 项）` : `失败 ✗（${fail} 项）`} ===`)
  process.exit(fail === 0 ? 0 : 1)
}
main().catch(async (e) => { console.error('失败:', e.message); await db.$disconnect(); process.exit(1) })
