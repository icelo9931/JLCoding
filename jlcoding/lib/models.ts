// OpenCode Go 套餐模型（仅 /chat/completions 端点，@ai-sdk/openai-compatible 可直连）
export const GO_MODELS: { id: string; label: string }[] = [
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' },
  { id: 'glm-5.3', label: 'GLM 5.3' },
  { id: 'glm-5.3-flash', label: 'GLM 5.3 Flash' },
  { id: 'kimi-k3', label: 'Kimi K3' },
  { id: 'kimi-k2.7-code', label: 'Kimi K2.7 Code' },
  { id: 'longcat-2.0', label: 'LongCat 2.0' },
  { id: 'mimo-v2.5-pro', label: 'MiMo V2.5 Pro' },
  { id: 'hy3', label: 'Hy3' },
]

export const DEFAULT_MODEL = 'deepseek-v4-flash'

export function isValidModel(id: string | null | undefined): boolean {
  return GO_MODELS.some((m) => m.id === id)
}
