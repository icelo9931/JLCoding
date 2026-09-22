// sandbox const 重赋值检测逻辑验证（与 lib/sandbox.ts 同步的正则逻辑副本）
function constReassignments(source) {
  const offenders = new Set()
  const cleaned = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, '""')
    .replace(/"(?:[^"\\]|\\[\s\S])*"/g, '""')
    .replace(/'(?:[^'\\]|\\[\s\S])*'/g, "''")
  const constNames = new Set()
  for (const m of cleaned.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=/g)) constNames.add(m[1])
  for (const name of constNames) {
    const re = new RegExp(`(?<![\\w$.])${name}\\s*(\\+\\+|--|[+\\-*/%]?=[^=])`, 'g')
    let match
    while ((match = re.exec(cleaned))) {
      const before = cleaned.slice(Math.max(0, match.index - 30), match.index)
      if (/\bconst\s*$/.test(before)) continue
      offenders.add(name)
      break
    }
  }
  return Array.from(offenders)
}

// 场景 1：lunar.js 实际 bug（const offset 后 offset -= 与 offset++）
const bad = `const offset = 123;\nlet yearDays = 10;\nwhile (offset >= yearDays) {\n  offset -= yearDays;\n  offset++;\n}\n`
console.log('bug 代码检出:', JSON.stringify(constReassignments(bad)), '=>', constReassignments(bad).includes('offset') ? 'PASS ✓' : 'FAIL ✗')

// 场景 2：正常代码（let 累减、== === <= >= != 比较、const 声明行）
const good = `const offset = 123;\nlet rest = offset;\nrest -= 10;\nconst isEqual = (rest == 10);\nconst isSame = (rest === 10);\nconst cmp = (rest <= 5) && (rest >= 1) && (rest != 2);\nconst msg = "offset -= 1";\n`
console.log('正常代码零误报:', constReassignments(good).length === 0 ? 'PASS ✓' : `FAIL ✗ ${JSON.stringify(constReassignments(good))}`)

// 场景 3：对象属性与字符串不误报
const tricky = `const cfg = {a:1};\ncfg.a = 2;           // 属性赋值，应忽略（\.name 前缀排除）\nconst s = "x = y";\n`
console.log('属性/字符串不误报:', constReassignments(tricky).length === 0 ? 'PASS ✓' : `FAIL ✗ ${JSON.stringify(constReassignments(tricky))}`)
