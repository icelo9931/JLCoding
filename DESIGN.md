# jlCoding 设计方案

> 参照 atoms.dev 的深色三栏工作台布局：左侧对话、中间实时预览、右侧智能体工作日志，底部为全流程进度条。

## 1. 界面结构

```
┌─────────────────────────────────────────────────────────────────┐
│  jlCoding  │  项目名/状态  │  下载代码  │  部署  │  用户头像      │
├──────────────┬──────────────────────────────┬───────────────────┤
│  对话面板     │       实时预览（Sandpack）     │  Agent 工作日志    │
│  用户/AI 消息 │  desktop / tablet / mobile   │  日志│文件│终端     │
│  输入框+示例  │  刷新 / 新窗口打开             │  折叠步骤+代码视图 │
├──────────────┴──────────────────────────────┴───────────────────┤
│  进度条：分析需求 → 设计架构 → 生成代码 → 沙箱测试 → 预览就绪      │
└─────────────────────────────────────────────────────────────────┘
```

- 首页（`/`）：大输入框快速开始 + 示例需求 + 项目列表（状态徽章、文件/消息计数）
- 工作台（`/project/[id]`）：三栏主界面
- 独立预览（`/project/[id]?preview=1`）：全屏预览，供"新窗口打开"使用

## 2. Agent 编排（单 Agent + prepareStep 动态角色）

`lib/agent.ts`：一个 `ToolLoopAgent` 实例，通过 `prepareStep` 在不同步骤切换 system prompt（`instructions`）与 `activeTools`，配合 `onStepFinish` 中的角色状态机推进：

| 阶段 | 角色 | 可用工具 | 推进条件 |
|---|---|---|---|
| 0 | 业务分析师 | 无 | 输出分析文本即完成 |
| 1 | 架构设计师 | 无 | 输出设计文本即完成 |
| 2 | 代码工程师 | writeFile / runCommand / readFile | 产出不含工具调用的总结即完成 |
| 3 | 测试工程师 | runCommand | 校验通过→结束；失败→进入修复 |
| 4 | 修复工程师 | writeFile / runCommand | 修复总结输出即结束 |

- `stopWhen: [() => finished, isStepCount(40)]`：状态机主动结束 + 步数上限兜底。
- 代码工程师被约束为纯 React + JSX、根目录文件、仅 react/react-dom 依赖（Sandpack 可直接编译）。
- 无 `DEEPSEEK_API_KEY` 时自动进入 mock 模式：预置待办应用走完整事件流，保证演示可用。

## 3. 沙箱设计

`lib/sandbox.ts`：内存文件映射沙箱。
- `writeFile / readFile` 操作内存 Map，事件同步落库（Prisma File 表）。
- `runCommand("npm run build")` 为模拟校验：package.json 合法性、必需入口文件、依赖声明、JS/JSON 静态语法检查（括号平衡 + 字符串状态机）。
- 真实编译由前端 Sandpack 在浏览器内完成，编译耗时通过 `useSandpackClient().listen` 的 start/done 消息实测回传，展示在预览工具栏（"构建校验：通过（Sandpack 编译耗时 X.Xs）"）。

## 4. SSE 事件协议

`POST /api/projects/:id/chat` 返回 `text/event-stream`，事件类型：
`agent_start | agent_complete | file_created | file_updated | command_run | preview_ready | task_progress | error | complete`

前端 `hooks/useAgentStream.ts` 流式解析（跨 chunk 缓冲），驱动进度条、工作日志、对话与文件状态。

## 5. 数据模型（Prisma）

`Project`（status: draft/building/ready/error）→ `Message`（role/agent/step）→ `File`（projectId+path 唯一，upsert）。刷新页面后从这三个表完整恢复对话、日志、文件与预览。

## 6. API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST/GET | `/api/projects` | 创建 / 列表 |
| GET | `/api/projects/:id` | 详情（含消息与文件） |
| POST | `/api/projects/:id/chat` | SSE 流式生成 |
| GET | `/api/projects/:id/files` | 文件列表 |
| GET | `/api/projects/:id/download` | ZIP 下载（jszip） |
