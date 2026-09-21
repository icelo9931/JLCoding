// 从 GitHub Releases 下载 GitHub CLI 安装包
const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream/promises')

async function main() {
  const api = 'https://api.github.com/repos/cli/cli/releases/latest'
  const meta = await (await fetch(api, { headers: { 'User-Agent': 'jlcoding-setup' } })).json()
  const asset = meta.assets.find((a) => /windows_amd64\.zip$/.test(a.name))
  if (!asset) { console.error('未找到 windows_x64 资产:', meta.assets?.map((a) => a.name).join(', ')); process.exit(1) }
  console.log('下载:', asset.name, Math.round(asset.size / 1e6) + 'MB')
  // objects.githubusercontent.com 被阻断，走 api.github.com 资产端点
  const res = await fetch(`https://api.github.com/repos/cli/cli/releases/assets/${asset.id}`, {
    headers: { 'User-Agent': 'jlcoding-setup', Accept: 'application/octet-stream' },
  })
  if (!res.ok) { console.error('asset api', res.status); process.exit(1) }
  const out = path.join(process.env.TEMP, 'gh.zip')
  await pipeline(res.body, fs.createWriteStream(out))
  console.log('saved:', out)
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1) })
