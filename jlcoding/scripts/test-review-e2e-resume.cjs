// 复核点 3 e2e 续跑：复用上次中断的项目（计算器 → 轮 3 → 回滚 → 贪吃蛇），避免重复生成；
// 顺带验证「中断后续跑」能力。运行于 test-review-e2e.cjs 中断后。
// 模型用 Zen 免费层（deepseek-v4.1-flash，零成本）
const crypto = require('crypto')
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')
function filesSha(files) {
  const canonical = [...files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => `${f.path}\n${f.content}`)
    .join('\n\n')
  return sha256(canonical)
}

async function main() {
  const base = process.env.BASE_URL || 'http://localhost:3000'
  const model = 'deepseek-v4.1-flash'
  let pass = 0, fail = 0, warn = 0
  const ok = (name, cond, extra = '') => {
    cond ? pass++ : fail++
    console.log(`  ${cond ? 'PASS ✓' : 'FAIL ✗'} ${name}${extra ? '  ｜ ' + extra : ''}`)
  }
  const soft = (name, cond) => {
    cond ? pass++ : warn++
    console.log(`  ${cond ? 'PASS ✓' : '⚠ WARN'} ${name}`)
  }
  const sse = async (pid, body, cookie) => {
    const r = await fetch(`${base}/api/projects/${pid}/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(`chat ${r.status}: ${(await r.text()).slice(0, 150)}`)
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
        if (line.startsWith('data: ')) { try { events.push(JSON.parse(line.slice(6))) } catch { /* partial */ } }
      }
    }
    return events
  }

  // 1. 找到中断的计算器项目 + 其归属账号，登录（注册时密码固定 test123456）
  const calc = await db.project.findFirst({
    where: { name: '复核-计算器' }, orderBy: { updatedAt: 'desc' },
    include: { user: { select: { email: true } }, files: true },
  })
  if (!calc) throw new Error('找不到复核-计算器项目，请先跑 test-review-e2e.cjs')
  const versions = await db.projectVersion.findMany({ where: { projectId: calc.id }, orderBy: { version: 'desc' } })
  console.log(`复用项目 ${calc.id.slice(-6)}：当前 v${versions[0]?.version}（${versions[0]?.summary ?? ''}）status=${calc.status}`)
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: calc.user.email, password: 'test123456' }),
  })
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
  ok('登录原测试账号', login.status === 200, calc.user.email)
  const prevVersion = versions[0]?.version ?? 0
  const prevFiles = Object.fromEntries(calc.files.map((f) => [f.path, f.content]))

  // 2. 轮 3（追加需求已在中断前落库，直接断点续跑 continue）
  console.log('\n--- 计算器 · 下一轮：断点续跑 ---')
  let tries = 0, ev
  do {
    tries++
    ev = await sse(calc.id, { phase: 'continue', model }, cookie)
    if (!ev.some((e) => e.type === 'complete') && tries < 3) {
      console.log(`  ｜ 第 ${tries} 次失败（${(ev.find((e) => e.type === 'error')?.message ?? '').slice(0, 60)}）→ 续跑`)
      await new Promise((r) => setTimeout(r, 3000))
    }
  } while (!ev.some((e) => e.type === 'complete') && tries < 3)
  ok('断点续跑 complete', ev.some((e) => e.type === 'complete'), `${tries} 次尝试`)

  const detail = await (await (await fetch(`${base}/api/projects/${calc.id}`, { headers: { cookie } })).json())
  const files = Object.fromEntries(detail.files.map((f) => [f.path, f.content]))
  const vEvent = ev.find((e) => e.type === 'version_created')
  ok(`下一轮版本递增到 v${prevVersion + 1}`, vEvent?.version === prevVersion + 1, `sha=${vEvent ? vEvent.sha.slice(0, 8) : '-'}`)
  ok('SHA 三方一致', Boolean(vEvent) && vEvent.sha === filesSha(detail.files))
  const changed = Object.keys(files).filter((p) => !prevFiles[p] || sha256(files[p]) !== sha256(prevFiles[p]))
  ok('增量改动面 < 全部（内容级哈希比对）', changed.length > 0 && changed.length < Object.keys(files).length,
    `改动 ${changed.length}/${Object.keys(files).length}，不变 ${Object.keys(files).length - changed.length}`)
  const allSource = detail.files.map((f) => f.content).join('\n')
  soft('旧功能残留（计算）', allSource.includes('计算'))

  // 3. 回滚 v1 → 精确还原
  const v1 = await db.projectVersion.findFirst({ where: { projectId: calc.id, version: 1 } })
  const rb = await (await fetch(`${base}/api/projects/${calc.id}/versions/1/rollback`, { method: 'POST', headers: { cookie } })).json()
  const rbDetail = await (await (await fetch(`${base}/api/projects/${calc.id}`, { headers: { cookie } })).json())
  ok(`回滚 v1 → v${rb.version}：文件集哈希精确还原`, rb.version === prevVersion + 2 && filesSha(rbDetail.files) === v1.sha,
    `now=${filesSha(rbDetail.files).slice(0, 8)} v1=${v1.sha.slice(0, 8)}`)

  // 4. 贪吃蛇（新项目完整生成 + 部署）
  console.log('\n--- Prompt B 贪吃蛇（完整链路） ---')
  const proj = await (await fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ name: '复核-贪吃蛇' }),
  })).json()
  ev = await sse(proj.id, { message: '做一个 React 网页版贪吃蛇：方向键控制移动、吃到食物变长并加分、撞墙或撞到自己游戏结束并显示分数、有重新开始按钮', phase: 'analyze', model }, cookie)
  ok('贪吃蛇分析 awaiting', ev.some((e) => e.type === 'awaiting_confirmation'))
  tries = 0
  do {
    tries++
    ev = await sse(proj.id, { phase: 'continue', model }, cookie)
    if (!ev.some((e) => e.type === 'complete') && tries < 3) {
      console.log(`  ｜ 第 ${tries} 次失败 → 续跑`)
      await new Promise((r) => setTimeout(r, 3000))
    }
  } while (!ev.some((e) => e.type === 'complete') && tries < 3)
  ok('贪吃蛇 complete', ev.some((e) => e.type === 'complete'), `${tries} 次尝试`)
  const sv = ev.find((e) => e.type === 'version_created')
  const sDetail = await (await fetch(`${base}/api/projects/${proj.id}`, { headers: { cookie } })).json()
  ok('贪吃蛇 v1 + SHA 一致', sv?.version === 1 && sv.sha === filesSha(sDetail.files), sv ? `sha=${sv.sha.slice(0, 8)}` : '-')
  const validation = ev.filter((e) => e.type === 'command_run').pop()
  ok('静态校验 exit=0（含 import 解析检查）', validation?.exitCode === 0, `exit=${validation?.exitCode}`)
  const dep = await (await fetch(`${base}/api/projects/${proj.id}/deploy`, { method: 'POST', headers: { cookie } })).json()
  ok('贪吃蛇部署成功', Boolean(dep.sha) && Boolean(dep.entry), `sha=${String(dep.sha).slice(0, 8)} 入口=${dep.entry}`)
  const html = await (await fetch(`${base}/app/${proj.id}`)).text()
  ok('/app/:id 自包含可访问', html.includes('id="root"') && /react/i.test(html), `${html.length} 字节`)

  console.log(`\n=== 复核点 3 续跑 ${fail === 0 ? `全部通过 ✓（${pass} 项硬断言 + ${warn} 项软提示）` : `失败 ✗（${fail} 项）`} ===`)
  await db.$disconnect()
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(async (e) => { console.error('失败:', e.message); await db.$disconnect(); process.exit(1) })
