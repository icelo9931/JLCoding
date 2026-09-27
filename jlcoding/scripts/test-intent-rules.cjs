// 意图规则确定性单测：esbuild 现编译 lib/intent-rules.ts（纯函数零依赖）后断言真实源码行为。
// 必含用户实测原话：「两轮的旧功能、源码、Preview、版本号和 SHA，请给出对比」→ version_diff
const esbuild = require('esbuild')
const fs = require('fs')
const os = require('os')
const path = require('path')

const tmp = path.join(os.tmpdir(), `intent-rules-${Date.now()}.cjs`)
esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', 'lib', 'intent-rules.ts')],
  outfile: tmp,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
})
const { ruleIntent } = require(tmp)
fs.rmSync(tmp, { force: true })

let pass = 0, fail = 0
const ok = (input, expected) => {
  const actual = ruleIntent(input)
  const cond = actual === expected
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS ✓' : 'FAIL ✗'} [${expected}] ${input.slice(0, 46)}${input.length > 46 ? '…' : ''}${cond ? '' : `  ｜ 实际=${actual}`}`)
}

console.log('--- 用户实测原话（必测） ---')
ok('两轮的旧功能、源码、Preview、版本号和 SHA，请给出对比', 'version_diff')
ok('对比 v1 和 v2', 'version_diff')
ok('上一版哪里变了', 'version_diff')
ok('这两轮生成的结果有什么区别', 'version_diff')

console.log('--- VERSION：回滚 / 列表（规则层拦截，绝不触发生成） ---')
ok('回滚到 v1', 'version_rollback')
ok('恢复到 v2', 'version_rollback')
ok('切换到上一版', 'version_rollback')
ok('现在有几个版本了？把版本历史列出来', 'version_list')
ok('列出所有版本', 'version_list')

console.log('--- CODE：生成 / 增量修改 ---')
ok('做一个极简番茄钟计时器', 'code')
ok('给计算器加上退格按钮', 'code')
ok('把主题改成深色', 'code')
ok('生成一个待办应用', 'code')

console.log('--- QA：提问 / 解释（不进管线） ---')
ok('什么是 React 的 useState？为什么我生成的应用里要用它？', 'qa')
ok('解释一下 useEffect 的依赖数组', 'qa')
ok('为什么生成的按钮点了没反应', 'qa')

console.log('--- 反误判（名词性引用不触发 CODE） ---')
ok('这两轮生成的结果有什么区别', 'version_diff') // 「生成的结果」名词引用
ok('为什么我生成的应用里要用 useState？', 'qa') // 「生成的应用」名词引用（历史真实误判案例）
ok('实现的思路是什么？', 'qa') // 「实现的」名词引用

console.log('--- 未命中（返回 null → LLM 兜底） ---')
const unmatched = ruleIntent('帮我看看这个项目的整体情况如何')
console.log(`${unmatched === null ? 'PASS ✓' : 'FAIL ✗'} 未命中返回 null（LLM 兜底）${unmatched === null ? '' : `  ｜ 实际=${unmatched}`}`)
unmatched === null ? pass++ : fail++
// 注：「帮我评估一下这个项目做得怎么样」含「怎么样」→ 命中 QA（正确路由，非未命中）

console.log(fail === 0 ? `\n=== 意图规则单测全部通过 ✓（${pass} 项） ===` : `\n=== 失败 ✗（${fail} 项） ===`)
process.exit(fail === 0 ? 0 : 1)
