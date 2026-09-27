// OpenCode 模型列表（实测探测筛选，只上架确认可用的模型）。
// 端点差异（实测事实）：
// - zen 池（https://opencode.ai/zen/v1）：deepseek-v4.1-flash / glm-5.3 实测 200 可用
// - go  池（https://opencode.ai/zen/go/v1）：deepseek-v4-pro 路由存在（额度用尽时 429，恢复后可用）；
//   注意 deepseek-v4-pro 在 zen/v1 端点会 404（真实踩坑：默认模型导致业务分析师阶段
//   「No output generated」——根因是该模型不在 zen/v1 路由表）
// 另：Zen 的 *-free 免费层模型仅限 OpenCode 客户端内使用（外部 API 403 FreeTierError），故不上架
export interface ModelOption {
  id: string
  label: string
  endpoint: 'zen' | 'go'
  source: string // 下拉来源标注
}

export const ZEN_MODELS: ModelOption[] = [
  { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4 Flash', endpoint: 'zen', source: 'OpenCode Zen（API 余额）' },
  { id: 'glm-5.3', label: 'GLM 5.3', endpoint: 'zen', source: 'OpenCode Zen（API 余额）' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', endpoint: 'go', source: 'OpenCode Go（平台额度，周额度恢复后可用）' },
]

// 向后兼容旧引用（语义为「平台模型」）
export const GO_MODELS = ZEN_MODELS

// 默认模型：探测确认当前稳定的快模型（原默认 v4-pro 在 zen/v1 404，已修正）
export const DEFAULT_MODEL = 'deepseek-v4.1-flash'

// 意图分类 / QA 对话：轻量低成本且确认可用
export const CLASSIFY_MODEL = 'deepseek-v4.1-flash'
export const CHAT_MODEL = 'deepseek-v4.1-flash'

export function isValidModel(id: string | null | undefined): boolean {
  return ZEN_MODELS.some((m) => m.id === id)
}

export function modelOption(id: string | null | undefined): ModelOption | undefined {
  return ZEN_MODELS.find((m) => m.id === id)
}

export function modelEndpoint(id: string | null | undefined): 'zen' | 'go' {
  return modelOption(id)?.endpoint ?? 'zen'
}
