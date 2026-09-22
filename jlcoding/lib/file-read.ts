'use client'

// 上传文件读取：文本类读内容，图片/二进制仅记录说明
export interface ParsedFiles {
  text: string // 拼装后的 fileContext
  chips: string[] // 展示用文件名
}

const TEXT_EXT = ['txt', 'md', 'csv', 'json', 'js', 'ts', 'html', 'xml', 'yml', 'yaml', 'log']
const MAX_TOTAL = 20000 // 字符上限，防止上下文爆炸

export async function parseFiles(files: FileList | File[]): Promise<ParsedFiles> {
  const parts: string[] = []
  const chips: string[] = []
  let total = 0

  for (const file of Array.from(files)) {
    chips.push(file.name)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (TEXT_EXT.includes(ext) && total < MAX_TOTAL) {
      const content = await file.text()
      const sliced = content.slice(0, Math.max(0, MAX_TOTAL - total))
      parts.push(`【文件：${file.name}】\n${sliced}`)
      total += sliced.length
    } else if (file.type.startsWith('image/')) {
      parts.push(`【图片：${file.name}（当前版本暂不解析图片内容，仅记录文件名）】`)
    } else {
      parts.push(`【附件：${file.name}（${file.type || '未知类型'}，未解析内容）】`)
    }
  }
  return { text: parts.join('\n\n'), chips }
}
