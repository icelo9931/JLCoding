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

  // 模拟构建校验：静态检查生成的文件集
  private validate(): CommandResult {
    const errors: string[] = []

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
