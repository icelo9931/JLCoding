// 流式验证：agent_delta 逐 token 到达 + 拼装文本与最终结果一致
async function main() {
  const base = 'http://localhost:3000'
  const project = await (await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '流式验证', mode: 'expert' }),
  })).json()

  const res = await fetch(`${base}/api/projects/${project.id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '做一个倒计时番茄钟', phase: 'analyze' }),
  })
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let deltas = 0
  let assembled = ''
  const t0 = Date.now()
  let firstDeltaAt = null
  let finalAnalysis = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const e = JSON.parse(line.slice(6))
        if (e.type === 'agent_delta') {
          deltas++
          if (firstDeltaAt === null) firstDeltaAt = Date.now() - t0
          assembled += e.delta
        }
        if (e.type === 'awaiting_confirmation') finalAnalysis = e.analysis
      } catch { /* partial */ }
    }
  }

  console.log(`delta 事件数: ${deltas}`)
  console.log(`首个 delta 到达: ${(firstDeltaAt / 1000).toFixed(1)}s（总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s）`)
  console.log(`拼装文本 ${assembled.length} 字 vs 最终分析 ${finalAnalysis.length} 字`)
  console.log(`一致性: ${assembled.trim() === finalAnalysis.trim() ? 'PASS ✓' : 'MISMATCH ✗'}`)
  console.log(assembled.trim() === finalAnalysis.trim() && deltas > 10 ? '\n=== 流式验证通过 ✓ ===' : '\n=== 流式验证失败 ✗ ===')
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
