// 服务端真实打包：把生成的 React 应用（多个 JSX 文件 + CSS）用 esbuild 打成
// 一个自包含的单文件 HTML（react/react-dom 从平台 node_modules 打入，浏览器零依赖可跑），
// 用于「部署」——托管在 jlCoding 自身域名下（/app/:id），作为可分享的公开访问链接。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { createHash } from 'crypto'
import { detectEntry } from './app-meta'

export interface BundleResult {
  html: string
  sha: string
  entry: string
}

// 剥离 JS 中的 css import（css 由打包器单独收集内联，避免 esbuild css 输出的边角行为）
function stripCssImports(source: string): string {
  return source.replace(/^[ \t]*import\s+['"][^'"]+\.css['"]\s*;?[ \t]*$/gm, '')
}

// 未显式 import React 但包含 JSX 的文件补一个（约束要求 import，此处兜底防打包失败）
function ensureReactImport(source: string): string {
  if (/from\s+['"]react['"]/.test(source)) return source
  if (/<[A-Za-z][^>]*>/.test(source)) return `import React from 'react'\n${source}`
  return source
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

export async function bundleReactApp(files: { path: string; content: string }[], projectName: string): Promise<BundleResult> {
  const paths = files.map((f) => f.path)
  const entry = detectEntry(paths)
  if (!entry) {
    throw new Error('缺少 React 入口文件（index.js / index.jsx / src/index.js），无法打包部署')
  }

  const dir = mkdtempSync(path.join(tmpdir(), 'jlcoding-bundle-'))
  try {
    let css = ''
    for (const f of files) {
      if (f.path.endsWith('.css')) {
        css += `\n/* ${f.path} */\n${f.content}`
        continue
      }
      // 未显式 import React 但包含 JSX/React.* 的文件补一个（automatic runtime 下 JSX 不再依赖
      // React 进作用域，此处兜底显式 React.Fragment / React.createElement 用法）
      if (/\.(js|jsx)$/.test(f.path)) {
        const dest = path.join(dir, f.path)
        mkdirSync(path.dirname(dest), { recursive: true })
        writeFileSync(dest, ensureReactImport(stripCssImports(f.content)), 'utf8')
      }
      if (/\.(ts|tsx)$/.test(f.path)) {
        const dest = path.join(dir, f.path)
        mkdirSync(path.dirname(dest), { recursive: true })
        writeFileSync(dest, stripCssImports(f.content), 'utf8')
      }
    }

    // 动态引入（serverComponentsExternalPackages 声明的原生二进制包必须动态 require）
    const esbuild = await import('esbuild')
    const nm = path.join(process.cwd(), 'node_modules')
    const result = await esbuild.build({
      entryPoints: [path.join(dir, entry)],
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: 'es2018',
      // automatic runtime：JSX 编译为 react/jsx-runtime 导入，彻底消除「React 未进作用域」类运行时错误
      // （实测曾因 import { useState } from 'react' 命名导入 + classic 转换导致 bundle 运行时崩溃）
      jsx: 'automatic',
      loader: { '.js': 'jsx', '.jsx': 'jsx' },
      // react / react-dom 用绝对路径 alias 解析（临时目录里没有 node_modules，alias 比 nodePaths 确定）
      alias: { react: path.join(nm, 'react'), 'react-dom': path.join(nm, 'react-dom') },
      nodePaths: [process.cwd()],
      write: false,
      legalComments: 'none',
      logLevel: 'silent',
    })

    // write:false 且未指定 outfile 时产物路径为 '<stdout>'——不能按扩展名查找，直接取第一个产物
    const jsFile = result.outputFiles.find((f) => f.text && f.text.length > 0)
    if (!jsFile) throw new Error('打包未产出 JS 产物')
    const js = jsFile.text

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(projectName || 'Generated App')} · jlCoding</title>
<style>${css}\nhtml,body{margin:0;padding:0}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>`

    const sha = createHash('sha256').update(html).digest('hex')
    return { html, sha, entry }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
