// 流式工具参数验证：编码阶段的 agent_delta 应包含实时代码文本（早于 file_created）
async function main() {
  const base = 'http://localhost:3000'
  const t0 = Date.now()
  const ts = () => `[${((Date-Date.now())/1)}` // placeholder
  const stamp = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`

  const lg = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'testmuc1vjzd@jlcoding.dev', password: 'test123456' }),
  })
  const cookie = (lg.headers.get('set-cookie') ?? '').split(';')[0]
  const p = await (await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ name: '流式验证2', mode: 'novice' }),
  })).json()

  const res = await fetch(`${base}/api/projects/${p.id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ message: '用python做一个加法计算器，输入两个数输出和', phase: 'analyze', model: 'deepseek-v4-pro' }),
  })
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const evts = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('data: ')) { try { evts.push({ ...JSON.parse(line.slice(6)), at: Date.now() - t0 }) } catch { /* */ } }
    }
  }
  const aw = evts.find((e) => e.type === 'awaiting_confirmation')
  console.log(`${stamp()} 分析: ${aw ? '✓' : 'FAIL'}`)
  if (!aw) process.exit(1)

  const res2 = await fetch(`${base}/api/projects/${p.id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ phase: 'continue', model: 'deepseek-v4-pro' }),
  })
  const reader2 = res2.body.getReader()
  let buffer2 = ''
  const ev = []
  while (true) {
    const { done, value } = await reader2.read()
    if (done) break
    buffer2 += decoder.decode(value, { stream: true })
    const lines = buffer2.split('\n')
    buffer2 = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('data: ')) { try { ev.push({ ...JSON.parse(line.slice(6)), at: Date.now() - t0 }) } catch { /* */ } }
    }
  }

  const engStart = ev.find((e) => e.type === 'agent_start' && /代码工程师|Python/.test(e.message ?? ''))
  const fileCreated = ev.find((e) => e.type === 'file_created')
  const deltasDuringWrite = ev.filter((e) => e.type === 'agent_delta' && engStart && fileCreated && e.at > engStart.at && e.at < fileCreated.at)
  const codeDeltas = deltasDuringWrite.filter((e) => /(def |import |print|tkinter|class |\{|\}|const |function)/.test(e.delta))
  const headerDelta = ev.find((e) => e.type === 'agent_delta' && /【正在写入/.test(e.delta))
  const firstDeltaAt = deltasDuringWrite[0]?.at
  const lastDeltaAt = deltasDuringWrite[deltasDuringWrite.length - 1]?.at

  console.log(`${stamp()} 编码阶段: ${engStart?.message}`)
  console.log(`  写入期间 agent_delta 数量: ${deltasDuringWrite.length}｜含代码内容: ${codeDeltas.length}`)
  console.log(`  文件头宣告【正在写入 X】: ${headerDelta ? '✓ ' + headerDelta.delta.trim().split('\n')[0] : '✗'}`)
  console.log(`  首个 delta: ${firstDeltaAt ? (firstDeltaAt / 1000).toFixed(1) + 's（file_created 前 ' + ((fileCreated.at - firstDeltaAt) / 1000).toFixed(1) + 's）' : '无'}`)
  const sample = (deltasDuringWrite.map((d) => d.delta).join('') || '').slice(0, 120).replace(/\n/g, '⏎')
  console.log(`  流出内容采样: ${sample}`)
  const complete = ev.find((e) => e.type === 'complete')
  console.log(`${stamp()} 完成: ${complete ? '✓' : 'FAIL'}`)
  const pass = complete && deltasDuringWrite.length > 20 && codeDeltas.length > 5
  console.log(`\n=== 工具参数实时流 ${pass ? '验证通过 ✓（生成期间界面持续有输出）' : '未达标 ✗'} ===`)
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
