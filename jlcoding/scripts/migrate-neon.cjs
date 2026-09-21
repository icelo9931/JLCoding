// 一次性迁移：把 Neon 中的全部项目（含日历半成品）拷贝到本地 SQLite
// 前置：.env 指向 SQLite（已切换），.env.neon 保留 Neon 连接串
const fs = require('node:fs')
const path = require('node:path')
const postgres = require('postgres')
const { PrismaClient } = require('@prisma/client')

async function main() {
  const root = path.join(__dirname, '..')
  const neonFile = fs.existsSync(path.join(root, '.env.neon'))
    ? '.env.neon'
    : '.env.local'
  const local = fs.readFileSync(path.join(root, neonFile), 'utf8')
  const strip = (v) => v.trim().replace(/^"|"$/g, '')
  const neonUrl =
    strip(local.match(/^DATABASE_URL_UNPOOLED=(.+)$/m)?.[1] ?? '') ||
    strip(local.match(/^POSTGRES_URL_NON_POOLING=(.+)$/m)?.[1] ?? '')
  if (!neonUrl) { console.error('.env.local 中没有 Neon 连接串'); process.exit(1) }

  const sql = postgres(neonUrl, { max: 1, connect_timeout: 10 })
  const db = new PrismaClient()

  try {
    const projects = await sql`SELECT * FROM "Project" ORDER BY "createdAt" ASC`
    console.log(`Neon 项目数: ${projects.length}`)
    let copiedFiles = 0, copiedMessages = 0

    for (const p of projects) {
      const existing = await db.project.findUnique({ where: { id: p.id } })
      if (existing) { console.log(`跳过（已存在）: ${p.name}`); continue }

      await db.project.create({
        data: {
          id: p.id, name: p.name, status: p.status === 'building' ? 'paused' : p.status,
          mode: p.mode ?? 'novice', model: p.model,
          createdAt: new Date(p.createdAt), updatedAt: new Date(p.updatedAt),
        },
      })
      const messages = await sql`SELECT * FROM "Message" WHERE "projectId" = ${p.id} ORDER BY "createdAt" ASC`
      for (const m of messages) {
        await db.message.create({
          data: {
            id: m.id, projectId: p.id, role: m.role, content: m.content,
            step: m.step, agent: m.agent, createdAt: new Date(m.createdAt),
          },
        })
        copiedMessages++
      }
      const files = await sql`SELECT * FROM "File" WHERE "projectId" = ${p.id}`
      for (const f of files) {
        await db.file.create({
          data: {
            id: f.id, projectId: p.id, path: f.path, content: f.content,
            language: f.language, updatedAt: new Date(f.updatedAt),
          },
        })
        copiedFiles++
      }
      console.log(`迁移: ${p.name}（${messages.length} 消息 / ${files.length} 文件, status=${p.status}→${p.status === 'building' ? 'paused' : p.status}）`)
    }
    console.log(`\n完成：消息 ${copiedMessages} 条，文件 ${copiedFiles} 个`)
  } finally {
    await sql.end()
    await db.$disconnect()
  }
}

main().catch((e) => { console.error('迁移失败:', e.message); process.exit(1) })
