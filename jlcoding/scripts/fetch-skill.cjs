// 下载 GitHub skill 全文存档 + 生成注入摘要
const fs = require('fs')
const path = require('path')

async function main() {
  const url = 'https://api.github.com/repos/obra/superpowers/contents/skills/test-driven-development/SKILL.md'
  const res = await fetch(url, { headers: { 'User-Agent': 'jl', Accept: 'application/vnd.github.raw' } })
  if (!res.ok) { console.error('FAIL', res.status); process.exit(1) }
  const text = await res.text()
  const dir = path.join(__dirname, '..', 'skills', 'test-driven-development')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), text)
  console.log('saved', path.join(dir, 'SKILL.md'), text.length, 'chars')
}
main().catch((e) => { console.error(e.message); process.exit(1) })
