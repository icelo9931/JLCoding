// 版本快照：SHA-256 文件集哈希 + append-only 版本历史（回滚产生新条目，git-revert 语义，历史不丢）
import { createHash } from 'crypto'
import { db } from '@/lib/db'
import { languageOf } from '@/lib/utils'

export interface SnapshotFile {
  path: string
  content: string
}

// 规范化序列化（按 path 排序）后哈希：同一文件集（内容级相同）永远得到同一 SHA，
// 用于 e2e 断言「未涉及文件内容级不变」——比逐字节比对更稳健（换行/编码微差不改变语义时哈希一致）
export function computeFilesSha(files: SnapshotFile[]): string {
  const canonical = [...files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => `${f.path}\n${f.content}`)
    .join('\n\n')
  return createHash('sha256').update(canonical).digest('hex')
}

export function sha8(sha: string): string {
  return sha.slice(0, 8)
}

// 创建版本快照（append-only：version 递增，永不覆盖旧版本）
export async function createVersionSnapshot(params: {
  projectId: string
  files: SnapshotFile[]
  provider?: string | null
  summary: string
}): Promise<{ version: number; sha: string; summary: string }> {
  const { projectId, files, provider, summary } = params
  const sha = computeFilesSha(files)
  const last = await db.projectVersion.findFirst({
    where: { projectId },
    orderBy: { version: 'desc' },
    select: { version: true },
  })
  const version = (last?.version ?? 0) + 1
  await db.projectVersion.create({
    data: {
      projectId,
      version,
      sha,
      provider: provider ?? null,
      summary,
      filesJson: JSON.stringify(files),
    },
  })
  return { version, sha, summary }
}

// ---------- VERSION 意图模块（确定性，不经 LLM）：diff 计算 / 目标解析 / 共享回滚事务 ----------

export interface VersionDiffResult {
  added: string[]
  removed: string[]
  changed: { path: string; delta: number }[] // delta = 目标版相对来源版的字符变化量
  unchangedCount: number
}

// 两份快照的结构化对比（文件级：新增 / 删除 / 内容变更量 / 未变化数）
export function diffSnapshots(a: SnapshotFile[], b: SnapshotFile[]): VersionDiffResult {
  const mapA = new Map(a.map((f) => [f.path, f.content]))
  const mapB = new Map(b.map((f) => [f.path, f.content]))
  const added: string[] = []
  const removed: string[] = []
  const changed: { path: string; delta: number }[] = []
  let unchangedCount = 0
  for (const [p, c] of Array.from(mapB.entries())) {
    if (!mapA.has(p)) { added.push(p); continue }
    if (mapA.get(p) === c) unchangedCount++
    else changed.push({ path: p, delta: c.length - (mapA.get(p) ?? '').length })
  }
  for (const p of Array.from(mapA.keys())) if (!mapB.has(p)) removed.push(p)
  return {
    added: added.sort(),
    removed: removed.sort(),
    changed: changed.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0)),
    unchangedCount,
  }
}

// 解析回滚目标：「回滚到 v1 / 恢复到 v2 / 切换到上一版」→ 版本号（无明确目标返回 null）
export function parseRollbackTarget(text: string, latest: number): number | null {
  const vm = text.match(/v\s*(\d+)/i) ?? text.match(/(?:回滚|恢复到|切换到|还原到)[^\d]{0,6}(\d+)/)
  if (vm) {
    const n = parseInt(vm[1], 10)
    if (n >= 1 && n <= latest) return n
    return null // 数字超界 → 明确无效（如「回滚到 v99」）
  }
  if (/上一版|上一轮|上一个版本/.test(text) && latest >= 2) return latest - 1
  return null
}

// 解析对比对象：「对比 v1 和 v3」「上一版哪里变了」→ [from, to]（无版本语境默认最近两版）
export function parseDiffPair(text: string, latest: number): [number, number] | null {
  const nums: number[] = []
  const re = /v\s*(\d+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const n = parseInt(m[1], 10)
    if (n >= 1 && n <= latest && !nums.includes(n)) nums.push(n)
  }
  if (nums.length >= 2) return [nums[0], nums[1]]
  if (nums.length === 1) {
    if (latest !== nums[0]) return [nums[0], latest]
    return latest >= 2 ? [latest - 1, latest] : null
  }
  if (latest >= 2) return [latest - 1, latest]
  return null
}

// 版本条目摘要行（版本模块的列表展示用）
export function formatVersionBrief(v: {
  version: number
  sha: string
  summary: string
  provider?: string | null
  createdAt: Date | string
}): string {
  const time = new Date(v.createdAt).toLocaleString('zh-CN', { hour12: false })
  return `v${v.version} · ${sha8(v.sha)} · ${time} · ${v.summary}${v.provider ? `（${v.provider}）` : ''}`
}

// 共享回滚事务（REST rollback 接口与对话触发回滚同源；$transaction 四操作原子）
export async function rollbackToVersion(params: { projectId: string; targetVersion: number; provider?: string | null }): Promise<
  | { ok: false; error: string }
  | { ok: true; nextVersion: number; sha: string; rolledBackFrom: number; files: SnapshotFile[] }
> {
  const { projectId, targetVersion, provider } = params
  const target = await db.projectVersion.findUnique({
    where: { projectId_version: { projectId, version: targetVersion } },
  })
  if (!target) return { ok: false, error: `版本 v${targetVersion} 不存在` }

  let files: SnapshotFile[]
  try {
    files = JSON.parse(target.filesJson) as SnapshotFile[]
    if (!Array.isArray(files) || files.some((f) => typeof f?.path !== 'string' || typeof f?.content !== 'string')) {
      throw new Error('bad format')
    }
  } catch {
    return { ok: false, error: '版本快照数据损坏，无法回滚' }
  }

  const [last] = await db.projectVersion.findMany({
    where: { projectId },
    orderBy: { version: 'desc' },
    take: 1,
  })
  const nextVersion = (last?.version ?? 0) + 1
  const summary = `回滚自 v${targetVersion}（${target.summary}）`
  const sha = computeFilesSha(files)

  await db.$transaction([
    db.file.deleteMany({ where: { projectId } }),
    db.file.createMany({
      data: files.map((f) => ({ projectId, path: f.path, content: f.content, language: languageOf(f.path) })),
    }),
    db.projectVersion.create({
      data: { projectId, version: nextVersion, sha, provider: provider ?? null, summary, filesJson: target.filesJson },
    }),
    db.project.update({ where: { id: projectId }, data: { status: 'ready' } }),
  ])
  return { ok: true, nextVersion, sha, rolledBackFrom: targetVersion, files }
}
