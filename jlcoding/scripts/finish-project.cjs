// 断点续跑指定项目到完成，并输出代码结果
// 用法：node scripts/finish-project.cjs <projectId>
async function main() {
  const base = 'http://localhost:3000'
  const id = process.argv[2]
  if (!id) { console.error('用法: node scripts/finish-project.cjs <projectId>'); process.exit(1) }
  const t0 = Date.now()
  const ts = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`

  const res = await fetch(`${base}/api/projects/${id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase: 'continue' }),
  })
  if (!res.ok) throw new Error(`continue ${res.status}: ${(await res.text()).slice(0, 100)}`)
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
      try {
        const e = JSON.parse(line.slice(6))
        if (e.type === 'file_created' || e.type === 'file_updated') console.log(`${ts()} ${e.type}: ${e.path}`)
        else if (e.type === 'agent_start' && e.message?.includes('断点恢复')) console.log(`${ts()} ⏩ ${e.message}`)
        else if (e.type === 'command_run') console.log(`${ts()} $ ${e.command} → exit ${e.exitCode}`)
        else if (e.type === 'agent_complete') console.log(`${ts()} ✓ ${e.agent}: ${e.result.slice(0, 60).replace(/\n/g, ' ')}…`)
        else console.log(`${ts()} ${e.type}`)
      } catch { /* partial */ }
    }
  }

  const detail = await (await fetch(`${base}/api/projects/${id}`)).json()
  console.log(`\n最终状态: ${detail.status}｜${detail.files.length} 个文件`)
  detail.files.forEach((f) => console.log(`  ${f.path.padEnd(22)} ${f.content.length} 字符`))

  const lunar = detail.files.find((f) => /lunar/i.test(f.path))
  if (lunar) {
    console.log(`\n===== ${lunar.path} 摘录（前 40 行）=====`)
    console.log(lunar.content.split('\n').slice(0, 40).map((l) => '  ' + l).join('\n'))
  }
  const app = detail.files.find((f) => /App\.js/.test(f.path))
  if (app) {
    console.log('\n===== App.js 摘录（前 35 行）=====')
    console.log(app.content.split('\n').slice(0, 35).map((l) => '  ' + l).join('\n'))
  }
  console.log(`\n=== 项目 ${detail.status === 'ready' ? '完成 ✓' : '未完成 ✗'} ===`)
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
