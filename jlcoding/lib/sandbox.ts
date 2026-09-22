// 内存沙箱：writeFile/readFile 操作内存文件映射（由调用方负责持久化到数据库），
// runCommand 为模拟校验（JSON 解析 / 必需文件 / 依赖声明 / 括号平衡检查）。
// 预览由前端 Sandpack 在浏览器内完成真实编译，编译耗时由前端回传日志。

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

export class Sandbox {
  private files = new Map<string, string>()

  constructor(initial?: Record<string, string>) {
    for (const [path, content] of Object.entries(initial ?? {})) {
      this.files.set(path, content)
    }
  }

  write(path: string, content: string) {
    this.files.set(path, content)
  }

  read(path: string): string | null {
    return this.files.get(path) ?? null
  }

  list(): { path: string; content: string }[] {
    return Array.from(this.files.entries()).map(([path, content]) => ({ path, content }))
  }

  hasFiles(): boolean {
    return this.files.size > 0
  }

  async run(command: string): Promise<CommandResult> {
    if (command.includes('install')) {
      return { stdout: 'added 0 packages（Sandpack 浏览器内打包，无需安装）', stderr: '', exitCode: 0 }
    }
    if (command.includes('build') || command.includes('test')) {
      return this.validate()
    }
    if (command.includes('ls') || command.includes('cat')) {
      return { stdout: Array.from(this.files.keys()).join('\n'), stderr: '', exitCode: 0 }
    }
    return { stdout: '', stderr: `command not found: ${command}`, exitCode: 1 }
  }

  // 模拟构建校验：静态检查生成的文件集（React 与 Python 项目分别适配）
  private validate(): CommandResult {
    const errors: string[] = []
    const paths = Array.from(this.files.keys())
    const isPython = paths.some((p) => p.endsWith('.py')) && !paths.some((p) => /^(index|App)\.(js|jsx)$/.test(p) && !p.includes('/'))

    if (isPython) {
      // Python 项目：入口 main.py + 括号平衡
      if (!paths.includes('main.py')) {
        errors.push('error: 缺少入口文件 main.py')
      }
      for (const [path, content] of Array.from(this.files.entries())) {
        if (path.endsWith('.py') && !balancedBraces(content)) {
          errors.push(`error: ${path} 括号/引号不匹配，可能存在语法错误`)
        }
        if (path.endsWith('.py') && !/__main__/.test(content)) {
          errors.push(`error: ${path} 缺少 if __name__ == '__main__' 入口`)
        }
      }
      if (errors.length > 0) return { stdout: '', stderr: errors.join('\n'), exitCode: 1 }
      return {
        stdout: `✓ Python 项目校验通过（${this.files.size} 个文件，括号平衡 / 入口完整 / 无语法硬伤）\n运行方式：python main.py（标准库 tkinter，无需安装依赖）`,
        stderr: '',
        exitCode: 0,
      }
    }

    const pkg = this.files.get('package.json')
    if (!pkg) {
      errors.push("error: 缺少 package.json")
    } else {
      try {
        const parsed = JSON.parse(pkg)
        const deps = { ...parsed.dependencies, ...parsed.devDependencies }
        if (!deps.react) errors.push('error: package.json 缺少依赖 react')
        if (!deps['react-dom']) errors.push('error: package.json 缺少依赖 react-dom')
      } catch {
        errors.push('error: package.json 不是合法 JSON')
      }
    }

    if (!this.files.has('index.js') && !this.files.has('index.jsx') && !this.files.has('src/index.js')) {
      errors.push('error: 缺少入口文件 index.js')
    }
    if (!this.files.has('App.js') && !this.files.has('App.jsx') && !this.files.has('src/App.js')) {
      errors.push('error: 缺少根组件 App.js')
    }

    for (const [path, content] of Array.from(this.files.entries())) {
      if (path.endsWith('.json')) {
        try { JSON.parse(content) } catch { errors.push(`error: ${path} 不是合法 JSON`) }
      }
      if (/\.(js|jsx|ts|tsx)$/.test(path) && !balancedBraces(content)) {
        errors.push(`error: ${path} 括号不匹配，可能存在语法错误`)
      }
      if (/\.(js|jsx|ts|tsx)$/.test(path)) {
        for (const offender of constReassignments(content)) {
          errors.push(`error: ${path} 对 const 常量 ${offender} 重新赋值（需改为 let 声明），行内位置见代码`)
        }
      }
    }

    if (errors.length > 0) {
      return { stdout: '', stderr: errors.join('\n'), exitCode: 1 }
    }
    return {
      stdout: `✓ ${this.files.size} 个文件校验通过（JSON 合法 / 入口完整 / 依赖声明正确）\n真实编译由 Sandpack 在浏览器内完成`,
      stderr: '',
      exitCode: 0,
    }
  }
}

function balancedBraces(source: string): boolean {
  let depth = 0
  let inString: string | null = null
  let escaped = false
  let inComment: 'line' | 'block' | null = null
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    const next = source[i + 1]
    if (inComment === 'line') { if (c === '\n') inComment = null; continue }
    if (inComment === 'block') { if (c === '*' && next === '/') { inComment = null; i++ } continue }
    if (inString) {
      if (escaped) { escaped = false; continue }
      if (c === '\\') { escaped = true; continue }
      if (c === inString) inString = null
      continue
    }
    if (c === '/' && next === '/') { inComment = 'line'; i++; continue }
    if (c === '/' && next === '*') { inComment = 'block'; i++; continue }
    if (c === '"' || c === "'" || c === '`') { inString = c; continue }
    if (c === '{' || c === '(' || c === '[') depth++
    if (c === '}' || c === ')' || c === ']') { depth--; if (depth < 0) return false }
  }
  return depth === 0 && inString === null
}

// const 常量重赋值检测（启发式）：const 声明的标识符出现在 += -= *= /= %= ++ -- 或单独 = 左侧
// 用于拦截如 "const offset = ...; offset -= yearDays" 这类 Sandpack 编译期错误
function constReassignments(source: string): string[] {
  const offenders = new Set<string>()
  // 去掉字符串与注释，避免误报
  const cleaned = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, '""')
    .replace(/"(?:[^"\\]|\\[\s\S])*"/g, '""')
    .replace(/'(?:[^'\\]|\\[\s\S])*'/g, "''")
  // 收集 const 声明的标识符
  const constNames = new Set<string>()
  const declRe = /\bconst\s+([A-Za-z_$][\w$]*)\s*=/g
  let declMatch: RegExpExecArray | null
  while ((declMatch = declRe.exec(cleaned))) {
    constNames.add(declMatch[1])
  }
  // 检查这些标识符是否被重赋值
  for (const name of Array.from(constNames)) {
    // 匹配 name++ / name-- / name += x / name -= x / name = x（== 与 === 自然被 [^=] 排除）
    const re = new RegExp(`(?<![\\w$.])${name}\\s*(\\+\\+|--|[+\\-*/%]?=[^=])`, 'g')
    let match: RegExpExecArray | null
    while ((match = re.exec(cleaned))) {
      const before = cleaned.slice(Math.max(0, match.index - 30), match.index)
      // 声明行（const name = ...）不算重赋值：before 应以 const 结尾
      if (/\bconst\s*$/.test(before)) continue
      offenders.add(name)
      break
    }
  }
  return Array.from(offenders)
}

