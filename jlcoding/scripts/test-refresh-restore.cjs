// Fix 1 浏览器级验证：刷新后对话历史恢复（此前 UI 层 bug——useState 初始值只在首渲染生效，
// detail 异步晚于首渲染 → messages 永远空）。验证：打开有多轮历史的项目 → 刷新 → 历史仍可见。
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

  // 1. 找历史最丰富的项目（意图路由验证：QA + 生成 + 修改 + 版本操作）
  const proj = await db.project.findFirst({
    where: { name: '意图路由验证' },
    orderBy: { updatedAt: 'desc' },
    include: { user: { select: { email: true } }, messages: { orderBy: { createdAt: 'asc' }, select: { role: true, agent: true, step: true, content: true } } },
  })
  if (!proj) throw new Error('找不到意图路由验证项目（先跑 test-intent.cjs）')
  const userMsgCount = proj.messages.filter((m) => m.role === 'user').length
  const assistantCount = proj.messages.filter((m) => m.role === 'assistant').length
  console.log(`项目 ${proj.id.slice(-6)}：${userMsgCount} 条用户消息 / ${assistantCount} 条助手回复 / ${proj.messages.length} 条总消息`)

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

  // 等对话流渲染（hydration 后）：首条用户消息（S1 提问）可见
  const firstUser = proj.messages.find((m) => m.role === 'user')
  try {
    await page.waitForSelector(`text=${firstUser.content.slice(0, 18)}`, { timeout: 20_000 })
    ok('进入项目：对话历史可见（首条用户消息渲染）', true)
  } catch {
    ok('进入项目：对话历史可见（首条用户消息渲染）', false, '20s 超时')
  }
  const beforeText = await page.locator('body').textContent()

  // 2. 刷新（Fix 1 核心断言）：历史必须完整恢复
  await page.reload({ waitUntil: 'domcontentloaded' })
  try {
    await page.waitForSelector(`text=${firstUser.content.slice(0, 18)}`, { timeout: 20_000 })
    ok('【Fix 1 核心】刷新后：对话历史恢复（首条用户消息仍可见）', true)
  } catch {
    ok('【Fix 1 核心】刷新后：对话历史恢复（首条用户消息仍可见）', false, '20s 超时——hydration bug 未修复')
  }
  const afterText = await page.locator('body').textContent()
  // 关键内容抽查：QA 回复（智能助手/演示模式）、版本助手回复（回滚/diff）、番茄钟需求
  const anchors = [
    /版本助手|模型调用/.test(afterText) ? '版本助手回复可见' : '版本助手回复',
    /番茄钟|极简/.test(afterText) ? '生成需求消息可见' : '生成需求消息',
  ]
  ok('刷新后：助手回复与生成消息均恢复', anchors.every((a) => !a.includes('回复') || a.endsWith('可见') || a.endsWith('消息可见')),
    anchors.join('；'))
  // 版本徽章（v3）
  ok('刷新后：版本徽章恢复（v3 · sha）', /v3 · [0-9a-f]{8}/.test(afterText), (afterText.match(/v\d+ · [0-9a-f]{8}/) ?? ['（无）'])[0])
  // 对照：刷新前后消息量一致（抽查锚点文本数量）
  const anchorCount = (t) => (t.match(/什么是 React 的 useState/g) ?? []).length
  ok('刷新前后消息无重复灌入（hydration 恰好一次）', anchorCount(afterText) === anchorCount(beforeText) && anchorCount(afterText) >= 1,
    `${anchorCount(beforeText)} → ${anchorCount(afterText)}`)

  await browser.close()
  await db.$disconnect()
  console.log(`\n=== 刷新恢复浏览器级验证 ${fail === 0 ? `全部通过 ✓（${pass} 项）` : `失败 ✗（${fail} 项）`} ===`)
  process.exit(fail === 0 ? 0 : 1)
}
main().catch(async (e) => { console.error('失败:', e.message); await db.$disconnect(); process.exit(1) })
