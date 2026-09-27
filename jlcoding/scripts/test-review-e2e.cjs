// 复核点 3 专项 e2e：Prompt A 计算器 + Prompt B 贪吃蛇 + 同一项目连续两轮增量修改。
// 每轮核对（硬断言）：complete / 版本号递增 / SHA 三方一致 / 静态校验 exit 0 /
// esbuild 部署 bundle 成功 + /app/:id 可访问 / 增量改动面 < 全部（内容级 SHA-256 哈希比对）。
// 旧功能/新功能关键词为软断言（模型措辞与 UI 语言不可控，WARN 不计失败）。
// 网络瞬断容错：analyze/continue 失败自动断点续跑（≤3 次）。浏览器内 Sandpack 渲染由 test-preview-browser.cjs 覆盖。
// 模型用 Zen 免费层（deepseek-v4.1-flash，零成本）
const crypto = require('crypto')

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
  const password = 'test123456'
  const model = 'deepseek-v4.1-flash'
  let pass = 0, fail = 0, warn = 0
  const ok = (name, cond, extra = '') => {
    cond ? pass++ : fail++
    console.log(`  ${cond ? 'PASS ✓' : 'FAIL ✗'} ${name}${extra ? '  ｜ ' + extra : ''}`)
  }
  const soft = (name, cond, extra = '') => {
    cond ? pass++ : warn++
    console.log(`  ${cond ? 'PASS ✓' : '⚠ WARN'} ${name}${cond || !extra ? '' : '  ｜ ' + extra}`)
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
  const detailOf = async (pid, cookie) =>
    (await (await fetch(`${base}/api/projects/${pid}`, { headers: { cookie } })).json())

  const register = async (tag) => {
    const res = await fetch(`${base}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `rv${tag}${Date.now().toString(36)}@jlcoding.dev`, password }),
    })
    return (res.headers.get('set-cookie') ?? '').split(';')[0]
  }
  const createProject = async (cookie, name) => {
    const res = await fetch(`${base}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ name }),
    })
    return (await res.json()).id
  }

  // 一轮完整核对。prevVersion：上一轮版本号（首轮传 0）；prevFiles：上一轮文件（增量比对用）
  async function roundCheck({ pid, cookie, label, message, prevVersion, prevFiles, keywordsOld, keywordsNew }) {
    console.log(`\n--- ${label} ---`)
    let ev = null
    for (let i = 1; i <= 3; i++) {
      ev = await sse(pid, { message, phase: 'analyze', model }, cookie)
      if (ev.some((e) => e.type === 'awaiting_confirmation')) break
      console.log(`  ｜ ${label} 第 ${i} 次分析失败 → 重试`)
      await new Promise((r) => setTimeout(r, 3000))
    }
    ok(`${label}：分析 awaiting`, ev.some((e) => e.type === 'awaiting_confirmation'))

    let tries = 0
    do {
      tries++
      ev = await sse(pid, { phase: 'continue', model }, cookie)
      if (!ev.some((e) => e.type === 'complete') && tries < 3) {
        console.log(`  ｜ 第 ${tries} 次尝试失败 → 断点续跑`)
        await new Promise((r) => setTimeout(r, 3000))
      }
    } while (!ev.some((e) => e.type === 'complete') && tries < 3)
    ok(`${label}：生成 complete（≤${tries} 次尝试）`, ev.some((e) => e.type === 'complete'), `事件数=${ev.length}`)

    const vEvent = ev.find((e) => e.type === 'version_created')
    const detail = await detailOf(pid, cookie)
    const versions = await (await fetch(`${base}/api/projects/${pid}/versions`, { headers: { cookie } })).json()
    const files = Object.fromEntries(detail.files.map((f) => [f.path, f.content]))
    const validation = ev.filter((e) => e.type === 'command_run').pop()

    ok(`${label}：版本号递增到 v${prevVersion + 1}`,
      vEvent?.version === prevVersion + 1 && versions[0]?.version === prevVersion + 1,
      `sha=${vEvent ? vEvent.sha.slice(0, 8) : '-'}`)
    ok(`${label}：SHA 三方一致（事件==列表==文件集）`,
      Boolean(vEvent) && vEvent.sha === versions[0].sha && vEvent.sha === filesSha(detail.files))

    const allSource = detail.files.map((f) => f.content).join('\n')
    for (const kw of keywordsOld ?? []) soft(`${label}：旧功能残留（${kw}）`, allSource.includes(kw))
    for (const kw of keywordsNew ?? []) soft(`${label}：新功能到位（${kw}）`, allSource.includes(kw))

    ok(`${label}：静态校验 exit=0`, validation?.exitCode === 0, `exit=${validation?.exitCode}`)
    const dep = await (await fetch(`${base}/api/projects/${pid}/deploy`, { method: 'POST', headers: { cookie } })).json()
    ok(`${label}：esbuild 部署 bundle 成功`, Boolean(dep.sha) && Boolean(dep.entry), `sha=${String(dep.sha).slice(0, 8)} 入口=${dep.entry}`)
    const html = await (await fetch(`${base}/app/${pid}`)).text()
    ok(`${label}：/app/:id 可访问（自包含 HTML）`, html.includes('id="root"'), `${html.length} 字节`)
    for (const kw of keywordsNew ?? []) soft(`${label}：部署 bundle 含新功能标识（${kw}）`, html.includes(kw))

    if (prevFiles) {
      const changed = Object.keys(files).filter((p) => !prevFiles[p] || sha256(files[p]) !== sha256(prevFiles[p]))
      const untouched = Object.keys(files).filter((p) => prevFiles[p] && sha256(files[p]) === sha256(prevFiles[p]))
      ok(`${label}：增量改动面 < 全部（内容级哈希比对）`,
        changed.length > 0 && changed.length < Object.keys(files).length,
        `改动 ${changed.length}/${Object.keys(files).length}（${changed.join(', ').slice(0, 70)}），不变 ${untouched.length}`)
    }
    console.log(`  ｜ 轮核对完成：v${vEvent?.version} · ${vEvent ? vEvent.sha.slice(0, 8) : '-'} · ${detail.files.length} 文件`)
    return { files, sha: vEvent?.sha, version: vEvent?.version }
  }

  const cookie = await register('a')

  // ===== Prompt A：计算器 + 同项目连续两轮增量 =====
  const calcId = await createProject(cookie, '复核-计算器')
  const r1 = await roundCheck({
    pid: calcId, cookie, label: 'Prompt A 计算器 · 初始生成', prevVersion: 0,
    message: '做一个 React 网页版计算器：数字按钮 0-9、加减乘除按钮、等号、清除，显示算式和结果，支持连续运算',
    keywordsNew: ['计算'],
  })
  const r2 = await roundCheck({
    pid: calcId, cookie, label: '计算器 · 增量轮 1（退格 + 小数点）', prevVersion: r1.version, prevFiles: r1.files,
    message: '给计算器加上小数点和退格按钮，结果显示保留两位小数',
    keywordsOld: ['计算'], keywordsNew: ['退格', '小数'],
  })
  const r3 = await roundCheck({
    pid: calcId, cookie, label: '计算器 · 增量轮 2（深色主题 + 历史）', prevVersion: r2.version, prevFiles: r2.files,
    message: '把计算器改成深色主题，并在顶部加上运算历史记录列表，最多显示最近 5 条',
    keywordsOld: ['计算', '退格'], keywordsNew: ['历史'],
  })
  ok('计算器版本序列严格递增且 SHA 逐轮变化',
    [r1, r2, r3].every((r) => r.sha) && r1.sha !== r2.sha && r2.sha !== r3.sha)

  // 回滚验证（同一项目）：回 v1 → 文件集哈希精确还原 + 版本 append-only
  const rb = await (await fetch(`${base}/api/projects/${calcId}/versions/1/rollback`, { method: 'POST', headers: { cookie } })).json()
  const rbDetail = await detailOf(calcId, cookie)
  ok(`计算器回滚 v1 → v${r3.version + 1}：文件集哈希精确还原`,
    rb.version === r3.version + 1 && filesSha(rbDetail.files) === r1.sha)

  // ===== Prompt B：贪吃蛇 =====
  const snakeId = await createProject(cookie, '复核-贪吃蛇')
  const s1 = await roundCheck({
    pid: snakeId, cookie, label: 'Prompt B 贪吃蛇 · 生成', prevVersion: 0,
    message: '做一个 React 网页版贪吃蛇：方向键控制移动、吃到食物变长并加分、撞墙或撞到自己游戏结束并显示分数、有重新开始按钮',
    keywordsNew: ['方向', '食物'],
  })

  console.log(`\n=== 复核点 3 e2e ${fail === 0 ? `全部通过 ✓（${pass} 项硬断言 + ${warn} 项软提示）` : `失败 ✗（${fail}/${pass + fail} 项硬断言，${warn} 项软提示）`} ===`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
