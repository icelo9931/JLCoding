'use client'

// 自定义 skill / agent / MCP 的本地存储（localStorage，随 chat 请求注入）
import type { CustomSkill, CustomAgent, McpConfig } from '@/lib/skills'

const KEY = 'jlcoding:custom'

interface CustomStore {
  skills: CustomSkill[]
  agents: CustomAgent[]
  mcps: McpConfig[]
}

const EMPTY: CustomStore = { skills: [], agents: [], mcps: [] }

export function loadCustom(): CustomStore {
  if (typeof window === 'undefined') return EMPTY
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return EMPTY
  }
}

export function saveCustom(store: CustomStore): void {
  localStorage.setItem(KEY, JSON.stringify(store))
}

export function upsertSkill(skill: CustomSkill): void {
  const s = loadCustom()
  const i = s.skills.findIndex((x) => x.id === skill.id)
  if (i >= 0) s.skills[i] = skill
  else s.skills.push(skill)
  saveCustom(s)
}

export function removeSkill(id: string): void {
  const s = loadCustom()
  s.skills = s.skills.filter((x) => x.id !== id)
  saveCustom(s)
}

export function upsertAgent(agent: CustomAgent): void {
  const s = loadCustom()
  const i = s.agents.findIndex((x) => x.id === agent.id)
  if (i >= 0) s.agents[i] = agent
  else s.agents.push(agent)
  saveCustom(s)
}

export function removeAgent(id: string): void {
  const s = loadCustom()
  s.agents = s.agents.filter((x) => x.id !== id)
  saveCustom(s)
}

export function upsertMcp(mcp: McpConfig): void {
  const s = loadCustom()
  const i = s.mcps.findIndex((x) => x.id === mcp.id)
  if (i >= 0) s.mcps[i] = mcp
  else s.mcps.push(mcp)
  saveCustom(s)
}

export function removeMcp(id: string): void {
  const s = loadCustom()
  s.mcps = s.mcps.filter((x) => x.id !== id)
  saveCustom(s)
}
