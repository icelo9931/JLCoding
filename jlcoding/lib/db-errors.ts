// 数据库错误兜底：P1001/P1002 连接失败时返回可读信息，避免裸 500
import { db } from '@/lib/db'

export function dbErrorText(): string {
  return '数据库暂时不可达（本地为 SQLite，线上为 Neon），请确认网络后重试'
}

export async function isDbReachable(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`
    return true
  } catch (e) {
    console.error('[jlcoding] DB 不可达:', e instanceof Error ? e.message : e)
    return false
  }
}
