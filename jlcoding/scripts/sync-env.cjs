// 从 .env.local（Vercel 注入的 Neon 变量）生成本地 .env，保留 OpenCode Go 凭据
const fs = require('fs')
const path = require('path')
const root = path.join(__dirname, '..')
const local = fs.readFileSync(path.join(root, '.env.local'), 'utf8')
const get = (name) => local.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]?.trim()

const pooled = get('DATABASE_URL')
const unpooled = get('DATABASE_URL_UNPOOLED') || get('POSTGRES_URL_NON_POOLING')
const openaiKey = fs.readFileSync(path.join(root, '.env'), 'utf8').match(/^OPENCODE_API_KEY=(.+)$/m)?.[1]?.trim()

if (!pooled || !unpooled || !openaiKey) {
  console.error('missing:', { pooled: !!pooled, unpooled: !!unpooled, openaiKey: !!openaiKey })
  process.exit(1)
}
fs.writeFileSync(path.join(root, '.env'), `DATABASE_URL=${pooled}
DIRECT_DATABASE_URL=${unpooled}
OPENCODE_API_KEY=${openaiKey}
OPENCODE_BASE_URL="https://opencode.ai/zen/go/v1"
`)
console.log('.env updated: postgres pooled + direct + opencode key')
