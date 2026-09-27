// 意图路由规则层（纯函数、零依赖——可确定性单测，scripts/test-intent-rules.cjs 现编译验证）。
// 规则优先于 LLM 兜底：高置信度、高频、低歧义的输入零延迟零 token 直接路由。
// 关键铁律：VERSION 系列必须先于 CODE 判定——「回滚到 v1 / 对比两轮」绝不能触发重新生成代码。
export type Intent = 'code' | 'version_list' | 'version_diff' | 'version_rollback' | 'qa'

const R_VERSION_ROLLBACK = /(回滚|恢复到|切换到|还原到)/
const R_VERSION_LIST = /(历史版本|版本历史|几个版本|版本列表|有哪些版本|所有版本|版本记录)/
const R_VERSION_DIFF = /(对比|比较|diff|哪里不一样|哪里不同|哪里变了|有什么区别|差别|区别在哪|变了什么|改了什么)/
// 版本语境（真实用例驱动逐步增补）：
// - 「两轮/上一版/这两轮/上一轮」：轮次语境（用户实测原话：两轮的旧功能、源码、Preview、版本号和 SHA，请给出对比）
// - 「版本号 / SHA / 哈希 / 文件集」：版本实体词
// - 「生成的结果/版本/应用」：名词性生成引用（注意与 R_CODE 的指令动词区分）
const R_VERSION_CONTEXT = /(v\s*\d+|上一版|上一轮|上一个版本|这两轮|两轮|历史版本|之前那版|最近两|版本号|SHA|sha|哈希|文件集|生成的.{0,8}(结果|版本|应用))/
// CODE 指令动词：「生成/实现」用负向环视排除名词性引用
// （真实案例：「为什么我生成的应用里要用 useState？」曾被误路由进构建管线）
const R_CODE = /(做一个|写一个|帮我建|实现(?!的)|开发一个|创建一个|搭一个|改成|修改|换成|变成|加上|去掉|增加|添加|新增|调整一下|优化一下|重构|生成(?![的这那]))/
const R_QA = /(为什么|怎么|是什么|什么是|解释一下|解释|讲讲|介绍一下|介绍|如何理解|啥是|是指)/

export function ruleIntent(text: string): Intent | null {
  const t = text.trim()
  if (R_VERSION_ROLLBACK.test(t)) return 'version_rollback'
  if (R_VERSION_LIST.test(t)) return 'version_list'
  if (R_VERSION_DIFF.test(t) && R_VERSION_CONTEXT.test(t)) return 'version_diff'
  if (R_CODE.test(t)) return 'code'
  if (R_QA.test(t)) return 'qa'
  return null
}
