# OhMyBuddy 文档

[项目首页](../README.zh-CN.md) · English: [project overview](../README.md) · [installation](en/INSTALL.md) · [user guide](en/USER_GUIDE.md) · [Buddies](en/BUDDY.md)。详细功能和开发文档目前主要为中文。

## 从哪里开始

| 你是 | 先读 |
|---|---|
| 第一次使用的用户 | [用户指南](USER_GUIDE.md) |
| 要安装、升级或恢复实例的管理员 | [安装与恢复](INSTALL_RECOVERY.md)，再按平台读 [macOS](MACOS.md) / [Windows](WINDOWS.md) |
| 协助用户安装、配置或排障的 Agent | [用户 Agent 操作指南](AGENT_GUIDE.md) |
| 修改 OhMyBuddy 源码的开发者或 Agent | [开发文档](development/README.md) 与根目录 [AGENTS.md](../AGENTS.md) |

本目录随源码更新，可能包含尚未公开发布的功能；源码版本看 [package.json](../package.json)，实际能力看运行实例。正式公开版本、下载、校验和准确验收摘要以 [GitHub Releases](https://github.com/YogurtJ/OhMyBuddy/releases) 为准。公开发布不自动切换已有实例；升级前按[安装与恢复](INSTALL_RECOVERY.md)保存草稿、停机备份并保留数据路径。完整变化见 [CHANGELOG](../CHANGELOG.md)。

[1.12.0 版本说明](releases/1.12.0.md)涵盖 Pi 1.5、官方 Playwright MCP、任务与项目导航、存储布局、定时任务及流式渲染改进。当前正式版为 [OhMyBuddy 1.12.0](https://github.com/YogurtJ/OhMyBuddy/releases/tag/v1.12.0)（2026-11-04 已发布，Latest），八份源码发行附件匿名回下载摘要一致。[完整安装包](https://download.bitcosmos.cn/)提供 macOS ARM64、Windows x64 和 glibc Linux x64，stable／preview 签名频道同步；新 Linux ARM64 包暂停，历史附件仍保留。准确包、原失败、补验、复用及本次真实 HTTPS 更新结果见[平台验证范围](RELEASE_INSTALL_VALIDATION.md)。

上一正式版 [OhMyBuddy 1.11.1](https://github.com/YogurtJ/OhMyBuddy/releases/tag/v1.11.1) 于 2026-10-30 发布。[1.11.1 版本说明](releases/1.11.1.md)涵盖调度器异常退出后的恢复、伙伴头像与话题整理、旧分类退役和完整包安装支持。九份源码发行附件匿名回下载的大小和 SHA256 均与上传原件一致；准确归档、四个原生目标的定向验证、Windows 单项补验及未变范围复用见[平台验证范围](RELEASE_INSTALL_VALIDATION.md)。完整安装包采用独立预览渠道和构建身份，已有 1.11.1-rc.2 不因源码发布自动包含本次调度器修复。

OhMyBuddy 原名 Pivane。上一正式版 [1.11.0 版本说明](releases/1.11.0.md)记录改名、伙伴模式、微信操作与记忆、过程和状态回执、原生会话图片外置以及 macOS 完整平台包预览；其完整安装／升级／恢复基线和已知限制继续由对应 Release 附件追溯。

此前Windows微信组件安装与静态翻译修复见[1.10.2说明](releases/1.10.2.md)。1.10.1的安全与兼容说明继续适用；从更早版本更新时，留意旧内置MiniMax TTS adapter已移除，配置和历史音频保留，详见[1.10.1说明](releases/1.10.1.md)。

下面按主题列出功能文档。每篇前半部分讲使用，后半部分可能包含接口字段和限额，供高级用户、集成者和用户 Agent 查询。模型能力来自实际配置与运行实例；文档中的示例不代表服务已经配置好。

## 安装、升级与运维

| 任务 | 文档 |
|---|---|
| 部署、升级、备份和恢复 | [安装与恢复](INSTALL_RECOVERY.md) · [macOS](MACOS.md) · [Windows](WINDOWS.md) |
| 程序与个人数据分离、各平台目录、备份及迁移 | [存储布局](STORAGE_LAYOUT.md) |
| 后台常驻、登录启动与桌面入口 | [后台服务](BACKGROUND_SERVICE.md) |
| 给已有 Pi CLI 接入网页，共用模型与身份 | [已有 Pi 接入](PI_CLI.md) |
| 检查版本、交给独立 Agent 辅助更新 | [版本与更新](UPDATES.md) |
| 网络与访问、通知、日常排障 | [网络与访问](ACCESS_CONTROL.md) · [通知](NOTIFICATIONS.md) · [运维](OPERATIONS.md) |
| 界面语言、浏览器默认与生效方式 | [中英文界面](I18N.md) |

## 会话与日常工作

| 任务 | 文档 |
|---|---|
| 输入、命令模板、Shell | [命令与模板](COMPOSER_TOOLS.md) · [Shell](WEB_SHELL.md) |
| 上传办公文档、音视频或压缩包，管理附件容量 | [办公/PDF](COMPOSER_TOOLS.md#上传办公文档与-pdf) · [通用原件](COMPOSER_TOOLS.md#通用原件附件) · [附件清理](COMPOSER_TOOLS.md#附件用量与清理) |
| 停止、重试、运行与配置恢复 | [运行控制](NATIVE_CONTROLS.md) · [运行与配置恢复](NATIVE_COMPLETION.md) |
| 历史、分叉、导入导出 | [历史](HISTORY.md) · [工作流](SESSION_WORKFLOWS.md) · [导入导出](SESSION_TRANSFER.md) |
| 将微信文字私聊绑定到原生线程 | [微信与消息渠道](MESSAGE_CHANNELS.md) |
| 围绕当前任务的临时侧聊 | [侧聊](SIDE_CHAT.md) |
| 让 Agent 新开线程交办任务、线程间直接沟通 | [Agent 任务线程与线程间消息](AGENT_THREADS.md) |
| 周期执行、文字问候与身份主线程 | [定时任务](SCHEDULED_TASKS.md) |
| 跨会话查看明确交付和媒体结果 | [成果中心](ARTIFACTS.md) |
| 文件浏览、交付物与正文渲染 | [文件查看](FILE_VIEWER.md) · [数学公式](MATH.md) · [Mermaid](MERMAID.md) |
| 用量与朗读 | [用量统计](USAGE.md) · [回复朗读](REPLY_TTS.md) |

## 模型、扩展与助手

| 任务 | 文档 |
|---|---|
| 服务商认证、聊天模型、Thinking | [服务商与模型](PROVIDER_SETTINGS.md) |
| Pi 原生设置、资源、Packages/Skills、系统提示词 | [Pi 原生设置](NATIVE_SETTINGS.md) |
| 按用途配置标题与媒体规划模型 | [辅助模型](AUXILIARY_MODELS.md) |
| 内置浏览器、网页填表、独立登录与手动接管 | [浏览器助手](BROWSER.md) |
| Pi 原生 MCP、Codemode 和旧适配器迁移 | [原生 MCP](MCP.md) |
| 内置子 Agent、记忆组件与旧安装兼容 | [内置能力包](BUNDLED_CAPABILITIES.md) |
| 助手身份与档案记忆 | [助手档案](AGENT_PROFILES.md) · [记忆契约导航](PROFILE_MEMORY.md#read-by-task) |
| 有名字和性格的私人助理 | [伙伴模式](BOT_MODE.md) |

## 媒体

| 任务 | 文档 |
|---|---|
| 媒体服务与生成 | [实验室](MEDIA_LAB.md) · [接入协议](MEDIA_CONNECTIONS.md) · [媒体 Agent](MEDIA_AGENT.md) |
| 旧媒体适配器配置 | [Flux](FLUX2_DEV.md) · [MiniMax 视频](MINIMAX_H3.md) · [语音 registry](tts-providers/README.md) |

## 接口与版本

| 内容 | 文档 |
|---|---|
| REST/WebSocket 字段、错误与并发语义 | [API 任务索引](API.md#按任务查接口) |
| 找实现、测试与系统边界 | [模块导航](development/MODULES.md) · [架构](development/ARCHITECTURE.md) · [实现细节](development/RUNTIME.md) |
| 版本变化 | [CHANGELOG](../CHANGELOG.md) · [1.10.0](releases/1.10.0.md) · [1.9.1](releases/1.9.1.md) · [1.9.0](releases/1.9.0.md) · [1.8.0](releases/1.8.0.md) · [1.7.0](releases/1.7.0.md) · [1.6.2](releases/1.6.2.md) · [1.6.1](releases/1.6.1.md) · [1.6.0](releases/1.6.0.md) · [1.5.0](releases/1.5.0.md) · [1.4.0](releases/1.4.0.md) · [1.3.0](releases/1.3.0.md) · [1.2.0](releases/1.2.0.md) · [1.1.0](releases/1.1.0.md) · [1.0.0](releases/1.0.0.md)；RC 版本说明保留在对应 Git 标签 |
| 各版本平台验收范围 | [平台验证范围](RELEASE_INSTALL_VALIDATION.md) |
| 产品方向 | [路线图](ROADMAP.md) |

## 文档维护

公开文档的明确清单为 [public-files.json](public-files.json)，新增或删除文档须同步登记；责任分工见 [开发流程](development/WORKFLOW.md#文档责任)。实例地址、部署状态和维护记录不属于公开文档，保存在维护者的私有资料中（本机 `AGENTS.local.md` 提供入口），被 Git 与发行规则排除，应用和公开文档不依赖它们。
