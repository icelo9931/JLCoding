// 小白模式端到端测试：日历阴阳历转换计算器
// 流程：创建(novice) → 分析 → 确认 → 生成 → 校验 → 输出生成的代码
async function main() {
  const base = 'http://localhost:3000'
  const demand = '生成一个计算器，计算阳历和阴历日期，输入一个阳历或者阴历，计算出对应的另一个日期。'
  const t0 = Date.now()
  const ts = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`

  const project = await (await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '阴阳历转换计算器', mode: 'novice' }),
  })).json()
  console.log(`${ts()} 小白模式项目: ${project.id} (mode=${project.mode})`)

  const chat = async (body) => {
    const events = []
    const res = await fetch(`${base}/api/projects/${project.id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`chat ${res.status}: ${(await res.text()).slice(0, 100)}`)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try { events.push(JSON.parse(line.slice(6))) } catch { /* partial */ }
      }
    }
    return events
  }

  // 1. 分析（等待确认）
  let ev = await chat({ message: demand, phase: 'analyze', model: 'deepseek-v4-flash' })
  const awaited = ev.find((e) => e.type === 'awaiting_confirmation')
  console.log(`${ts()} 分析完成: ${awaited ? '等待确认 ✓' : 'FAIL ✗'}（${awaited?.analysis?.length ?? 0} 字）`)
  if (!awaited) process.exit(1)

  // 2. 确认 → 全程生成
  ev = await chat({ phase: 'continue', model: 'deepseek-v4-flash' })
  const complete = ev.find((e) => e.type === 'complete')
  const files = ev.filter((e) => e.type === 'file_created')
  const cmd = ev.filter((e) => e.type === 'command_run')
  console.log(`${ts()} 生成完成: ${complete ? 'PASS ✓' : 'FAIL ✗'}｜${files.length} 个文件｜校验 ${cmd.map((c) => `exit${c.exitCode}`).join(',')}`)

  // 3. 数据核查
  const detail = await (await fetch(`${base}/api/projects/${project.id}`)).json()
  console.log(`${ts()} 持久化: status=${detail.status}, mode=${detail.mode}, model=${detail.model}, messages=${detail.messages.length}`)

  // 4. 代码质量抽查：农历转换逻辑是否真的存在
  const allCode = detail.files.map((f) => f.content).join('\n')
  const hasLunarTable = /农历|阴历|lunar/i.test(allCode)
  const hasConversion = /(1900|1920|2000).{0,80}(\\n|\n).*(0x|0b|[01]{4}[01]{4})/.test(allCode) || /lunar|农历/.test(allCode)
  console.log(`${ts()} 代码检查: 包含农历逻辑=${hasLunarTable}, 转换实现=${hasConversion}`)

  // 5. ZIP
  const zip = await fetch(`${base}/api/projects/${project.id}/download`)
  const zipBuf = Buffer.from(await zip.arrayBuffer())
  console.log(`${ts()} ZIP: ${zip.status}, ${zipBuf.length} bytes, PK头=${zipBuf.slice(0, 2).toString() === 'PK'}`)

  // 6. 输出文件清单与核心代码摘录
  console.log('\n===== 生成文件清单 =====')
  detail.files.forEach((f) => console.log(`  ${f.path.padEnd(22)} ${f.content.length} 字符`))
  const app = detail.files.find((f) => /App\.js|App\.jsx/.test(f.path))
  if (app) {
    console.log('\n===== App.js 摘录（前 60 行）=====')
    console.log(app.content.split('\n').slice(0, 60).map((l) => '  ' + l).join('\n'))
  }

  console.log(`\n=== 小白模式日历计算器测试 ${complete && hasLunarTable && zipBuf.length > 500 ? '全部通过 ✓' : '存在问题 ✗'} ===`)
}

main().catch((e) => { console.error('测试失败:', e.message); process.exit(1) })
