// 冒烟测试：创建项目 → SSE 生成 → 校验持久化 → 下载 ZIP
async function main() {
  const base = 'http://localhost:3000'

  const createRes = await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '冒烟测试' }),
  })
  const project = await createRes.json()
  console.log('1. 创建项目:', project.id)

  const chatRes = await fetch(`${base}/api/projects/${project.id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '做一个待办事项应用' }),
  })
  if (!chatRes.ok) throw new Error(`chat 失败: ${chatRes.status}`)
  const text = await chatRes.text()
  const events = text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
  const types = events.map((e) => e.type)
  console.log('2. SSE 事件总数:', events.length)
  console.log('   事件类型序列:', [...new Set(types)].join(' → '))
  console.log('   file_created 数量:', types.filter((t) => t === 'file_created').length)
  const last = events[events.length - 1]
  console.log('   最后事件:', JSON.stringify(last))

  const detail = await (await fetch(`${base}/api/projects/${project.id}`)).json()
  console.log('3. 持久化: messages =', detail.messages.length, ', files =', detail.files.length, ', status =', detail.status)
  console.log('   文件列表:', detail.files.map((f) => f.path).join(', '))

  const zipRes = await fetch(`${base}/api/projects/${project.id}/download`)
  const zipBuf = Buffer.from(await zipRes.arrayBuffer())
  console.log('4. ZIP 下载:', zipRes.status, zipRes.headers.get('content-type'), `${zipBuf.length} bytes, PK头:`, zipBuf.slice(0, 2).toString() === 'PK')

  const list = await (await fetch(`${base}/api/projects`)).json()
  console.log('5. 项目列表数量:', list.length)

  console.log('\n=== 冒烟测试', types.includes('complete') && detail.files.length > 0 && zipBuf.length > 0 ? '通过 ✓' : '失败 ✗', '===')
}

main().catch((e) => { console.error('冒烟测试失败:', e); process.exit(1) })
