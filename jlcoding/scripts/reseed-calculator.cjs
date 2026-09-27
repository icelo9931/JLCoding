// 数据修复：① 删除用户账号混合项目 ② 从「复核-计算器」真实项目重新种子（含 system 校验消息 + 版本 + 部署）
const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const db = new PrismaClient()
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const EMAIL = 'jl993138486s@gmail.com'

// 从 .env 读取 AUTH_SECRET（生成本地合法会话令牌用于部署）
if (!process.env.AUTH_SECRET) {
  const envPath = path.join(__dirname, '..', '.env')
  const env = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '')
  const m = env.match(/^AUTH_SECRET="?([^"\n]+)"?$/m)
  if (m) process.env.AUTH_SECRET = m[1]
}

async function main() {
  const user = await db.user.findUnique({ where: { email: EMAIL } })
  if (!user) throw new Error(`找不到账号 ${EMAIL}`)

  // ① 删除混合项目（假种子 + 杂烩）
  for (const name of ['计算器（可直接打开）', '写一个计算器']) {
    const ps = await db.project.findMany({ where: { userId: user.id, name } })
    for (const p of ps) {
      await db.project.delete({ where: { id: p.id } })
      console.log(`删除混合项目「${name}」[${p.id.slice(-6)}]`)
    }
  }

  // ② 找真实计算器源（纯 React + 含 system 校验消息 + 版本最多）
  const candidates = await db.project.findMany({
    where: { name: '复核-计算器', status: 'ready', files: { some: { path: 'package.json' } } },
    orderBy: { updatedAt: 'desc' },
    include: { files: true, messages: { orderBy: { createdAt: 'asc' } }, versions: { orderBy: { version: 'asc' } } },
  })
  const src = candidates.sort((a, b) => b.messages.filter((m) => m.role === 'system').length - a.messages.filter((m) => m.role === 'system').length)[0]
  if (!src) throw new Error('找不到真实计算器源（复核-计算器）')
  console.log(`\n源项目：${src.name} [${src.id.slice(-6)}] ${src.files.length} 文件 ${src.messages.length} 消息（system ${src.messages.filter((m) => m.role === 'system').length}）${src.versions.length} 版本`)

  // ③ 创建新项目（绑定用户）
  const proj = await db.project.create({
    data: {
      name: '计算器（可交互预览）',
      status: 'ready',
      mode: 'novice',
      agent: 'engineer',
      model: 'deepseek-v4.1-flash',
      provider: 'opencode:deepseek-v4.1-flash',
      userId: user.id,
    },
  })
  // 消息：完整复制（含 system:validation，保证进度面板四阶段可恢复）
  for (const m of src.messages) {
    await db.message.create({ data: { projectId: proj.id, role: m.role, content: m.content, agent: m.agent, step: m.step } })
  }
  // 文件
  await db.file.createMany({ data: src.files.map((f) => ({ projectId: proj.id, path: f.path, content: f.content, language: f.language })) })
  // 版本
  for (const v of src.versions) {
    await db.projectVersion.create({ data: { projectId: proj.id, version: v.version, sha: v.sha, provider: v.provider, summary: v.summary, filesJson: v.filesJson } })
  }
  console.log(`新项目已建：${proj.name} [${proj.id.slice(-6)}]（${src.files.length} 文件 / ${src.messages.length} 消息 / ${src.versions.length} 版本）`)

  // ④ 用合法会话令牌调部署 API（/app/:id 立即可访问 + 线上使用直链）
  const key = process.env.AUTH_SECRET
  if (key) {
    // jose 生成与 lib/auth.ts 一致的 JWT
    const { SignJWT } = require('jose')
    const token = await new SignJWT({ email: user.email, name: user.name })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(key))
    const dep = await fetch(`${BASE}/api/projects/${proj.id}/deploy`, { method: 'POST', headers: { cookie: `jlcoding_session=${token}` } })
    const body = await dep.json()
    console.log(`部署：HTTP ${dep.status} ${body.sha ? 'sha=' + body.sha.slice(0, 8) + ' url=' + body.url : JSON.stringify(body).slice(0, 100)}`)
    const appRes = await fetch(`${BASE}/app/${proj.id}`)
    const html = await appRes.text()
    console.log(`/app/:id：HTTP ${appRes.status} ${html.length} 字节 含计算器关键字=${/计算|calculator|加减|÷|×|\d\+\d/i.test(html)}`)
  } else {
    console.log('（AUTH_SECRET 不在本进程环境，请从 .env 读取后重跑部署步骤）')
  }

  console.log(`\n打开链接：${BASE}/project/${proj.id}`)
  await db.$disconnect()
}
main().catch(async (e) => { console.error('失败:', e.message); await db.$disconnect(); process.exit(1) })
