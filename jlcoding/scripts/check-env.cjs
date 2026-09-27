const fs = require('fs')
const c = fs.readFileSync('.env', 'utf8')
console.log('BOM present:', c.charCodeAt(0) === 0xFEFF)
const lines = c.split('\n').filter((l) => /^[A-Z_]+=/.test(l))
for (const l of lines) {
  const k = l.split('=')[0]
  const v = l.slice(k.length + 1)
  console.log(`${k} = ${v.length > 16 ? v.slice(0, 16) + '…' : v}`)
}
