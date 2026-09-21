import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'jlCoding — 把 idea 变成可运行的代码',
  description: '输入自然语言需求，AI 智能体分析、设计、编码、校验，实时预览可运行的应用',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="antialiased bg-zinc-950 text-zinc-100">{children}</body>
    </html>
  )
}
