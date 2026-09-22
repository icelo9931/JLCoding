// 把 lucide 的 Github 品牌图标替换为自建 GithubIcon
const fs = require('fs')
const files = ['components/ConnectDialog.tsx', 'components/LoginModal.tsx', 'components/Sidebar.tsx', 'components/TopBar.tsx']
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8')
  // 从 lucide-react import 列表中移除 Github
  s = s.replace(/, Github, /g, ', ').replace(/\{ Github, /g, '{ ').replace(/, Github \}/g, ' }').replace(/\{ Github \}/g, '{}')
  // JSX 使用替换
  s = s.replace(/<Github /g, '<GithubIcon ').replace(/<Github\/>/g, '<GithubIcon/>')
  // 注入 import
  if (s.includes('GithubIcon') && !s.includes('@/components/icons')) {
    s = s.replace("'use client'\n", "'use client'\n\nimport { GithubIcon } from '@/components/icons'\n")
  }
  fs.writeFileSync(f, s)
  console.log(f, 'patched, hasIcon:', s.includes('GithubIcon'), 'lucideGithubLeft:', /import \{[^}]*\bGithub\b[^}]*\} from 'lucide-react'/.test(s))
}
