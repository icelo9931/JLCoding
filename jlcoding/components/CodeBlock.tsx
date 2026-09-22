'use client'

import { useMemo } from 'react'

// 轻量代码高亮（IDE Dark+ 风配色）：关键词/字符串/数字/注释/函数——正则分词，零依赖
const COLORS = {
  keyword: '#C586C0',
  control: '#569CD6',
  type: '#4EC9B0',
  string: '#CE9178',
  number: '#B5CEA8',
  comment: '#6A9955',
  fn: '#DCDCAA',
  punct: '#D4D4D4',
  plain: '#D4D4D4',
}

const JS_KEYWORDS = /^(const|let|var|function|return|if|else|for|while|import|from|export|default|class|extends|new|async|await|try|catch|finally|throw|typeof|of|in|switch|case|break|continue|do|null|undefined|true|false|this)$/
const PY_KEYWORDS = /^(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|lambda|pass|break|continue|global|nonlocal|assert|yield|and|or|not|is|in|None|True|False|self|async|await)$/

export function CodeBlock({ code, language = 'js', maxHeight }: {
  code: string
  language?: 'js' | 'jsx' | 'ts' | 'json' | 'css' | 'py' | 'text'
  maxHeight?: string
}) {
  const tokens = useMemo(() => highlight(code, language), [code, language])
  return (
    <pre
      className="overflow-auto rounded-lg bg-[#1E1E1E] p-4 font-mono text-[12px] leading-relaxed"
      style={maxHeight ? { maxHeight } : undefined}
    >
      <code>
        {tokens.map((t, i) => (
          <span key={i} style={{ color: t.color }}>{t.text}</span>
        ))}
      </code>
    </pre>
  )
}

interface Token { text: string; color: string }

function highlight(code: string, language: string): Token[] {
  if (language === 'text') return [{ text: code, color: COLORS.plain }]
  const isPy = language === 'py'
  const keywords = isPy ? PY_KEYWORDS : JS_KEYWORDS
  const tokens: Token[] = []

  // 分词：注释、字符串、数字、标识符、其他
  const pattern = isPy
    ? /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([\s\S])/g
    : /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:[^`\\]|\\[\s\S])*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([\s\S])/g

  let i = 0
  let m: RegExpExecArray | null
  while ((m = pattern.exec(code))) {
    const [full, comment, str, num, ident, other] = m
    if (comment) tokens.push({ text: comment, color: COLORS.comment })
    else if (str) tokens.push({ text: str, color: COLORS.string })
    else if (num) tokens.push({ text: num, color: COLORS.number })
    else if (ident) {
      const prev = tokens[tokens.length - 1]
      const followed = code.slice(m.index + full.length).match(/^\s*\(/)
      if (keywords.test(ident)) tokens.push({ text: ident, color: COLORS.keyword })
      else if (followed && prev && /[\s(=,:{]/.test(prev.text.slice(-1))) tokens.push({ text: ident, color: COLORS.fn })
      else tokens.push({ text: ident, color: COLORS.plain })
    } else if (other) {
      if (!tokens.length || tokens[tokens.length - 1].color !== COLORS.punct) tokens.push({ text: other, color: COLORS.punct })
      else tokens[tokens.length - 1].text += other
    }
    i++
    if (i > 200000) break // 防御性上限
  }
  return tokens
}
