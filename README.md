# jlCoding — 把 idea 变成可运行的代码

> 输入自然语言需求，AI 智能体把它变成可运行的应用 —— 业务分析 → 你确认 → 架构设计 → 代码生成 → 沙箱校验 → 实时预览，全流程可视化、可暂停、可断点续跑。

- **在线演示（主入口，国内直连）**：https://jlcoding.onrender.com
- 备用（海外网络）：https://jlcoding.vercel.app
- **GitHub 仓库**：https://github.com/icelo9931/JLCoding

**30 秒体验路径**：打开演示链接 → 输入需求（可指定编程语言，**未指定默认 Python**；说"网页版/前端"则生成 React）→ 点开始生成 → 注册（邮箱+密码，10 秒）→ 自动进入会话 → 确认需求理解 → 等待生成（可暂停/续跑）→ 预览/下载 ZIP/一键推送 GitHub。

## 功能全景

**生成管线**
- 五角色顺序管线：业务分析师 → 架构设计师 → 代码工程师 → 测试工程师 → 修复工程师
- 需求确认：分析师产出理解卡片，可**追加补充并重新分析**，确认后才生成
- **逐 token 流式**：左侧打字机气泡 + **代码生成实时可见**（writeFile 参数流逐字解码推送，大文件生成期间界面不再静默）；生成中两栏布局（对话流占 2/3，右侧进度），完成后预览回中间恢复三栏（宽度可拖拽、自动记忆）
- **暂停 / 断点续跑**：AbortController 中止，已完成阶段落库，续跑自动跳过（实测：中断后续跑仅 7.6 秒走完校验）
- **增量 diff 式修改**：自动识别"修改轮"，工程师先读后改、只写需要改的文件（实测：改生肖显示仅动 2/9 文件，其余逐字节不变）
- **多轮自动修复**：静态校验失败自动进入修复循环，最多 3 轮直到通过
- **Token 消耗展示**：每轮对话结束右下角显示输入/输出 token 用量

**语言与沙箱**
- **默认 Python**（tkinter 单文件、仅标准库），需求含"网页/前端/react"等关键词或明确指定时生成 React
- React：Sandpack 浏览器内真实编译预览（desktop/tablet/mobile、新窗口、真实编译耗时展示）
- Python：黑底 IDE 配色代码展示 + 下载运行指引（浏览器无法运行 Python，如实降级）
- 静态校验：JSON 合法性 / 入口完整 / 依赖声明 / 括号平衡 / **const 重赋值检测**（拦截过真实线上 bug：`const offset` 后 `offset -=` 导致 Sandpack 编译失败）

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

## 实现思路与关键取舍

### 顺序角色管线而非单一长循环（附实测依据）

实测发现 Vercel AI SDK v7 的 `ToolLoopAgent` 工具循环在**无工具调用的步骤后必然终止**（循环条件要求上一步存在工具调用），无视 `stopWhen`。因此最终架构：业务分析师/架构设计师独立单轮生成，代码工程师/测试工程师/修复工程师内部保持工具循环（`prepareStep` 注入角色指令与工具白名单）。这比多智能体框架（消息路由、状态同步、失败恢复）确定得多、可调试得多——项目时间有限，"跑得通的闭环"优先于"架构展示"。

### 为什么选择 Sandpack 而非 E2B

我选择 Sandpack 而非 E2B，是因为在 8 小时的时间约束下，保证预览环节 100% 可靠比支持全栈应用更重要。Sandpack 在浏览器内完成打包和渲染，没有服务器沙箱的启动延迟和超时风险，用户从输入需求到看到结果的时间可以控制在 30 秒以内。代价是只支持 React 纯前端应用，不支持需要后端数据库或 API 的应用。如果继续投入时间，接入 E2B 支持全栈是优先级最高的扩展方向。

预览工具栏中的"构建校验：通过（Sandpack 编译耗时 X.Xs）"来自 Sandpack 真实的 start/done 编译事件（`useSandpackClient().listen` 实测），不是编造的数字。

### 默认 Python 的取舍

笔试要求"用户可指定编程语言"。我的取舍：**未指定时默认 Python（tkinter 单文件、仅标准库）**，保证用户本机 `python main.py` 零依赖可跑；React 仅在需求明确指向 Web 时启用（保留 Sandpack 实时预览这个核心卖点）。浏览器无法运行 Python，预览区如实降级为"IDE 配色代码展示 + 下载运行指引"，不做假的预览。

### 双数据库策略（含一次真实事故）

初期"本地与线上统一 Neon（美东）"，后被真实事故推翻：国内网络直连 Neon 不稳定（P1001 连接超时导致用户续跑时全部 500）。修复方案：**本地 SQLite（`schema.dev.prisma`，零外部依赖、永不因网络失败）+ 线上 Neon Postgres**，`scripts/dev.mjs` 按 `DATABASE_URL` 前缀自动选 schema；所有 API 加数据库可达性兜底（可读错误信息而非裸 500）。教训写入设计：**开发环境的依赖必须与网络状况解耦**。

### 其他关键取舍

- **SSE 而非 WebSocket**：单向事件流足够，复杂度低一个量级；15s `: ping` 心跳防长生成被代理掐断（曾实测无心跳时客户端 300s body 超时中断）。
- **OpenCode Go 网关合规接入**：OpenAI 兼容协议 + 官方要求的 `x-opencode-session` 会话头（按项目隔离，利于路由与 prompt 缓存）+ `jlcoding/1.0` User-Agent；顶栏/首页可切换全部 `/chat/completions` 模型，按项目持久化。
- **const 重赋值静态检测**：来自真实线上 bug（lunar.js `const offset` 后 `offset -=`，静态校验通过但 Sandpack 编译失败）。启发式正则检测（去字符串/注释后扫描 const 变量的 `+= -= ++ -- =` 重赋值），三组用例验证零误报——把"用户看到的编译错误"前移到"交付前自动修复"。
- **mock 兜底**：无 API Key 时预置待办应用走完整事件流，演示永远可用。
- **认证从简**：邮箱+密码、不做邮件验证（演示项目的标准取舍，10 秒完成注册）；GitHub OAuth 登录列为下一轮。

## 质量与实测数据

自动化冒烟脚本（`jlcoding/scripts/`，均可复跑）：

| 脚本 | 场景 | 关键实测结果 |
|---|---|---|
| `test-auth-e2e.cjs` | 注册→登录→门控→越权→生成→ZIP | 全过；未登录创建 401、越权 403 |
| `test-incremental.cjs` | ready 项目提修改需求 | **仅改 2/9 文件**，未触及文件逐字节一致；Token 入 42,572/出 16,575 |
| `test-python.cjs` | 不指定语言生成 BMI 计算器 | 默认 Python ✓，main.py（tkinter+`__main__`）6170 字符，校验通过 |
| `test-const-check.cjs` | const 重赋值检测 | bug 代码检出 / 正常代码零误报 / 属性与字符串不误报 |
| `test-delta.cjs` | 逐 token 流式 | 262 个增量、首字 6.1s、拼装与最终一致 |
| `smoke2.cjs` | 确认/追加/暂停/续跑 | 全过；断点续跑跳过已完成阶段 |
| `test-novice-calendar.cjs` | 阴阳历计算器（React） | 9 文件 ready，校验 exit 0，ZIP 27KB |

其他实测：阴阳历计算器完整生成（DeepSeek V4 Pro）364s；断点续跑 7.6s；追加重新分析 5s（缓存生效）；V4 Pro 生成吞吐显著高于 Flash（871s 级任务切 Pro 后明显缩短）。

## 文件存储位置与数据说明（如实）

| 数据 | 存储 | 说明 |
|---|---|---|
| 账号（邮箱/密码 bcrypt 哈希） | 数据库 | 密码只存哈希，JWT 会话在 httpOnly Cookie |
| 项目/对话/生成文件 | 数据库 | 线上 Neon Postgres（美东）；本地开发 SQLite（`prisma/dev.db`） |
| 上传的文件 | **不落盘** | 前端读取为文本（≤50MB、截断 2 万字符）作为上下文随请求传输，不存储原文 |
| 参考链接内容 | **不存储** | 服务端即时抓取网页正文注入当次分析，用后即弃 |
| GitHub PAT | **仅浏览器 localStorage** | 推送由浏览器直调 GitHub API，PAT 不经过服务器 |
| 自定义 Skill/MCP/Agent | **仅浏览器 localStorage** | 个人偏好，随请求注入 |

## 域名与国内外部署（如实）

| 平台 | 地址 | 国内可达性 |
|---|---|---|
| **Render（主入口）** | https://jlcoding.onrender.com | **实测直连无需代理**（新加坡区域）；免费层 15 分钟无流量休眠，首开约 50 秒 |
| Vercel（备用） | https://jlcoding.vercel.app | `*.vercel.app` 被 SNI 阻断，国内需代理；海外用户访问快 |

正式对外建议绑定自定义域名（指向 Render，无需备案即可直连；需备案 CDN 加速则另议）。每次 `git push` 两平台自动部署。

## 当前完成程度

- ✅ **已完成**：上文"功能全景"全部条目（五角色管线/确认追加/流式/暂停断点/增量修改/多轮修复/Token 展示/默认 Python 与 React 双语言/const 检测/6 Agent+自定义/Skill+MCP 面板/文件+链接输入/Sandpack 预览/账号隔离/GitHub 推送/ZIP/双模式/双平台部署）
- ⚠️ **部分完成**：MCP 仅说明级注入（未协议级调用）；GitHub OAuth 登录未做（按钮已预留）；图片上传不解析内容（如实标注）；自动修复上限 3 轮（不无限重试）；修复轮后仍失败时以 Sandpack 实际编译结果为准（如实提示）
- ❌ **未完成**：E2B 真实服务器沙箱（`npm install/build` 真跑）；"部署"按钮（占位）；移动端专项适配；跨会话长期记忆（Skill 已部分覆盖风格偏好）；版本回滚/diff 对比视图

## 如果继续投入时间，我会如何扩展

1. **优先级最高**：接入 **E2B 真实沙箱**——服务端真跑 `npm install && npm run build` / `python -m py_compile`，替代静态校验；Python 可加 Pyodide 浏览器内运行实现真预览；自动修复改为"直到通过"的无上限（带预算控制）。
2. **优先级中**：GitHub OAuth 登录（OAuth App 已规划）+ MCP 协议级接入（stdio/SSE server 真连工具）；版本回滚（每次生成存快照，一键回退）+ 逐文件 diff 视图；Token 预算管理（估算+超限压缩）。
3. **优先级低**："部署"按钮接 Vercel/Render API 一键部署生成应用；项目模板市场；多语言扩展（Vue/Flutter）；移动端适配。

## 本地开发

```bash
cd jlcoding
npm install
cp .env.example .env   # OPENCODE_API_KEY（OpenCode Go，不填则 mock 模式）+ AUTH_SECRET
npm run dev            # scripts/dev.mjs 自动选 SQLite schema，零外部依赖
```

- 本地 SQLite / 线上 Neon（`prisma db push` 双库各自执行，构建只 `prisma generate`）
- 历史项目从 Neon 迁入本地：`node scripts/migrate-neon.cjs`
- 部署复现：Render Blueprint（根目录 `render.yaml`，填 3 个 Secret）/ Vercel（`vercel deploy --prod`，环境变量同清单）

## AI 工具使用说明（笔试可选加分项）

本项目开发全程 AI 结对：使用 **OpenCode（Zen + Go 套餐混合，Go $10/月）** 作为主力 coding agent 完成工程实现与调试，**Airship 可视化画布**（选中元素→描述→diff）辅助 UI 迭代；线上生成模型走**性价比优先的 OpenCode Go 套餐**（DeepSeek V4 Pro/Flash），按官方要求携带会话头与自定义 User-Agent。

## 技术栈

Next.js 14 (App Router) · Tailwind CSS + shadcn/ui 风格组件 · Vercel AI SDK v7（ToolLoopAgent + prepareStep）· OpenCode Go 网关（DeepSeek V4）· Sandpack · Prisma（SQLite 本地 / Neon 线上）· SSE + 心跳 · jose + bcryptjs（JWT 认证）· react-resizable-panels · jszip
