// 平台运行状态：区分「真实模型调用」与「无 Key 的 Mock 演示」。
// 评审者可通过本接口核对线上是否真实命中 OpenCode Provider（不回显 Key）。
import { NextResponse } from 'next/server'
import { hasModel } from '@/lib/agent'
import { DEFAULT_MODEL } from '@/lib/models'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 网关可达性探测缓存（60s，避免每次状态请求都打网关）
let gatewayCheck: { at: number; reachable: boolean | null; httpStatus: number | null } = { at: 0, reachable: null, httpStatus: null }

export async function GET() {
  const baseUrl = process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/go/v1'
  const withModel = hasModel()

  if (withModel && Date.now() - gatewayCheck.at > 60_000) {
    try {
      const res = await fetch(`${baseUrl}/models`, {
        headers: { 'User-Agent': 'jlcoding/1.0' },
        signal: AbortSignal.timeout(4000),
      })
      // 任何 HTTP 响应（含 401/404）都证明网关可达；只有 fetch 抛错（连接超时/重置）才是网络不可达
      gatewayCheck = { at: Date.now(), reachable: true, httpStatus: res.status }
    } catch {
      gatewayCheck = { at: Date.now(), reachable: false, httpStatus: null }
    }
  }

  return NextResponse.json({
    ok: true,
    hasModel: withModel,
    provider: withModel ? 'opencode' : 'mock',
    baseUrl,
    defaultModel: DEFAULT_MODEL,
    gatewayReachable: withModel ? gatewayCheck.reachable : null,
    gatewayStatus: withModel ? gatewayCheck.httpStatus : null,
    checkedAt: new Date().toISOString(),
  })
}
