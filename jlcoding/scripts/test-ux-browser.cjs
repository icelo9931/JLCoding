// UX 浏览器级验证（据用户实测反馈改造后）：
// ① 首轮待确认阶段 = 两栏布局（中间预览画布不出现，与分析时排版一致）
// ② 生成中右侧「模型调用」卡片可见（小白模式进度面板内嵌同源数据）
// ③ 模型下拉每项标注「来源 + 实际调用」+ BYOK 入口；未配置时点击弹设置窗
// 运行前提：dev 服务已启动 + OPENCODE_API_KEY（真实模型路径）
const { chromium } = require('playwright')

async function main() {
  const base = process.env.BASE_URL || 'http://localhost:3000'
  let pass = 0, fail = 0
  const ok = (name, cond, extra = '') => {
    cond ? pass++ : fail++
    console.log(`${cond ? 'PASS ✓' : 'FAIL ✗'} ${name}${extra ? '  ｜ ' + extra : ''}`)
  }

  // 1. 注册 + 新项目（无文件 → 首轮分析/待确认阶段）
  const email = `uxb${Date.now().toString(36)}@jlcoding.dev`
  let res = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test123456' }),
  })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  res = await fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ name: 'UX 浏览器验证' }),
  })
  const pid = (await res.json()).id

  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] })
  const ctx = await browser.newContext()
  await ctx.addCookies([{ name: 'jlcoding_session', value: cookie.split('=')[1], url: base }])
  const page = await ctx.newPage()
  await page.goto(`${base}/project/${pid}`, { waitUntil: 'domcontentloaded' })

  // 2. 提交需求（走 UI 输入框，触发真实分析流）。
  //    交互方式与真实用户一致：先 click 聚焦 + 逐字符键入（每字符触发 React onChange；
  //    fill 一次性改 DOM value 会与受控组件 hydration 竞态导致 state 为空、发送按钮 disabled）
  await page.waitForSelector('text=描述你想要的应用', { timeout: 30_000 })
  await page.click('textarea')
  await page.type('textarea', '做一个极简待办应用', { delay: 30 })
  await page.keyboard.press('Enter')
  // 前端受理确认：用户消息气泡已追加到对话流（Enter 失效则兜底点发送按钮）
  let submitted = false
  try {
    await page.waitForSelector('text=做一个极简待办应用', { timeout: 8000 })
    submitted = true
  } catch { /* 兜底 */ }
  if (!submitted) {
    await page.locator('textarea').locator('..').locator('button').last().click()
    await page.waitForSelector('text=做一个极简待办应用', { timeout: 10_000 })
  }
  ok('需求已通过 UI 提交（用户消息气泡出现）', true, submitted ? 'Enter 直达' : '兜底点击发送')
  // 生成中（分析阶段 running）：右侧进度面板应出现「模型调用」数据
  // （小白模式卡片渲染 detail 行：Provider/Model/Request ID；标题行仅专家模式日志卡片有）
  try {
    await page.waitForSelector('text=Request ID: req_', { timeout: 30_000 })
    ok('生成中：右侧「模型调用」卡片出现（Provider/Model/Request ID）', true)
  } catch {
    ok('生成中：右侧「模型调用」卡片出现（Provider/Model/Request ID）', false, '30s 超时')
  }
  const bodyText = await page.locator('body').textContent()
  ok('模型调用卡片含 Provider / Model', /Provider: OpenCode Go/.test(bodyText) && /Model: deepseek-/.test(bodyText))
  // 生成中：中间画布不出现（两栏布局，无 iframe 预览）
  const iframeDuringRun = await page.locator('iframe').count()
  ok('生成中：中间预览画布未弹出（两栏，与分析排版一致）', iframeDuringRun === 0, `iframe 数=${iframeDuringRun}`)

  // 等分析完成 → 待确认（首轮无文件 → 仍两栏，无 iframe）
  await page.waitForSelector('text=需求确认', { timeout: 90_000 })
  const iframeAwaiting = await page.locator('iframe').count()
  ok('待确认：中间预览画布仍未弹出（排版与分析阶段一致）', iframeAwaiting === 0, `iframe 数=${iframeAwaiting}`)

  // 3. 模型下拉：来源标注 + BYOK 入口
  await page.click('button:has-text("DeepSeek")')
  const dropdownText = await page.locator('body').textContent()
  ok('下拉标注来源（OpenCode Go · 平台额度）', /来源：OpenCode Go（平台额度）/.test(dropdownText))
  ok('下拉标注实际调用 ID', /实际调用：deepseek-/.test(dropdownText))
  ok('下拉含 BYOK 入口（来源：BYOK（用户提供）· 实际调用：待配置）', /BYOK（用户提供）/.test(dropdownText) && /待配置/.test(dropdownText))
  // 点击 BYOK（未配置）→ 弹出设置窗
  await page.click('text=使用我自己的 API Key')
  try {
    await page.waitForSelector('text=我自己的 API Key（BYOK）', { timeout: 10_000 })
    const hasBaseUrl = await page.locator('input[placeholder*="api.deepseek"]').count()
    ok('未配置时点击 BYOK → 弹出配置窗（Base URL / API Key / 模型 ID）', hasBaseUrl >= 1)
  } catch {
    ok('未配置时点击 BYOK → 弹出配置窗（Base URL / API Key / 模型 ID）', false, '10s 未出现')
  }
  await page.keyboard.press('Escape')

  // 4. 确认生成 → complete → 中间画布弹出（三栏 + iframe）——受 Sandpack CDN 波动影响，允许 SKIP
  await page.click('button:has-text("确认，开始生成")')
  let complete = false
  try {
    await page.waitForSelector('text=预览就绪', { timeout: 300_000 })
    complete = true
  } catch { /* 网络波动 */ }
  ok('确认后生成 complete（预览就绪）', complete)
  if (complete) {
    // 三栏布局 + 中间画布弹出（工具栏「线上使用」+ iframe；iframe 受 Sandpack CDN 波动影响容忍 SKIP）
    let iframeCount = 0
    try {
      await page.waitForSelector('iframe', { timeout: 20_000 })
      iframeCount = await page.locator('iframe').count()
      ok('生成完成后：中间预览画布弹出（三栏 + iframe）', iframeCount > 0, `iframe 数=${iframeCount}`)
    } catch {
      console.log('  ⊘ SKIP 生成完成后：iframe 未出现（Sandpack bundler CDN 波动——工具栏与线上使用按钮已验证，部署页为零 CDN 依赖渲染证据，见 test-preview-browser.cjs）')
    }
    const toolText = await page.locator('body').textContent()
    ok('预览工具栏含「线上使用」按钮', /线上使用/.test(toolText))
  }

  await browser.close()
  console.log(`\n=== UX 浏览器级验证 ${fail === 0 ? `全部通过 ✓（${pass} 项）` : `失败 ✗（${fail} 项）`} ===`)
  process.exit(fail === 0 ? 0 : 1)
}
main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
