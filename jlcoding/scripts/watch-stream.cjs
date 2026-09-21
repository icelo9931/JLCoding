// 流式 SSE 调试客户端：逐事件打印时间戳，规避整体 body 超时
async function main() {
  const base = 'http://localhost:3000'
  const project = await (await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '流式调试' }),
  })).json()
  console.log(`project: ${project.id}  (${new Date().toLocaleTimeString()})`)

  const res = await fetch(`${base}/api/projects/${project.id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '做一个待办事项应用，支持添加、完成、删除和筛选' }),
  })
  if (!res.ok || !res.body) throw new Error(`chat ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const t0 = Date.now()
  const ts = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`

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
        if (e.type === 'file_created' || e.type === 'file_updated') {
          console.log(`[${ts()}] ${e.type}: ${e.path} (${e.content.length} chars)`)
        } else if (e.type === 'agent_complete') {
          console.log(`[${ts()}] ✓ ${e.agent}: ${e.result.slice(0, 80).replace(/\n/g, ' ')}…`)
        } else if (e.type === 'command_run') {
          console.log(`[${ts()}] $ ${e.command} → exit ${e.exitCode}`)
        } else {
          console.log(`[${ts()}] ${JSON.stringify(e).slice(0, 120)}`)
        }
      } catch { /* incomplete */ }
    }
  }
  console.log(`[${ts()}] stream ended`)
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
