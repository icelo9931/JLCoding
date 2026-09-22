// Agent/Skill/文件上下文注入链路验证（analyze 阶段）
async function main() {
  const base = 'http://localhost:3000'
  const project = await (await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '注入验证', mode: 'expert', agent: 'analyst' }),
  })).json()
  console.log('创建项目 agent =', project.agent)

  const res = await fetch(`${base}/api/projects/${project.id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: '根据我上传的数据做一个员工信息展示页',
      phase: 'analyze',
      fileContext: '【文件：employees.csv】\n姓名,年龄,部门\n张三,28,研发部\n李四,32,产品部',
      skills: [{ id: 's1', name: '表格美化', content: '所有表格使用斑马纹' }],
      mcps: [{ id: 'm1', name: '示例服务', url: '', note: '仅测试' }],
    }),
  })
  const text = await res.text()
  const events = text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)) } catch { return null } }).filter(Boolean)
  const awaited = events.find((e) => e.type === 'awaiting_confirmation')
  const errs = events.find((e) => e.type === 'error')

  const detail = await (await fetch(`${base}/api/projects/${project.id}`)).json()
  console.log('HTTP', res.status, '| awaiting:', Boolean(awaited), '| error:', errs?.message ?? '无')
  console.log('project.agent =', detail.agent, '| 分析含数据引用:', /员工|张三|姓名|数据/.test(awaited?.analysis ?? ''))
  console.log('\n=== 注入链路', awaited && !errs && detail.agent === 'analyst' ? '通过 ✓' : '失败 ✗', '===')
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
