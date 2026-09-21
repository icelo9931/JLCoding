// 直连 OpenCode Go 网关验证 Key 与模型可用性
require('dotenv').config?.()
const fs = require('fs')
const env = fs.readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8')
const key = env.match(/OPENCODE_API_KEY=(.+)/)?.[1]?.trim()
const base = env.match(/OPENCODE_BASE_URL="(.+)"/)?.[1]?.trim() || 'https://opencode.ai/zen/go/v1'

async function main() {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'User-Agent': 'jlcoding/1.0',
      'x-opencode-session': 'jlcoding-smoke-test',
    },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [{ role: 'user', content: '回复两个字：可用' }],
      max_tokens: 10,
    }),
  })
  console.log('status:', res.status)
  const data = await res.json()
  if (!res.ok) {
    console.log('error body:', JSON.stringify(data).slice(0, 300))
    process.exit(1)
  }
  console.log('model:', data.model)
  console.log('reply:', data.choices?.[0]?.message?.content?.slice(0, 50))
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
