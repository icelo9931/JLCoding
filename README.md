# jlCoding — 把 idea 变成可运行的代码

> 输入自然语言需求，AI 智能体把它变成可运行的应用 —— 业务分析 → 你确认 → 架构设计 → 代码生成 → 沙箱校验 → 实时预览，全流程可视化、可暂停、可断点续跑。

## 在线体验

| 入口 | 链接 | 说明 |
|---|---|---|
| **主入口（国内直连，推荐）** | **https://jlcoding.onrender.com** | 免代理可达；免费实例 15 分钟无流量休眠，**首次打开约需 50 秒唤醒**（页面会持续加载至就绪，稍等即可） |
| 社区「发现」页 | https://jlcoding.onrender.com/discover | 无需注册即可浏览、点开查看公开项目（完整对话 / 版本 / 源码 / 预览 / 下载） |
| 备用（海外网络） | https://jlcoding.vercel.app | `*.vercel.app` 国内需代理，海外访问快 |
| **源码仓库** | https://github.com/icelo9931/JLCoding | 全部源码 + 20+ 个可复跑验证脚本 |

> 建议先用主入口**走一轮体验**（输入需求 → 注册 → 确认 → 查看结果），或直接打开「发现」页浏览公开项目，感受多轮对话与版本迭代的全过程。

## 30 秒体验路径

打开演示链接 → 输入需求（**默认 React 网页应用**：实时预览 + 一键线上使用；说"用 Python"则生成 tkinter 桌面版）→ 点开始生成 → 注册（邮箱+密码，10 秒）→ 自动进入会话 → 确认需求理解 → 等待生成（可暂停/续跑）→ 预览 / **工具栏一键「线上使用」** / 下载 ZIP / 推送 GitHub。生成/修改每轮自动落版本快照（**append-only 历史 + 一键回滚**）。

## 功能全景

**「发现」公开社区**
- 项目可一键**发布到「发现」**（owner + 已就绪项目）：把完整多轮对话、版本时间线（v1..vN + SHA + provider）、源码、ZIP 与在线体验分享给所有人（`/discover` 无需登录），卡片展示**发布者（用户名 + 脱敏邮箱）**与规模统计
- **私有边界不变**：未发布项目仅本人可见（B 账号/匿名 401/403）；已发布项目对所有人**只读**（对话/版本/源码/预览/ZIP），**写操作（chat/回滚/部署/删除/发布）永远 owner-only（403）**；可随时取消发布
- 只读查看体验：复用工作台（无输入框 + 「只读 · 发布者」徽章 + 版本历史只读 + 部署页预览），非 owner 无法触发任何写操作

**生成管线**
- **意图路由（问答不进生成管线）**：用户输入先经规则层（零延迟零 token）四路分类——CODE（做/改应用）走「分析→确认→生成」管线；**QA（提问/解释/评估）由智能助手直接流式回答**（无确认卡、不进构建状态机、进度条不动），工具：`web_search`（DDG，零 Key，失败如实报不可达）/ `read_url`（读网页正文）/ `read_file`（读本项目源码，支撑项目问答与评估）；**VERSION（对比/diff/回滚/列表）由版本助手确定性处理**（直接查 `ProjectVersion` 快照做结构化 diff 或触发 `$transaction` 回滚，零 LLM 零 token——「对比两轮结果」绝不触发重新生成）；「回滚到 v1」在规则层直接拦截。规则未命中的模糊输入由 flash 单词分类兜底（~1-2s）；mock 无 Key 时纯规则 + 如实告知演示模式
- 五角色顺序管线：业务分析师 → 架构设计师 → 代码工程师 → 测试工程师 → 修复工程师
- 需求确认：分析师产出理解卡片，可**追加补充并重新分析**，确认后才生成
- **逐 token 流式**：左侧打字机气泡 + **代码生成实时可见**（writeFile 参数流逐字解码推送，大文件生成期间界面不再静默）；生成中与**待确认阶段（尚无产出）均为两栏布局**（对话 2/3 + 进度 1/3，排版一致），**中间预览画布仅在出现生成文件后弹出**（三栏，宽度可拖拽、自动记忆）；**刷新后对话/日志/文件/版本完整恢复**（含历史对话 hydration——修复过 UI 层恢复缺失的真实 bug）
- **暂停 / 断点续跑**：AbortController 中止，已完成阶段落库，续跑自动跳过（实测：中断后续跑仅 7.6 秒走完校验）
- **增量 diff 式修改**：自动识别"修改轮"，工程师先读后改、只写需要改的文件（实测：改生肖显示仅动 2/9 文件，其余逐字节不变）
- **多轮自动修复**：静态校验失败自动进入修复循环，最多 3 轮直到通过
- **Token 消耗展示**：每轮对话结束右下角显示输入/输出 token 用量

**语言与沙箱**
- **默认 React**（据真实用户实测反馈调整）：计算器/待办等 GUI 需求，用户预期「直接看到画面并线上使用」——React 可浏览器实时预览（Sandpack）+ 预览工具栏一键「线上使用」（部署为公开网页 /app/:id）；Python 桌面应用两者皆不可，仅在用户明确说"用 Python"时生成 tkinter 单文件（仅标准库，本机 `python main.py` 零依赖可跑）
- React：Sandpack 浏览器内真实编译预览（desktop/tablet/mobile、新窗口、真实编译耗时展示）
- Python：黑底 IDE 配色代码展示 + 下载运行指引（浏览器无法运行 Python，如实降级；线上部署按钮如实禁用并说明）
- 静态校验：JSON 合法性 / 入口完整 / 依赖声明 / 括号平衡 / **const 重赋值检测**（拦截过真实线上 bug）/ **相对 import 解析检查**（拦截过「校验通过但部署打包失败」的真实案例）

**Agent 体系**
- 6 个内置 Agent（业务分析/数据分析/架构/代码/测试/修复），SVG 卡通头像 + 悬浮解释 + **指定主导视角**（项目标题前显示对应头像，再点一次取消）
- 自定义 Agent：名称 + 主导 prompt，出现在首页头像栏

**Skill 与 MCP**
- 内置注入 GitHub 开源编码技能：**测试驱动开发（TDD）**（obra/superpowers，9.5K 字全文存档于 `skills/`，适配沙箱后注入代码工程师）
- 自定义 Skill：把你偏好的命名/注释/结构习惯写成技能 = 你的「私人编码规范」，生成代码带上你的风格
- MCP 登记：当前以能力说明形式注入（协议级接入为扩展方向）——界面上如实标注

**输入增强**
- 文件上传（文本/CSV/表格读内容注入上下文，**单文件 ≤ 50MB**，图片如实标注"暂不解析"）
- 参考链接：服务端实际抓取网页正文（去标签、8s 超时、截断 4000 字）注入分析

**账号与数据**
- 邮箱+密码注册登录（JWT httpOnly Cookie，30 天），DeepSeek 式门控：未登录可浏览，开始输入才弹极简登录卡（默认注册 Tab，未注册自动切换）
- 项目按账号隔离（未登录列表为空、越权 403，均实测拦截）
- GitHub PAT 连接（仅存浏览器本地）→ 生成完成后**一键推送 GitHub 新仓库**
- 刷新全恢复：对话、日志、文件、待确认/暂停状态；ZIP 下载

**模式**
- 小白模式：进度友好呈现（隐藏文件/代码/终端细节）；专家模式：完整三视图（日志/文件树+IDE 高亮/终端）+ 技能/MCP/Agent 管理

**版本历史与回滚**
- 每轮生成完成自动落版本快照：`ProjectVersion`（version 递增 / SHA-256 全文件集哈希 / 全量文件快照 / **provider 随版本留存**——任意历史版本可追溯当时走的真实模型还是 Mock 路径）
- append-only 回滚（git-revert 语义）：回滚 = 用快照覆盖文件 + 新增「回滚自 vN」条目，历史线性不丢；`$transaction` 四操作原子完成（删旧文件/写快照文件/建回滚版本/状态更新），杜绝 v3/v7 混杂
- 顶栏版本徽章 `v3 · a1b2c3d4` + 历史下拉（版本/SHA/摘要/时间/provider），点击即回滚；回滚后源码与 Preview 同步重编译

**一键部署（自托管）+ 平台构建 SHA**
- 部署范围（如实）：**React 应用**可部署为静态网页；Python 生成物为桌面应用，不支持网页部署（按钮如实禁用并说明，可下载 ZIP 本机运行）
- 服务端 **esbuild 真实打包**（react/react-dom 从平台 node_modules 打入、CSS 收集内联、支持 JS/JSX/TS/TSX、automatic runtime 消除 React-in-scope 类运行时错误）→ 单文件自包含 HTML → 公开访问链接 `GET /app/:id`（零登录、零 CDN 依赖、可分享）+ 产物 SHA-256 展示
- 平台自身构建 SHA：构建时注入 git commit（`scripts/build-info.mjs`，读 VERCEL/RENDER 环境变量）→ 顶栏 `build a1b2c3d` chip 直链 GitHub commit，`/api/status` 一并返回——评审可核对「线上部署对应 GitHub 的哪个 commit」

**权限与生成路径可观测**
- 全部项目级接口（详情/文件/ZIP/chat/versions/rollback/deploy）统一走 `requireProjectAccess`：未登录 401 / 非归属人 403 / 并发生成 409；越权响应为 JSON 错误而非数据流
- 生成路径记录级区分：`Project.provider`（`opencode:<modelId>` | `byok:<modelId>` | `mock`）+ `ProjectVersion.provider` 历史可追溯——评审查任意一条生成记录都能看到实际走的路径
- **模型调用透明化（不在对话流直白插消息）**：模型下拉每项标注「来源 + 实际调用：`<modelId>`」；生成中工作日志展示「模型调用」卡片（Provider / Model / Request ID / **首 Token 延迟**实测），小白模式进度面板同源内嵌；顶栏「真实模型 / Mock 演示」徽章 + `/api/status`。**模型清单（实测探测筛选）**：`deepseek-v4.1-flash`（DeepSeek V4 Flash，默认）、`glm-5.3`（GLM 5.3）走 Zen 端点；`deepseek-v4-pro`（DeepSeek V4 Pro）走 Go 端点（实测差异：同一 id 在 zen/v1 会 404——默认模型踩坑修复）。Zen `*-free` 免费层仅限 OpenCode 客户端内使用（外部 403），故不上架；stream 错误（404/429/403）还原为可操作提示，不再显示模糊的「No output generated」
- **删除项目**：侧栏项目卡片 hover 🗑 → **内联二次确认**（再点生效，3s 还原）→ `DELETE /api/projects/:id`（owner 鉴权：未登录 401/非归属 403/生成中 409）→ Prisma 级联清除对话/文件/版本/部署记录，`/app/:id` 链接随之 404
- **画布零 CDN 兜底**：有部署记录的项目**默认走部署页 iframe**（esbuild 自包含 bundle，毫秒级、零 CDN 依赖）；Sandpack 作为可切换的「实时编译」项；Sandpack 6s 未编译完成自动切部署页。**版本变化（新生成/增量修改/回滚）自动重新部署**，画布与「线上使用」始终反映最新源码——返回上一版：顶栏版本徽章下拉点旧版本回滚（append-only + 哈希精确还原），源码与画布同步
- **进度面板恢复加固**：日志恢复纳入业务分析师消息 + `status==='ready'` 兜底补合成条目（分析需求/构建校验）+ 进度条归位 100%——任何就绪项目打开即四阶段全勾
- **BYOK 自有 API Key**：模型下拉内置「使用我自己的 API Key」入口（未配置点击进设置窗：Base URL / API Key / 模型 ID，含连通性测试）——任何 OpenAI 兼容端点（DeepSeek 官方 / OpenAI / 本地 Ollama）；Key 仅存浏览器 localStorage（与 GitHub PAT 同策略），随请求传输、服务端不落库不打日志；无平台 Key 时 BYOK 可走真实生成
- Mock 路径明确标注：对话区横幅「演示模式（平台未配置真实模型）：生成使用预置数据，结果可能不完整或不准确」

## 实现思路与关键取舍

### 顺序角色管线而非单一长循环（附实测依据）

实测发现 Vercel AI SDK v7 的 `ToolLoopAgent` 工具循环在**无工具调用的步骤后必然终止**（循环条件要求上一步存在工具调用），无视 `stopWhen`。因此最终架构：业务分析师/架构设计师独立单轮生成，代码工程师/测试工程师/修复工程师内部保持工具循环（`prepareStep` 注入角色指令与工具白名单）。这比多智能体框架（消息路由、状态同步、失败恢复）确定得多、可调试得多——项目时间有限，"跑得通的闭环"优先于"架构展示"。

### 为什么选择 Sandpack 而非 E2B

我选择 Sandpack 而非 E2B，是因为在 8 小时的时间约束下，保证预览环节 100% 可靠比支持全栈应用更重要。Sandpack 在浏览器内完成打包和渲染，没有服务器沙箱的启动延迟和超时风险，用户从输入需求到看到结果的时间可以控制在 30 秒以内。代价是只支持 React 纯前端应用，不支持需要后端数据库或 API 的应用。如果继续投入时间，接入 E2B 支持全栈是优先级最高的扩展方向。

预览工具栏中的"构建校验：通过（Sandpack 编译耗时 X.Xs）"来自 Sandpack 真实的 start/done 编译事件（`useSandpackClient().listen` 实测），不是编造的数字。

### 默认 React 的取舍（据真实用户实测反馈调整，原为默认 Python）

初版默认 Python（tkinter）。真实用户实测后反馈：生成「计算器」这类 GUI 需求，用户预期是**直接看到渲染画面并可点击线上使用**——Python 桌面应用无法浏览器渲染、无法网页部署，中间画布只能弹代码块，体验落差大。故调整为：**未指定语言时默认 React**（实时预览 + 预览工具栏一键「线上使用」），Python 仅在用户明确说"用 Python"时生成（tkinter 单文件、仅标准库、本机零依赖可跑，预览区如实降级为 IDE 配色代码展示 + 运行指引，不做假预览）。

### 双数据库策略（含一次真实事故）

初期"本地与线上统一 Neon（美东）"，后被真实事故推翻：国内网络直连 Neon 不稳定（P1001 连接超时导致用户续跑时全部 500）。修复方案：**本地 SQLite（`schema.dev.prisma`，零外部依赖、永不因网络失败）+ 线上 Neon Postgres**，`scripts/dev.mjs` 按 `DATABASE_URL` 前缀自动选 schema；所有 API 加数据库可达性兜底（可读错误信息而非裸 500）。教训写入设计：**开发环境的依赖必须与网络状况解耦**。

### 其他关键取舍

- **SSE 而非 WebSocket**：单向事件流足够，复杂度低一个量级；15s `: ping` 心跳防长生成被代理掐断（曾实测无心跳时客户端 300s body 超时中断）。
- **OpenCode Zen 网关合规接入**：OpenAI 兼容协议 + `x-opencode-session` 会话头（按项目隔离，利于路由与 prompt 缓存）+ `jlcoding/1.0` User-Agent；顶栏/首页可切换全部 Zen 精选模型（默认 DeepSeek V4 Pro），按项目持久化。
- **const 重赋值静态检测**：来自真实线上 bug（lunar.js `const offset` 后 `offset -=`，静态校验通过但 Sandpack 编译失败）。启发式正则检测（去字符串/注释后扫描 const 变量的 `+= -= ++ -- =` 重赋值），三组用例验证零误报——把"用户看到的编译错误"前移到"交付前自动修复"。
- **相对 import 解析校验（新增，来自复核实测 bug）**：贪吃蛇生成物根 `App.js` 引用不存在的 `./src/App`，静态校验通过但部署打包失败。现在校验每个 .js/.jsx/.ts/.tsx 文件的相对 import 必须解析到文件集内实际文件（同 esbuild/Sandpack 规则：`x / x.js / x.jsx / x.ts / x.tsx / x/index.*`），单测三组用例（坏 import 检出 / TSX 目标通过 / 目录式与 css 不误报）。
- **空闲看门狗取代硬超时（实测教训）**：最初设计的「每步 180s 超时」实际套住了整个角色循环，实测误杀合法的 477s 工程师生成。改为 **120s 无任何流式输出才判死连接**（每收到分片重置计时器）+ 管线 900s 总闸（慢网络下大应用需要 ~600s）——健康长生成永不误伤；实测真实逮到一次死连接：空闲超时 → error 落库 → 断点续跑成功。
- **esbuild automatic runtime（来自浏览器级测试逮到的真实 bug）**：classic JSX 转换下，`import { useState } from 'react'` 命名导入不提供默认 React → bundle 运行时 `React is not defined`（API 级测试只验 HTML 内容没发现，Playwright 无头浏览器才发现）。改用 automatic runtime（jsx-runtime 注入）彻底消除该类错误。
- **mock 兜底**：无 API Key 时预置待办应用走完整事件流，演示永远可用。
- **认证从简**：邮箱+密码、不做邮件验证（演示项目的标准取舍，10 秒完成注册）；GitHub OAuth 登录列为下一轮。

## 质量与实测数据

自动化冒烟脚本（`jlcoding/scripts/`，均可复跑）：

| 脚本 | 场景 | 关键实测结果 |
|---|---|---|
| `test-p0.cjs` | 权限矩阵/409/provider/自愈/防双写 | 22/22：未登录 401、B 账号 detail/files/ZIP/chat 全 403、并发生成 409、provider 落库、重试防双写（1→1）、陈旧 building 自愈→paused；**实测逮到一次真实死连接：空闲看门狗 120s 触发 → error 落库 → 第 2 次断点续跑 complete** |
| `test-p1.cjs` | 版本快照/增量/回滚/部署/Python 范围 | 21/21（真实模型）：v1→v2 版本递增 + SHA 三方一致（事件==列表==文件集）；增量仅改 1/8 文件；回滚 v1→v3 文件集哈希精确还原；`/app/:id` 部署前 404 → 部署后 200 自包含 1MB HTML；Python 部署如实 400 |
| `test-review-e2e.cjs`（+resume 续跑版） | 复核点 3：计算器/贪吃蛇/同项目两轮增量 | 计算器 v1→v2→v3 严格递增、SHA 逐轮变化；两轮增量分别只改 **1/10** 与 **3/12** 文件（内容级 SHA-256 哈希比对，其余逐文件哈希不变）；回滚 v1→v4 精确还原；贪吃蛇生成 + 校验 exit 0 + 部署成功（TSX 结构）|
| `test-restore.cjs` | 复核点 4+7：恢复矩阵 + 越权矩阵 | 20/20：生成中断开→paused→续跑 complete；刷新/全新会话重登后项目/对话/源码/版本/provider 完整恢复；退出后 cookie 清除 + 401 + 列表空；B 账号 7 接口全 403（ZIP 断言响应为 JSON 错误非 PK 流）；owner ZIP 正常 |
| `test-preview-browser.cjs` | 复核点 4 浏览器级：Playwright + Edge 无头 | 登录进入/同页刷新/全新会话重登三场景 iframe 存在 + 应用挂载（CDN 可用时 PASS，波动时如实 SKIP）；**部署页 `/app/:id` 零 CDN 依赖稳定挂载 + 无 JS 运行时错误**（此测试逮到并修复了 classic JSX 转换的 `React is not defined` 运行时 bug）|
| `test-import-check.cjs` | sandbox import 解析校验单测 | 3/3：坏相对 import 检出（exit 1 + 明确错误）/ TSX 目标存在通过 / 目录式 import、css、裸包名零误报 |
| `test-ux.cjs` | UX 专项：默认 React / runId / 无对话流系统消息 / 线上使用 | 9/9：**无任何语言关键词的「计算器」需求默认生成 React**（App.js/Calculator.js/Keypad… + 部署成功）；run_started 携带 req_ runId；对话流不再插「本次生成路径」系统消息（呈现移至卡片）；Project.provider 落库（评审证据链保留） |
| `test-ux-browser.cjs` | UX 浏览器级：待确认布局 / 模型调用卡片 / 下拉来源 / BYOK | 11/11：生成中与**待确认阶段均为两栏**（中间画布不出现，iframe=0）；「模型调用」卡片（Provider/Model/Request ID，小白模式内嵌）；下拉逐项「来源：OpenCode Go（平台额度）· 实际调用：xx」+ BYOK 入口未配置弹设置窗；完成后三栏 + 预览工具栏「线上使用」 |
| `test-intent.cjs` | 意图路由专项（七场景） | 23/23：QA 直答（无确认卡/状态不变 draft/进度条不动/intent=chat）；CODE 照常确认管线 + v1；增量 v2；版本列表/结构化 diff（v1→v2 + 变更/未变化 + SHA，零 LLM）；**对话触发回滚**（version_created v3 + 文件集哈希精确还原 v1 + append-only）；模糊输入不误触发生成 |
| `test-refresh-restore.cjs` | 刷新恢复浏览器级（UI 层 hydration 修复验证） | 5/5：进入项目历史可见；**刷新后 21 条对话历史完整恢复**；版本徽章恢复（v3 · sha8）；hydration 恰好一次（刷新前后消息无重复灌入 1→1） |
| `test-intent-rules.cjs` | 意图规则确定性单测（esbuild 现编译真实源码） | 20/20：用户实测原话「两轮的旧功能、源码、Preview、版本号和 SHA，请给出对比」→ version_diff；回滚/列表/CODE/QA 各意图回归；名词性引用反误判（「我生成的应用」「实现的思路」不触发 CODE）；未命中返回 null 走 LLM 兜底 |
| `test-ux-round3.cjs` | 第三轮反馈浏览器级（暂停/消息操作/横幅） | 6/6：无 mock 横幅（真实模式）；生成中「暂停」按钮 2 处出现且点击后「已暂停」+ DB `paused` 落库（可断点续跑）；消息「复制」有「已复制」反馈；「修改重发」内容填入输入框 |
| `test-gen-delete.cjs` | 第四轮：生成 + 删除项目（真实 `deepseek-v4.1-flash`） | 13/13：业务分析师阶段成功（不再 No output generated）；生成 9 文件 + v1 快照 + 可部署；**删除 200 且级联清 9 消息/8 文件/1 版本/1 部署**；未登录删除 401；删除后 404 |
| `test-walkthrough.cjs` | 全流程 walkthrough（浏览器，Playwright） | 10/11：开始生成→自动进会话→需求确认；对话历史 + 「线上使用」；**刷新后历史恢复**；**回首页侧栏点开项目直接进入查看**；**删除内联二次确认 → 列表移除**（版本徽章断言时机问题，独立探测确认渲染正常 TopBar `v1 · 3f6f56e3`） |
| `test-round4-fix.cjs` | 第五轮修复验证（画布/线上使用/进度面板） | 5/5：进度面板四阶段名称齐全 + 「已就绪」；**画布有内容且含计算器特征**；部署记录存在（sha `79df4f58`）；`/app/:id` 200 且为计算器（非待办） |
| `test-round5.cjs` | 第六轮：画布速度 + 追加需求 + 返回上一版 | **7/7**：默认「部署页预览（零 CDN）」+ 画布内可交互计算器（19 按钮）；追加需求 → 新版本 v8 + 画布自动重部署；回滚 v7 → 文件集哈希精确还原（`f72c9bd7`）+ 画布同步旧版 |
| `test-discover.cjs` | 「发现」模块 API 级（19 项） | **19/19**：未发布 B 403/匿名 401；发布后**B 与匿名可读** detail/versions/files/ZIP；**B 写操作全 403**；取消发布 → 列表消失 + B 恢复 403；列表含作者（`dis***`）与统计 |
| `test-discover-browser.cjs` | 「发现」浏览器级（11 项） | **11/11**：未登录访问发现页 → 卡片含发布者 `jl993138486s（jl9***）`；点开 → **只读工作台**（无输入框/只读徽章/对话可见）；owner 仍可编辑 |
| `test-deploy-recheck.cjs` | TSX 项目部署复测 | 4/4：曾失败的贪吃蛇结构（含 .tsx）打包部署成功，`/app/:id` 自包含渲染 |
| `test-auth-e2e.cjs` | 注册→登录→门控→越权→生成→ZIP | 全过；越权矩阵 401/403 全过 |
| `test-incremental.cjs` | ready 项目提修改需求 | **仅改 2/9 文件**，未触及文件逐字节一致；Token 入 42,572/出 16,575 |
| `test-python.cjs` | 不指定语言生成 BMI 计算器 | 默认 Python ✓，main.py（tkinter+`__main__`）6170 字符，校验通过 |
| `test-const-check.cjs` | const 重赋值检测 | bug 代码检出 / 正常代码零误报 / 属性与字符串不误报 |
| `test-delta.cjs` | 逐 token 流式 | 262 个增量、首字 6.1s、拼装与最终一致 |
| `smoke2.cjs` | 确认/追加/暂停/续跑 | 全过；断点续跑跳过已完成阶段 |
| `test-novice-calendar.cjs` | 阴阳历计算器（React） | 9 文件 ready，校验 exit 0，ZIP 27KB |

其他实测：阴阳历计算器完整生成（DeepSeek V4 Pro）433s，修复循环收敛序列 exit=1,0,1,0,0；断点续跑 7.6s；计算器三轮 SHA `eca4f2ba→e10e98cd→9f320074`、回滚后精确回到 `eca4f2ba`。

---

## 技术复核对照表（7 个复核点 → 实现 + 证据）

> 与最新一轮复核意见逐条对齐；所有证据脚本见 `jlcoding/scripts/`，均可本地复跑。

| # | 复核点 | 实现位置 | 验证证据（可复跑） |
|---|---|---|---|
| **1** | React 入口/依赖/校验 + **生成超时、失败落库、重试收敛**、前端状态与后端最终一致 | **入口/依赖/校验**：统一在 `lib/app-meta.ts`（`index.js > index.jsx > src/index.js > src/index.jsx`；sandbox 校验与 Sandpack 预览同源，修掉「生成 index.jsx 却强制 main=index.js」白屏）；依赖与语法校验 + **const 重赋值检测** + **相对 import 解析检查**（`lib/sandbox.ts`）。**超时**：单步**空闲看门狗 120s**（每分片重置）+ **管线总闸 900s**（`lib/agent.ts`，区分「暂停」与「超时」）。**失败落库**：超时/异常 → `error` 事件 + `status=error` 落库，已完成阶段保留可续跑；陈旧 `building` 自愈（`runStartedAt` + `lib/run-registry.ts`）。**重试收敛**：分析/重试**内容去重防双写**、每步空输出自动重试一次、**三出口统一从 DB 收敛**（正常结束/网络异常/用户暂停 → `syncFromDb`，进度条不卡中间值）。 | `test-p0.cjs` **19/19**（含真实死连接→`error` 落库→**断点续跑**闭环、陈旧 building 自愈、防双写 1→1）；`test-import-check.cjs` **3/3**（坏 import 检出 / TSX 通过 / 目录式与 css 零误报）；`test-auth-e2e.cjs`（修复循环 `1,0,1,0,0` 收敛） |
| **2** | 核对线上是否**真实命中 OpenCode Provider**，区分真实调用与无 Key mock 路径 | **全局状态**：`GET /api/status` 返回 `hasModel` / `baseUrl` / `defaultModel` / `gatewayReachable`（探测语义：任何 HTTP 响应即可达）+ 顶栏「真实模型 / Mock 演示」徽章。**记录级区分**：`Project.provider`（`opencode:<modelId>` / `byok:<modelId>` / `mock`）+ 每轮 `run_started` 事件 + 工作日志「模型调用」卡片（Provider/Model/Request ID/首 Token 延迟）+ **`ProjectVersion.provider` 历史可追溯**。mock 路径：对话区横幅明确标注「演示模式（未配置真实模型）」。 | `test-p0.cjs`（`run_started.provider=opencode:*` + `Project.provider` 落库 + `req_` runId）；`/api/status` 实测 `hasModel=true, baseUrl=.../zen/v1, gatewayReachable=true`；`test-ux-browser.cjs`（真实模式无 mock 横幅） |
| **3** | 完成 **Prompt A 计算器 / Prompt B 贪吃蛇 / 同项目连续两轮增量**；逐轮核对**旧功能、源码、Preview、版本号、SHA** | 版本系统（每轮 `vN` + SHA-256 文件集哈希）+ 增量 diff 式修改（只改相关文件）+ 部署 bundle（Preview 的编译级证据）。 | `test-review-e2e.cjs`（+ `-resume` 续跑版）：计算器 **v1→v2→v3** 严格递增、SHA 逐轮变化、增量仅改 **1/10** 与 **3/12** 文件（**内容级 SHA-256 哈希比对**，其余文件哈希不变）、旧功能残留软断言、**校验 exit 0**、**部署成功**、**回滚精确还原**；贪吃蛇全链路（含 **TSX** 打包）。`test-round5.cjs`：追加需求 → 新版本 + 画布自动重部署 |
| **4** | 完成**刷新 / 退出 / 全新浏览器会话重登和恢复**，核对**项目、对话、源码、版本、Preview** | 全状态从 DB 恢复（对话/文件/版本/provider/待确认与暂停态）；**对话历史 hydration 修复**（此前 useState 初值早于 detail 到达导致刷新后空白）；进度面板 `ready` 兜底四阶段全勾 + 进度 100%。**Preview 重渲染**：浏览器级 Playwright 轮询 iframe `#root` 子元素；国内 CDN 波动时自动降级**零 CDN 部署页 iframe**（`/app/:id`）。 | `test-restore.cjs` **20/20**（刷新/退出/全新会话重登：对话条数、文件集哈希、版本、provider 一致；退出后 cookie 清除 + 401 + 列表空）；`test-refresh-restore.cjs` **5/5**（刷新后 21 条历史完整恢复、hydration 恰好一次）；`test-preview-browser.cjs`（登录/刷新/重登三场景 iframe 挂载 + 部署页零 CDN 稳定渲染 + 无 JS 错误） |
| **5** | 增加**版本历史、旧版本切换和真实回滚**，确认回滚后**源码与 Preview 同步** | `ProjectVersion` append-only（version/SHA-256/provider/filesJson）；`POST .../versions/:v/rollback` 用 **`$transaction`** 原子覆盖（删旧文件→写快照→建「回滚自 vN」新条目→状态置 ready）；前端 `resetFiles` 整体替换 → 画布/Sandpack 同步；TopBar 版本徽章 `vN · sha8` + 历史下拉 + 回滚。 | `test-p1.cjs`：回滚后**文件集哈希精确等于**目标版本（真实回滚，非指针切换）、append-only 全保留；`test-round5.cjs`：回滚后画布自动重部署显示旧版；`test-intent.cjs`：**对话触发**「回滚到 v1」→ `version_created` + 哈希精确还原 |
| **6** | **明确生成应用的线上部署范围**，实现**可访问部署链接**，展示**与 GitHub 对应的构建 SHA** | **范围如实声明**：React 应用可部署为静态网页；Python 为桌面应用不支持网页部署（`/deploy` 返回 400 并说明，按钮禁用）。**可访问链接**：`lib/bundler.ts` 服务端 esbuild 打包（automatic runtime、TS/TSX、CSS 内联）→ 自包含单文件 HTML 存 `Deploy` 表 → 公开 `GET /app/:id`（`no-store`，无需登录）+ 产物 **bundle SHA-256**。**平台构建 SHA**：`scripts/build-info.mjs`（读 `VERCEL_GIT_COMMIT_SHA`/`RENDER_GIT_COMMIT`，回退 `git rev-parse HEAD`）→ `public/build-info.json` → 顶栏 `build <sha8>` chip **直链 GitHub commit** + `/api/status` 返回；`render.yaml` buildCommand 已注入。 | `test-p1.cjs`（部署 404→200、Python 部署 400、bundle SHA 64 位）；`test-preview-browser.cjs`（部署页真实挂载 + 无运行时错误）；`test-round4-fix.cjs`（`/app/:id` 为计算器非待办）；`build-info.json` 实测含 `sha`，TopBar chip 直链 GitHub |
| **7** | 复核**项目详情、文件列表和 ZIP 下载接口的账号权限边界** | `lib/access.ts` 的 `requireProjectAccess` 统一套用**全部项目级接口**（detail/files/download/chat/versions/rollback/deploy），语义区分：未登录 **401** / 非归属 **403** / 生成中 **409** / DB 不可达 **503**，越权返回 **JSON 错误而非数据流**。**「发现」只读例外**：仅当 `published=true` 时对所有人放行**只读**（写操作仍 owner-only）。遗留无主项目放行（迁移数据，已注明）。 | `test-restore.cjs` 越权矩阵 **7/7 全 403**（含 **ZIP 断言响应为 JSON 非 PK 流**）+ owner ZIP 正常；`test-p0.cjs`（detail/files/ZIP/chat 未登录 401 / B 403）；`test-discover.cjs` **19/19**（未发布 B 403/匿名 401；已发布 B 与匿名可读；**B 写操作全 403**；取消发布即恢复 403） |

### 本轮新增功能（复核点之外的延展能力）

| 新增 | 说明 | 证据 |
|---|---|---|
| **意图路由** | 规则层（`lib/intent-rules.ts`，纯函数可单测）+ 轻量模型兜底：CODE 走构建管线 / **QA 智能助手直答**（`web_search`/`read_url`/`read_file` 工具，无确认卡、不动进度条）/ **VERSION 确定性处理**（对比 diff / 回滚 / 列表，零 LLM）；VERSION 优先于 CODE，杜绝「想看 diff 却开始重新生成」 | `test-intent.cjs` **23/23**（真实模型）；`test-intent-rules.cjs` **20/20**（含用户原话「两轮的旧功能、源码、Preview、版本号和 SHA，请给出对比」→ `version_diff`） |
| **「发现」公开社区** | 一键发布项目到公开列表（`/discover`，无需登录），展示**完整对话 + 版本时间线 + 源码 + ZIP + 在线体验**与**发布者（用户名 + 脱敏邮箱 `jl9***`）**；私有项目仍仅本人可见，写操作永远 owner-only，可随时取消发布 | `test-discover.cjs` **19/19**；`test-discover-browser.cjs` **11/11**（只读工作台：无输入框 + 只读徽章 + 对话可见；owner 仍可编辑） |
| **BYOK（自带 Key）** | 模型下拉「使用我自己的 API Key」：Base URL/Key/模型 ID（含连通性测试），仅存浏览器本地，服务端仅当次内存使用（不落库不打日志）；无平台 Key 时 BYOK 可走真实生成 | `test-ux-browser.cjs`（下拉含 BYOK 入口 + 未配置弹设置窗） |
| **暂停 / 消息操作** | 生成中面板内「暂停」按钮（点击后 DB `paused` 落库可续跑）；消息 hover「复制」（已复制反馈）+「修改重发」（填入输入框编辑重发） | `test-ux-round3.cjs` **6/6** |
| **画布零 CDN 兜底** | 有部署记录默认走部署页 iframe（毫秒级、零 CDN）；Sandpack 6s 未编译完成自动降级；版本变化自动重新部署 | `test-round5.cjs` **7/7** |

## 文件存储位置与数据说明（如实）

| 数据 | 存储 | 说明 |
|---|---|---|
| 账号（邮箱/密码 bcrypt 哈希） | 数据库 | 密码只存哈希，JWT 会话在 httpOnly Cookie |
| 项目/对话/生成文件/版本快照/部署产物 | 数据库 | 线上 Neon Postgres（美东）；本地开发 SQLite（`prisma/dev.db`）。ProjectVersion 含全量文件快照（TEXT，SQLite/PG 双兼容），Deploy 含打包后 HTML |
| 上传的文件 | **不落盘** | 前端读取为文本（≤50MB、截断 2 万字符）作为上下文随请求传输，不存储原文 |
| 参考链接内容 | **不存储** | 服务端即时抓取网页正文注入当次分析，用后即弃 |
| GitHub PAT | **仅浏览器 localStorage** | 推送由浏览器直调 GitHub API，PAT 不经过服务器 |
| 自定义 Skill/MCP/Agent | **仅浏览器 localStorage** | 个人偏好，随请求注入 |
| public/build-info.json | 构建时生成 | git commit SHA（`.gitignore` 排除，每次构建覆盖，不落库） |

## 域名与国内外部署（如实）

| 平台 | 地址 | 国内可达性 |
|---|---|---|
| **Render（主入口）** | https://jlcoding.onrender.com | **实测直连无需代理**（新加坡区域）；免费层 15 分钟无流量休眠，首开约 50 秒 |
| Vercel（备用） | https://jlcoding.vercel.app | `*.vercel.app` 被 SNI 阻断，国内需代理；海外用户访问快 |

正式对外建议绑定自定义域名（指向 Render，无需备案即可直连；需备案 CDN 加速则另议）。每次 `git push` 两平台自动部署。

**线上如何自查「是否真实命中 Provider」（复核点 2 的核对方式）**：线上打开站点 → `GET /api/status` 应返回 `hasModel=true` 与 `baseUrl=https://opencode.ai/zen/v1`，`gatewayReachable=true`（顶栏显示「真实模型」徽章）；随后任意生成一轮，展开工作日志「模型调用」卡片可看到 **Provider / Model / Request ID / 首 Token 延迟**，且 `Project.provider` 落库为 `opencode:<modelId>`（而非 `mock`）——即证明走的是真实模型调用；若把服务端 `OPENCODE_API_KEY` 置空（或 `JLCODING_MOCK=1`），同一位置会显示「Mock 演示」且对话区出现「演示模式」横幅，两条路径可明确区分。

## 当前完成程度

- ✅ **已完成**：上文"功能全景"全部条目（五角色管线/确认追加/流式/暂停断点/增量修改/多轮修复/Token 展示/双语言（**默认 React**+按需 Python）+const 与 import 校验/6 Agent+自定义/Skill+MCP 面板/文件+链接输入/Sandpack+**部署页零 CDN 双预览**/账号隔离/401·403·409 权限矩阵/**模型调用透明化+BYOK**/provider 记录级区分/**版本快照+append-only 真实回滚**/esbuild 自托管部署+产物 SHA+「线上使用」/**平台构建 SHA 直链 GitHub**/**意图路由（问答直答 + 版本确定性处理）**/**「发现」公开社区**/删除项目/GitHub 推送/ZIP/双模式/双平台部署）
- ✅ **复核专项全部落地**：见「技术复核对照表」——**7 个复核点逐条有实现位置 + 可复跑的验证脚本 + 实测输出**（20+ 个测试脚本，`tsc` 与 `lint` 全绿）
- ⚠️ **部分完成**：MCP 仅说明级注入（未协议级调用）；GitHub OAuth 登录未做（按钮已预留）；图片上传不解析内容（如实标注）；自动修复上限 3 轮；浏览器内 Sandpack 预览依赖 codesandbox CDN（国内直连波动时挂载慢/失败——已默认切**零 CDN 部署页预览**兜底）；JWT 无状态登出（浏览器清 cookie）；**网关偶发瞬时 404**（API 复跑多次成功属抖动——已用明确文案提示可「继续生成」重试）
- ❌ **未完成**：E2B 真实服务器沙箱（`npm install/build` 真跑）；跨会话长期记忆（Skill 已部分覆盖风格偏好）；逐文件 diff 视图（版本回滚已覆盖主要诉求）；移动端专项适配

## 如果继续投入时间，我会如何扩展

1. **优先级最高**：接入 **E2B 真实沙箱**——服务端真跑 `npm install && npm run build` / `python -m py_compile`，替代静态校验；Python 加 Pyodide 浏览器内运行实现真预览；自动修复改为"直到通过"（带预算控制）。令牌吊销（登出黑名单）补上。
2. **优先级中**：GitHub OAuth 登录 + MCP 协议级接入；逐文件 diff 视图（版本快照已就绪，只差渲染）；Token 预算管理（估算+超限压缩）。
3. **优先级低**：自定义域名一键绑定部署产物；项目模板市场；多语言扩展（Vue/Flutter）；移动端适配。

## 本地开发

```bash
cd jlcoding
npm install
cp .env.example .env   # OPENCODE_API_KEY（OpenCode Zen，不填则 mock 模式）+ AUTH_SECRET
npm run dev            # scripts/dev.mjs 自动选 SQLite schema，零外部依赖
```

- 本地 SQLite / 线上 Neon（`prisma db push` 双库各自执行，构建只 `prisma generate`）
- 历史项目从 Neon 迁入本地：`node scripts/migrate-neon.cjs`
- 部署复现：Render Blueprint（根目录 `render.yaml`，填 3 个 Secret；buildCommand 注入平台构建 SHA，**Pre-Deploy 自动 `prisma db push` 建新表**，与构建产物解耦）/ Vercel（`vercel deploy --prod`，环境变量同清单）

## AI 工具使用说明

本项目开发全程 AI 结对：使用 **OpenCode（Zen 套餐为主）** 作为主力 coding agent 完成工程实现与调试，**Airship 可视化画布**（选中元素→描述→diff）辅助 UI 迭代；线上生成模型走 **OpenCode Zen**（默认 DeepSeek V4 Pro，分类/问答用轻量 V4.1 Flash），按官方要求携带会话头与自定义 User-Agent。额度受限时支持 **BYOK**（用户自有 OpenAI 兼容 Key）。

## 技术栈

Next.js 14 (App Router) · Tailwind CSS + shadcn/ui 风格组件 · Vercel AI SDK v7（ToolLoopAgent + prepareStep）· OpenCode Zen 网关（DeepSeek V4）· Sandpack · esbuild（服务端打包部署）· Playwright（浏览器级验证）· Prisma（SQLite 本地 / Neon 线上）· SSE + 心跳 · jose + bcryptjs（JWT 认证）· react-resizable-panels · jszip
