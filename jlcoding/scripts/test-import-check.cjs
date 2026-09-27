// 单测：sandbox 静态校验的相对 import 解析检查。
// 用 esbuild 把 lib/sandbox.ts（连带 app-meta）现场编译成 CJS 再 require——测试的是真实源码而非副本。
const esbuild = require('esbuild')
const fs = require('fs')
const os = require('os')
const path = require('path')

const tmp = path.join(os.tmpdir(), `sandbox-test-${Date.now()}.cjs`)
esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', 'lib', 'sandbox.ts')],
  outfile: tmp,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
})
const { Sandbox } = require(tmp)

let fail = 0
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS ✓' : 'FAIL ✗'} ${name}${extra ? '  ｜ ' + extra : ''}`)
  if (!cond) fail++
}

const base = {
  'package.json': '{"dependencies":{"react":"^18.2.0","react-dom":"^18.2.0"}}',
  'index.js': "import App from './App'\nimport { createRoot } from 'react-dom/client'\ncreateRoot(document.getElementById('root')).render(<App />)",
}

async function main() {
  // 1. 坏 import：App.js 引用不存在的 ./src/App → 必须检出（贪吃蛇真实案例）
  const bad = new Sandbox()
  Object.entries(base).forEach(([p, c]) => bad.write(p, c))
  bad.write('App.js', "export { default } from './src/App'")
  const r1 = await bad.run('npm run build')
  ok('坏相对 import 被检出（exit=1 + 明确错误）', r1.exitCode === 1 && /引用了不存在的文件/.test(r1.stderr), r1.stderr.split('\n')[0])

  // 2. 同结构但 src/App.tsx 存在 → 通过（TSX 支持，与 Sandpack/esbuild 一致）
  const good = new Sandbox()
  Object.entries(base).forEach(([p, c]) => good.write(p, c))
  good.write('App.js', "export { default } from './src/App'")
  good.write('src/App.tsx', "import React from 'react'\nexport default function App() { return <div>ok</div> }")
  const r2 = await good.run('npm run build')
  ok('TSX 目标存在时通过（exit=0）', r2.exitCode === 0, r2.exitCode === 0 ? r2.stdout.split('\n')[0] : r2.stderr)

  // 3. 目录式 import（./components → components/index.js）+ css 不参与检查 + 裸包名不误报
  const dir = new Sandbox()
  Object.entries(base).forEach(([p, c]) => dir.write(p, c))
  dir.write('App.js', "import React from 'react'\nimport List from './components'\nimport './styles.css'\nexport default function App() { return <List /> }")
  dir.write('components/index.js', "import React from 'react'\nexport default () => <ul />")
  dir.write('styles.css', 'body {}')
  const r3 = await dir.run('npm run build')
  ok('目录式 import / css import / 裸包名 均不误报', r3.exitCode === 0, r3.exitCode === 0 ? '' : r3.stderr)

  fs.rmSync(tmp, { force: true })
  console.log(fail === 0 ? `=== import 解析校验单测通过（3 项） ===` : `=== 失败（${fail} 项） ===`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
