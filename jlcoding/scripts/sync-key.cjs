// 从 opencode 本地认证存储提取 Go Key 写入 .env（不回显明文）
const fs = require('fs')
const path = require('path')
const auth = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.local/share/opencode/auth.json'), 'utf8'))
const key = auth.opencode?.key
if (!key) { console.error('auth.json 中没有 opencode key'); process.exit(1) }
const env = `DATABASE_URL="file:./dev.db"
OPENCODE_API_KEY=${key}
OPENCODE_BASE_URL="https://opencode.ai/zen/go/v1"
`
fs.writeFileSync(path.join(__dirname, '..', '.env'), env)
console.log('.env 已写入，key 长度:', key.length)
