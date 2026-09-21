// 三场景冒烟：需求分析确认 → 追加重新分析 → 暂停 → 断点续跑 → 交付
// 用法：node scripts/smoke2.cjs [baseUrl]
async function main() {
  const base = process.argv[2] || 'http://localhost:3000'
  const t0 = Date.now()
  const ts = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`

  const project = await (await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '三场景冒烟', mode: 'expert' }),
  })).json()
  const id = project.id
  console.log(`[${ts()}] project: ${id} (mode=${project.mode})`)

  const chat = async (body, { abortAfter } = {}) => {
    const events = []
    const ac = new AbortController()
    const res = await fetch(`${base}/api/projects/${id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    })
    if (!res.ok) throw new Error(`chat ${res.status}: ${await res.text()}`)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    outer: while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const e = JSON.parse(line.slice(6))
          events.push(e)
          if (e.type === 'awaiting_confirmation') {
            if (abortAfter === 'await') { ac.abort(); break outer }
          }
          if (e.type === 'file_created' && abortAfter === 'file') {
            // 收到首个文件后暂停：多读 1 秒让文件落库再中止
            await new Promise((r) => setTimeout(r, 1000))
            ac.abort()
            break outer
          }
        } catch { /* partial */ }
      }
    }
    return events
  }

  // 场景 1：分析 → 等待确认（不直接生成）
  let ev = await chat({ message: '做一个待办事项应用', phase: 'analyze', model: 'deepseek-v4-flash' })
  const awaited = ev.find((e) => e.type === 'awaiting_confirmation')
  console.log(`[${ts()}] 场景1 分析完成并等待确认: ${awaited ? 'PASS ✓' : 'FAIL ✗'}（分析 ${awaited?.analysis?.length ?? 0} 字）`)
  if (!awaited) process.exit(1)

  // 场景 2：追加内容 → 重新分析
  ev = await chat({ message: '每个待办可以设置优先级标签，并按优先级排序', phase: 'analyze' })
  const awaited2 = ev.find((e) => e.type === 'awaiting_confirmation')
  const merged = /优先级/.test(awaited2?.analysis ?? '')
  console.log(`[${ts()}] 场景2 追加后重新分析: ${awaited2 && merged ? 'PASS ✓（新分析包含追加需求）' : 'FAIL ✗'}`)
  if (!awaited2) process.exit(1)

  // 场景 3a：确认生成 → 产生首个文件后暂停
  ev = await chat({ phase: 'continue' }, { abortAfter: 'file' })
  const fileCountBefore = ev.filter((e) => e.type === 'file_created').length
  console.log(`[${ts()}] 场景3a 确认后生成，收到 ${fileCountBefore} 个文件后主动暂停`)
  await new Promise((r) => setTimeout(r, 3000))
  let detail = await (await fetch(`${base}/api/projects/${id}`)).json()
  const persistedFiles = detail.files.length
  const statusAfterPause = detail.status
  console.log(`[${ts()}] 暂停后状态: ${statusAfterPause}（已持久化 ${persistedFiles} 文件）${statusAfterPause === 'paused' || statusAfterPause === 'building' ? '' : ' ⚠'}`)

  // 场景 3b：断点续跑 → 完成
  ev = await chat({ phase: 'continue' })
  const complete = ev.find((e) => e.type === 'complete')
  const skippedDesign = ev.some((e) => e.type === 'agent_start' && e.message?.includes('断点恢复'))
  detail = await (await fetch(`${base}/api/projects/${id}`)).json()
  console.log(`[${ts()}] 场景3b 断点续跑: ${complete ? 'PASS ✓' : 'FAIL ✗'}｜设计阶段跳过: ${skippedDesign ? '是（未重跑）' : '否（重跑，检查断点逻辑）'}｜最终 ${detail.files.length} 文件, status=${detail.status}`)
  if (!complete) process.exit(1)

  // 交付验证
  const zip = await fetch(`${base}/api/projects/${id}/download`)
  const zipBuf = Buffer.from(await zip.arrayBuffer())
  console.log(`[${ts()}] ZIP: ${zip.status} ${zipBuf.length} bytes`)
  console.log(`\n=== 三场景冒烟 ${complete && zipBuf.length > 100 ? '全部通过 ✓' : '失败 ✗'} ===`)
}

main().catch((e) => { console.error('冒烟失败:', e.message); process.exit(1) })
