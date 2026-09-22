const fetch = (...a) => import('node:https').then(() => globalThis.fetch(...a))
async function main() {
  const r = await fetch('http://localhost:3000')
  const t = await r.text()
  console.log('dev:', r.status, '| 大logo h-12:', t.includes('h-12'), '| rows=6:', t.includes('rows="6"'), '| bytes:', t.length)
  try {
    const b = await fetch('http://localhost:3001')
    console.log('airship:', b.status)
  } catch {
    console.log('airship: starting...')
  }
}
main().catch((e) => console.log('FAIL', e.message))
