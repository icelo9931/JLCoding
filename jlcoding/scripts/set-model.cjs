// 切换项目模型：node scripts/set-model.cjs <projectId> <modelId>（省略 id 则列出项目）
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const [projectId, modelId] = process.argv.slice(2)
  if (!projectId) {
    const ps = await db.project.findMany({ select: { id: true, name: true, status: true, model: true }, orderBy: { updatedAt: 'desc' } })
    ps.forEach((p) => console.log(p.status.padEnd(9), String(p.model ?? '-').padEnd(20), p.name.slice(0, 34).padEnd(36), p.id))
    return
  }
  const p = await db.project.update({ where: { id: projectId }, data: { model: modelId } })
  console.log(`已切换: ${p.name} → ${modelId}`)
}

main().catch((e) => { console.error(e.message); process.exit(1) }).finally(() => db.$disconnect())
