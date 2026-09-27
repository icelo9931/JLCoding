// 生成应用的元信息判定：React 入口检测 / 项目语言判定。
// sandbox 静态校验与前端 Sandpack 预览共用同一套规则，
// 修复「校验通过但预览白屏」（如实际入口是 index.jsx 却被强制 main=index.js）的不一致。

// React 入口候选：按优先级探测实际存在者
export const REACT_ENTRY_CANDIDATES = ['index.js', 'index.jsx', 'src/index.js', 'src/index.jsx']

export function detectEntry(paths: string[]): string | null {
  for (const entry of REACT_ENTRY_CANDIDATES) {
    if (paths.includes(entry)) return entry
  }
  return null
}

export function hasReactEntry(paths: string[]): boolean {
  return detectEntry(paths) !== null
}

// Python 项目：存在 .py 文件且没有 React 入口（React 入口优先，混合时按 React 预览）
export function isPythonProject(paths: string[]): boolean {
  return paths.some((p) => p.endsWith('.py')) && !hasReactEntry(paths)
}
