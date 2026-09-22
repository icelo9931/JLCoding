// Python 默认语言管线冒烟：不指定语言 → 生成 main.py（tkinter）
async function main() {
  const base = 'http://localhost:3000'
  const t0 = Date.now()
  const ts = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`

  const lg = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'testmuc1vjzd@jlcoding.dev', password: 'test123456' }),
  })
  const cookie = (lg.headers.get('set-cookie') ?? '').split(';')[0]

  const p = await (await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ name: 'BMI计算器', mode: 'novice' }),
  })).json()

  const chat = async (body) => {
    const r = await fetch(`${base}/api/projects/${p.id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(`chat ${r.status}`)
    const reader = r.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const events = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('data: ')) { try { events.push(JSON.parse(line.slice(6))) } catch { /* */ } }
      }
    }
    return events
  }

  // 不指定语言（应默认 Python）
  let ev = await chat({ message: '做一个BMI身体指数计算器，输入身高体重给出结果和健康建议', phase: 'analyze', model: 'deepseek-v4-pro' })
  const aw = ev.find((e) => e.type === 'awaiting_confirmation')
  console.log(`${ts()} 分析（默认语言）: ${aw ? '✓ 语言=' + (/Python/i.test(aw.analysis) ? 'Python ✓' : /React/i.test(aw.analysis) ? 'React ✗(应为Python)' : '未写明') : 'FAIL'}`)
  if (!aw) process.exit(1)

  ev = await chat({ phase: 'continue', model: 'deepseek-v4-pro' })
  const complete = ev.find((e) => e.type === 'complete')
  const created = ev.filter((e) => e.type === 'file_created').map((e) => e.path)
  const cmd = ev.filter((e) => e.type === 'command_run')
  const langMsg = ev.find((e) => e.type === 'agent_start' && /Python/.test(e.message ?? ''))
  console.log(`${ts()} 生成: ${complete ? '✓' : 'FAIL'}｜文件: ${created.join(', ')}｜Python 管线: ${langMsg ? '✓' : '✗'}｜校验 exit=${cmd.map((c) => c.exitCode).join(',')}`)

  const detail = await (await fetch(`${base}/api/projects/${p.id}`, { headers: { cookie } })).json()
  const mainPy = detail.files.find((f) => f.path === 'main.py')
  console.log(`${ts()} main.py: ${mainPy ? mainPy.content.length + ' 字符' : '缺失 ✗'}｜__main__ 入口: ${mainPy && /__main__/.test(mainPy.content) ? '✓' : '✗'}｜tkinter: ${mainPy && /tkinter/i.test(mainPy.content) ? '✓' : '✗'}｜status=${detail.status}`)
  console.log(`\n=== Python 默认语言 ${complete && mainPy && /tkinter/i.test(mainPy.content) ? '全部通过 ✓' : '失败 ✗'} ===`)
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
