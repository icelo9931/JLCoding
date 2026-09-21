const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
db.project
  .findFirst()
  .then((p) => {
    console.log('model field exists:', p ? 'model' in p : 'no rows')
    if (p) console.log('model value:', JSON.stringify(p.model))
    return db.$disconnect()
  })
  .catch((e) => { console.error(e.message); process.exit(1) })
