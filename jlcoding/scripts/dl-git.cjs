// 从 npmmirror 镜像下载 Git 安装包
const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream/promises')

const MIRRORS = [
  'https://registry.npmmirror.com/-/binary/git-for-windows/v2.45.2.windows.1/Git-2.45.2-64-bit.exe',
  'https://registry.npmmirror.com/-/binary/git-for-windows/v2.50.1.windows.1/Git-2.50.1-64-bit.exe',
]

async function main() {
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url)
      if (!res.ok) { console.log('miss:', url, res.status); continue }
      const size = res.headers.get('content-length')
      console.log('downloading:', url, size, 'bytes')
      const out = path.join(process.env.TEMP, 'GitInstaller.exe')
      await pipeline(res.body, fs.createWriteStream(out))
      console.log('saved to', out, fs.statSync(out).size, 'bytes')
      return
    } catch (e) { console.log('failed:', url, e.message) }
  }
  process.exit(1)
}
main()
