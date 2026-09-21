const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
db.$queryRaw`SELECT 1`
  .then((r) => { console.log('raw SELECT 1 ok:', JSON.stringify(r)); return db.project.count() })
  .then((c) => { console.log('project count:', c); return db.$disconnect() })
  .catch((e) => { console.error('FAIL:', e.message?.slice(0, 300)); process.exit(1) })
