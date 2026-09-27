// 探测 OpenCode Zen 网关当前可用性（最小 chat 请求，用免费模型零成本）
const fs = require('fs')
const path = require('path')

const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
const key = env.match(/^OPENCODE_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, '')
const baseUrl = env.match(/^OPENCODE_BASE_URL=(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, '') || 'https://opencode.ai/zen/v1'
const probeModel = process.env.PROBE_MODEL || 'deepseek-v4.1-flash'

fetch(`${baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
    'User-Agent': 'jlcoding/1.0',
    'x-opencode-session': 'quota-check',
  },
  body: JSON.stringify({ model: probeModel, messages: [{ role: 'user', content: '回复一个字：好' }], max_tokens: 8 }),
  signal: AbortSignal.timeout(15000),
}).then(async (r) => {
  const body = await r.text()
  console.log(`探测模型 ${probeModel} @ ${baseUrl}`)
  console.log('HTTP', r.status)
  if (r.status === 429) {
    const retryAfter = r.headers.get('retry-after')
    console.log('额度受限：', body.slice(0, 200))
    if (retryAfter) console.log(`恢复倒计时：${Math.round(Number(retryAfter) / 3600)} 小时后（retry-after=${retryAfter}s）`)
  } else if (r.status === 403) {
    console.log('模型不可用（403）：', body.slice(0, 200), '\n可换 PROBE_MODEL 环境变量指定其他模型探测')
  } else {
    console.log('网关可用，响应：', body.slice(0, 300))
  }
}).catch((e) => console.log('网络错误：', String(e).slice(0, 120)))
