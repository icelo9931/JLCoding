// 快速验证 esbuild 打包关键配置：.js 内 JSX loader + react/react-dom 绝对路径 alias
const esbuild = require('esbuild')
const path = require('path')
const fs = require('fs')
const os = require('os')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esb-check-'))
// 用「命名导入 + JSX」的文件——正是曾导致 classic 转换崩溃（React is not defined）的场景
fs.writeFileSync(path.join(dir, 'TodoItem.js'), `import { useState } from 'react'
export default function TodoItem({ text }) {
  const [done, setDone] = useState(false)
  return <li className="item" onClick={() => setDone(!done)}>{done ? '✓ ' : ''}{text}</li>
}
`)
fs.writeFileSync(path.join(dir, 'index.js'), `import React from 'react'
import { createRoot } from 'react-dom/client'
import TodoItem from './TodoItem'
function App() {
  return <div><TodoItem text="hi" /></div>
}
createRoot(document.getElementById('root')).render(<App />)
`)

const nm = path.join(process.cwd(), 'node_modules')

esbuild.build({
  entryPoints: [path.join(dir, 'index.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2018',
  jsx: 'automatic',
  loader: { '.js': 'jsx', '.jsx': 'jsx' },
  alias: { react: path.join(nm, 'react'), 'react-dom': path.join(nm, 'react-dom') },
  nodePaths: [process.cwd()],
  write: false,
  legalComments: 'none',
  logLevel: 'silent',
}).then((r) => {
  // write:false 时产物路径为 '<stdout>'，直接取第一个
  const js = r.outputFiles.find((f) => f.text && f.text.length > 0).text
  const checks = {
    'react 运行时打入（useState/React 内部代码）': /useState|react\.production|jsx/i.test(js),
    'automatic runtime 注入（jsx-runtime/_jsx）': /jsx-runtime|_jsx\(/.test(js),
    'createRoot 存在': /createRoot/.test(js),
    '组件代码存在': /TodoItem|item/.test(js),
    '体积 > 100KB（自包含）': js.length > 100_000,
  }
  let fail = 0
  for (const [name, ok] of Object.entries(checks)) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fail++ }
  console.log(fail === 0 ? '=== esbuild 配置验证通过 ===' : '=== 失败 ===')
  process.exit(fail === 0 ? 0 : 1)
}).catch((e) => { console.error('FAIL 打包报错:', e.message); process.exit(1) })
