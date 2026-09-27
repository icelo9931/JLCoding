// QA 模式的联网工具（尽力而为 + 失败如实，不假装搜到/读到）：
// - webSearch：DuckDuckGo HTML 端点（零 Key）。升级路径（按可用性替换本文件实现即可）：
//   ① OpenCode 内置 websearch（Exa，需 OPENCODE_ENABLE_EXA=true 且走 OpenCode 自家工具层——
//      本平台经 /chat/completions 直连其模型端点，不经过其工具层，故不适用）；
//   ② Vercel AI Gateway perplexitySearch（$5/1000 次，provider 无关，需配置网关 Key）。
// - readUrlText：抓取网页正文（去标签、截断），与「参考链接」上下文抓取同源逻辑。
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

export interface SearchHit {
  title: string
  snippet: string
  url: string
}

// DuckDuckGo HTML 版结果页解析（class="result__a" 标题链接 + class="result__snippet" 摘要）
function parseDdgHtml(html: string): SearchHit[] {
  const hits: SearchHit[] = []
  const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]*class="[^"]*result__a|<\/body|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && hits.length < 5) {
    const title = stripTags(m[2]).trim()
    const after = m[3]
    const sm = after.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/)
    const snippet = sm ? stripTags(sm[1]).trim() : ''
    let url = m[1]
    // DDG 跳转链接：//duckduckgo.com/l/?uddg=<encoded>
    const uddg = url.match(/[?&]uddg=([^&]+)/)
    if (uddg) url = decodeURIComponent(uddg[1])
    if (title) hits.push({ title, snippet, url })
  }
  return hits
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
}

export async function webSearch(query: string): Promise<string> {
  if (!query.trim()) return '搜索词为空'
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query.slice(0, 200))}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return `搜索暂不可达（HTTP ${res.status}）——可稍后再试，或给出具体链接让我直接读取网页`
    const html = await res.text()
    const hits = parseDdgHtml(html)
    if (!hits.length) return `搜索「${query}」无结果——可换一种问法，或给出具体链接让我直接读取网页`
    return hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.snippet}\n   来源：${h.url}`).join('\n')
  } catch {
    return '搜索暂不可达（网络原因）——可稍后再试，或给出具体链接让我直接读取网页'
  }
}

export async function readUrlText(rawUrl: string): Promise<string> {
  const url = /^https?:\/\//.test(rawUrl) ? rawUrl : `https://${rawUrl}`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return `网页读取失败（HTTP ${res.status}）：${url}`
    const html = await res.text()
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) return `网页无正文内容：${url}`
    return `【${url}】\n${text.slice(0, 4000)}`
  } catch {
    return `网页读取失败（超时或不可达）：${url}`
  }
}
