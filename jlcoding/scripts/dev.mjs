// 本地开发启动器：按 DATABASE_URL 前缀自动选择 schema（sqlite/postgres）
// 生成 client → 建表 → 启动 next dev
import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = fs.readFileSync(path.join(root, '.env'), 'utf8')
const dbUrl = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m)?.[1] ?? ''

const isSqlite = dbUrl.startsWith('file:')
const schema = isSqlite ? 'prisma/schema.dev.prisma' : 'prisma/schema.prisma'
console.log(`[dev] DATABASE_URL=${isSqlite ? 'sqlite 本地文件' : 'postgres (Neon)'} → 使用 ${schema}`)

execSync(`npx prisma generate --schema ${schema}`, { cwd: root, stdio: 'inherit' })
if (isSqlite) {
  execSync(`npx prisma db push --schema ${schema} --skip-generate`, { cwd: root, stdio: 'inherit' })
}

const host = process.env.HOST || '0.0.0.0'
const port = process.env.PORT || '3000'
const child = spawn('npx', ['next', 'dev', '-H', host, '-p', port], {
  cwd: root, stdio: 'inherit', shell: true,
})
child.on('exit', (code) => process.exit(code ?? 0))
