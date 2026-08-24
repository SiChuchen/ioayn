# 09 — Security, Privacy and Trust v1.1

## 数据类型

IOAYN 可能接触私有源码、配置、日志、网络请求、测试数据和用户与 Agent 的完整交流。

## v1.1 安全属性

- MCP 使用本地 stdio，不监听网络；
- 写入限制在目标仓库 `.ioayn/`；
- ID 白名单防止路径穿越；
- JSON 原子写；
- 外部 Git 命令使用参数数组；
- Explorer/Verifier 禁止 Write/Edit；
- transaction journal 支持失败检测；
- 原始交流默认 gitignored。

## Opt-in Journal

Hooks 随插件加载，但只有 `start_learning_session` 创建 active marker 后才写入。

这意味着：

- 普通 Claude Code 对话不会被 IOAYN 自动保存；
- 初始学习提示由 MCP 显式保存；
- `finish_learning_session` 关闭捕获；
- 用户可删除 `journal/` 而不影响项目源码。

## 原始交流与共享知识

Journal 可能包含错误答案、个人备注、秘密和临时推断，不能默认提交。

LearningAsset 进入共享前应：

- 脱敏；
- 去除无关对话；
- 绑定 evidence 和 revision；
- 标注 confidence；
- 保留 provenance 但避免复制敏感原文。

## 运行权限

生产、提权、外部写、数据库写、云资源、动态插桩、内核 Trace、昂贵或长时任务必须获得明确批准。

## 外部模型

自托管 MCP 不代表模型本地。私有代码是否离开机器取决于 Claude Code/模型网关部署。IOAYN 文档和 UI 不得暗示本地 MCP 自动满足数据合规。

## Atlas 隐私

Atlas 可能暴露系统结构、组件名和安全边界。导出或提交前应评估仓库可见性。个人 recent focus 和 Journal 不属于共享 Atlas。

## Freshness boundary

Freshness compares product/source changes while excluding `.ioayn/` knowledge files. A commit that only adds or updates IOAYN assets must not make those assets stale. Dirty product source still requires verification, and a committed product-source change marks older assets stale.
