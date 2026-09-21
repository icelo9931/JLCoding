// 本地 .env 生成：SQLite + OpenCode Go 凭据（Neon 连接串保留在 .env.local 供迁移/部署）
const fs = require('fs')
const path = require('path')
const root = path.join(__dirname, '..')
const prev = fs.readFileSync(path.join(root, '.env'), 'utf8')
const key = prev.match(/^OPENCODE_API_KEY=(.+)$/m)?.[1]?.trim()
if (!key) { console.error('缺少 OPENCODE_API_KEY'); process.exit(1) }
fs.writeFileSync(path.join(root, '.env'), `DATABASE_URL="file:./dev.db"
OPENCODE_API_KEY=${key}
OPENCODE_BASE_URL="https://opencode.ai/zen/go/v1"
`)
console.log('.env → 本地 SQLite（Neon 连接串见 .env.local）')
