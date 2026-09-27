// 构建时注入平台自身的 commit SHA（评审可验证「线上部署对应 GitHub 的哪个 commit」）：
// 优先 CI 环境变量（Vercel/Render），fallback 本地 git rev-parse；写入 public/build-info.json，
// 由页面 fetch('/build-info.json') 展示，也在 /api/status 一并返回。
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function resolveSha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA
  if (process.env.RENDER_GIT_COMMIT) return process.env.RENDER_GIT_COMMIT
  try {
    return execSync('git rev-parse HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return null
  }
}

const info = {
  sha: resolveSha(),
  builtAt: new Date().toISOString(),
  host: process.env.RENDER ? 'render' : process.env.VERCEL ? 'vercel' : 'local',
}

fs.mkdirSync(path.join(root, 'public'), { recursive: true })
fs.writeFileSync(path.join(root, 'public', 'build-info.json'), JSON.stringify(info, null, 2) + '\n')
console.log(`[build-info] sha=${info.sha ? info.sha.slice(0, 8) : 'unknown'} host=${info.host}`)
