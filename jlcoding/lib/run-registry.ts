// 同进程「正在生成」注册表：
// ① chat 接口并发防护——同项目重复发起生成返回 409，避免两条管线交错写文件；
// ② GET 详情时识别「building 但本进程已无活跃运行」的陈旧状态（服务重启残留）→ 降级 paused。
// 取舍说明：Render（单进程常驻）下准确；Vercel serverless 多实例下注册表不跨实例，
// 此时依赖 runStartedAt 时间戳阈值兜底（见 BUILDING_STALE_MS 与 detail 路由自愈逻辑）。
const running = new Set<string>()

export function markRunning(projectId: string): void {
  running.add(projectId)
}

export function unmarkRunning(projectId: string): void {
  running.delete(projectId)
}

export function isRunning(projectId: string): boolean {
  return running.has(projectId)
}

// building 状态判定为陈旧的阈值：无活跃运行的 building 超过该时长视为残留 → 降级 paused（可续跑）
export const BUILDING_STALE_MS = 3 * 60 * 1000
