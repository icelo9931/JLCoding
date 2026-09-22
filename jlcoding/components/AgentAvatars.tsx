'use client'

// Agent 卡通头像：内置 6 个 + 自定义通用头像
import { cn } from '@/lib/utils'

export function AgentAvatar({ agentId, size = 'md', className }: {
  agentId: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const dim = size === 'sm' ? 'h-6 w-6' : size === 'lg' ? 'h-12 w-12' : 'h-9 w-9'
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center', dim, className)}>
      {agentId === 'analyst' && <AnalystBot />}
      {agentId === 'data-analyst' && <DataBot />}
      {agentId === 'architect' && <ArchitectBot />}
      {agentId === 'engineer' && <EngineerBot />}
      {agentId === 'tester' && <TesterBot />}
      {agentId === 'fixer' && <FixerBot />}
      {!['analyst', 'data-analyst', 'architect', 'engineer', 'tester', 'fixer'].includes(agentId) && <CustomBot />}
    </span>
  )
}

const S = { className: 'h-full w-full' }

// 业务分析师：放大镜 + 圆脸机器人
function AnalystBot() {
  return (
    <svg viewBox="0 0 36 36" {...S}>
      <circle cx="16" cy="16" r="11" fill="#0ea5e9" />
      <circle cx="12.5" cy="14" r="2" fill="#082f49" />
      <circle cx="19.5" cy="14" r="2" fill="#082f49" />
      <path d="M11 19 q5 3.5 10 0" stroke="#082f49" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <line x1="24" y1="24" x2="31" y2="31" stroke="#38bdf8" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="24" cy="24" r="4" fill="none" stroke="#e0f2fe" strokeWidth="2.4" />
      <circle cx="9" cy="10" r="1.6" fill="#bae6fd" opacity=".8" />
    </svg>
  )
}

// 数据分析：柱状图脸机器人
function DataBot() {
  return (
    <svg viewBox="0 0 36 36" {...S}>
      <rect x="5" y="6" width="26" height="24" rx="6" fill="#b45309" />
      <rect x="10" y="18" width="4" height="7" rx="1" fill="#fde68a" />
      <rect x="16" y="14" width="4" height="11" rx="1" fill="#fef3c7" />
      <rect x="22" y="10" width="4" height="15" rx="1" fill="#fde68a" />
      <circle cx="13" cy="11.5" r="1.4" fill="#fffbeb" />
      <circle cx="19" cy="11.5" r="1.4" fill="#fffbeb" />
      <path d="M12 24 h10" stroke="#fffbeb" strokeWidth="1.4" strokeLinecap="round" opacity=".6" />
    </svg>
  )
}

// 架构设计师：蓝图 + 眼镜机器人
function ArchitectBot() {
  return (
    <svg viewBox="0 0 36 36" {...S}>
      <rect x="5" y="8" width="26" height="22" rx="6" fill="#7c3aed" />
      <rect x="9" y="14" width="7" height="5" rx="1.5" fill="#2e1065" />
      <rect x="20" y="14" width="7" height="5" rx="1.5" fill="#2e1065" />
      <line x1="16" y1="16.5" x2="20" y2="16.5" stroke="#2e1065" strokeWidth="1.6" />
      <path d="M14 24 h8" stroke="#ddd6fe" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 4 l3 4 h-6 z" fill="#ddd6fe" />
      <rect x="8" y="27" width="20" height="3" rx="1.5" fill="#a78bfa" opacity=".5" />
    </svg>
  )
}

// 代码工程师：头戴终端括号的机器人（默认）
function EngineerBot() {
  return (
    <svg viewBox="0 0 36 36" {...S}>
      <rect x="5" y="8" width="26" height="22" rx="7" fill="#059669" />
      <path d="M13 15 l-3.5 3.5 3.5 3.5" stroke="#d1fae5" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M23 15 l3.5 3.5 -3.5 3.5" stroke="#d1fae5" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18" cy="18.5" r="2.4" fill="#065f46" />
      <path d="M14 26 q4 2.5 8 0" stroke="#065f46" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <line x1="18" y1="4" x2="18" y2="8" stroke="#34d399" strokeWidth="2" strokeLinecap="round" />
      <circle cx="18" cy="3" r="1.8" fill="#6ee7b7" />
    </svg>
  )
}

// 测试工程师：盾牌 + 对勾机器人
function TesterBot() {
  return (
    <svg viewBox="0 0 36 36" {...S}>
      <path d="M18 4 l12 4.5 v8 c0 8-5.5 13-12 15.5 C11.5 29.5 6 24.5 6 16.5 v-8 z" fill="#ea580c" />
      <path d="M12.5 17.5 l4 4 7.5-8" stroke="#ffedd5" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="13.5" cy="11" r="1.5" fill="#fed7aa" />
      <circle cx="22.5" cy="11" r="1.5" fill="#fed7aa" />
    </svg>
  )
}

// 修复工程师：扳手机器人
function FixerBot() {
  return (
    <svg viewBox="0 0 36 36" {...S}>
      <rect x="5" y="8" width="26" height="22" rx="7" fill="#e11d48" />
      <circle cx="13.5" cy="15" r="2" fill="#4c0519" />
      <circle cx="22.5" cy="15" r="2" fill="#4c0519" />
      <path d="M12 22 q6 -3 12 0" stroke="#4c0519" strokeWidth="1.8" fill="none" strokeLinecap="round" transform="rotate(4 18 22)" />
      <path d="M26 24 l5 5" stroke="#fecdd3" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="25" cy="23" r="2.6" fill="none" stroke="#fecdd3" strokeWidth="2" />
      <circle cx="9" cy="12" r="1.6" fill="#fecdd3" opacity=".7" />
    </svg>
  )
}

// 自定义 agent 通用头像
function CustomBot() {
  return (
    <svg viewBox="0 0 36 36" {...S}>
      <circle cx="18" cy="18" r="13" fill="#52525b" />
      <circle cx="13.5" cy="15" r="2.2" fill="#e4e4e7" />
      <circle cx="22.5" cy="15" r="2.2" fill="#e4e4e7" />
      <path d="M13 23 q5 3.5 10 0" stroke="#e4e4e7" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M18 2 v3" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
