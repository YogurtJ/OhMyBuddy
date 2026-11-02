# 存储布局、备份与迁移

OhMyBuddy 把程序、配置、运行状态、持久数据、缓存和工作文件按生命周期管理。普通用户从“文件”查看成果，使用安装器更新；无需知道 Git 或受管版本目录。源码完成与实际安装的布局是不同状态，旧安装不会在启动时自动搬迁。

## 推荐布局与各平台默认值

`~` 表示运行 OhMyBuddy 的系统用户主目录，不是浏览器设备的目录。下表描述新安装；已有数据按后面的兼容规则识别。

| 用途 | macOS | Linux | Windows 原生 |
|---|---|---|---|
| 安装包的程序入口 | `~/Library/Application Support/OhMyBuddy/app` | `~/.local/lib/ohmybuddy` | `%LOCALAPPDATA%\Programs\OhMyBuddy` |
| OMB 配置 `CONFIG_DIR` | `~/Library/Application Support/OhMyBuddy/config` | `$XDG_CONFIG_HOME/ohmybuddy`，默认 `~/.config/ohmybuddy` | `%APPDATA%\OhMyBuddy` |
| OMB 运行状态 `STATE_DIR` | `~/Library/Application Support/OhMyBuddy/state` | `$XDG_STATE_HOME/ohmybuddy`，默认 `~/.local/state/ohmybuddy` | `%LOCALAPPDATA%\OhMyBuddy\state` |
| OMB 持久数据 `DATA_DIR` | `~/Library/Application Support/OhMyBuddy/data` | `$XDG_DATA_HOME/ohmybuddy`，默认 `~/.local/share/ohmybuddy` | `%LOCALAPPDATA%\OhMyBuddy\data` |
| 可重建缓存 `CACHE_DIR` | `~/Library/Caches/OhMyBuddy` | `$XDG_CACHE_HOME/ohmybuddy`，默认 `~/.cache/ohmybuddy` | `%LOCALAPPDATA%\OhMyBuddy\cache` |
| 工作文件 `WORKSPACES_DIR` | `~/OhMyBuddy Workspaces` | `~/OhMyBuddy Workspaces` | `%USERPROFILE%\OhMyBuddy Workspaces` |
| Pi 原生兼容域 | `~/.pi/agent` | `~/.pi/agent` | `%USERPROFILE%\.pi\agent` |

Windows 的 APPDATA/LOCALAPPDATA 缺失时使用当前用户 `AppData/Roaming`、`AppData/Local`。Linux 的 XDG 覆盖必须是绝对路径。WSL 按 Linux 布局，是独立运行环境。

安装包的入口位置与源码位置不是同一个约束：源码解压和 Git checkout 可放在用户选择的位置，包括 `~/OhMyBuddy`；默认工作文件夹另用 `~/OhMyBuddy Workspaces`。实际防护仍检查大小写、真实路径、符号链接、`.git` 文件／目录及受管版本标记，不能仅靠两个名字看起来不同。若用户把源码直接放进默认工作根，创建会明确拒绝，需选择一个外部工作位置；不会回退到源码或第一个项目根。

## 各类内容的归属

- **程序入口**：源码或完整包、依赖、只读安装回执。安装回执只保存外部配置位置等非凭据指针。新安装不在程序目录写 `.env`、`data` 或新的维护目录。
- **OMB 配置**：`instances/<安装路径身份>.env`、按 Pi 身份区分的 `identities/<身份路径身份>/ohmybuddy-{access,network,workspace,notifications}.json`、媒体配置 `media-lab/`。正常更新和重装保留原字节与未知字段。实例配置路径按规范安装路径派生，在 macOS／Windows 上大小写变化不会制造另一套配置。
- **OMB 运行状态**：`installations/<安装路径身份>/runtime/` 内的版本指针、受管候选、服务入口、维护记录和备份。它与工作文件分开；控制容器内的状态文件、版本仓和备份是不同生命周期的子项，用户数据不写进可替换的版本目录。受管版本仅在 `runtime/releases/<ID>/` 中替换，清理也只处理有完整证明的版本／维护备份。
- **OMB 持久数据**：媒体原件、生成文件、媒体历史和提示词等位于 `DATA_DIR/media/`。历史和用户文件不是可清空的缓存。
- **Pi 原生兼容域**：模型、认证、原生设置、信任、资源及 `sessions/` 继续由 Pi 拥有。原生会话绑定的 OMB 档案、窗口索引、队列、预约、用量、附件、外置图片、移动证明和交付等现存存储继续随身份管理；它们是持久数据，不因存放于身份目录就变成可重建缓存。详见[已有 Pi 接入](PI_CLI.md)。
- **工作文件**：`WORKSPACES_DIR/bots/bot-<完整 Bot ID>/` 保存新伙伴文件，`WORKSPACES_DIR/tasks/<随机 UUID>/` 保存新独立会话文件。伙伴改名不移动目录；刷新、关页、重启、普通更新及重装保留文件。删除聊天不递归删除工作目录。已有真实项目仍使用用户选择的原目录。

Pi 原生 JSONL 和其引用的外置图片是聊天事实来源。没有新增 OMB 聊天数据库或复制认证来同步两套身份。原生绑定数据保留在身份域，是为了维持现有文件来源证明、会话恢复和 CLI 共享契约；将它们重新布局必须作为专门迁移处理。

## 可配置项

环境变量先于实例配置；同一来源的新旧别名冲突会拒绝启动，错误不回显凭据。路径必须为绝对路径，不展开 `.env` 中的 `$HOME`、`~` 或 `%USERPROFILE%`。

| 配置 | 含义 |
|---|---|
| `OHMYBUDDY_HOME` | 同时覆盖 OMB 内部根：其下使用 `config/`、`state/`、`data/`、`cache/`；不改变 Pi 身份，不改变工作文件根，也不修改系统 HOME |
| `OHMYBUDDY_CONFIG_DIR`、`OHMYBUDDY_STATE_DIR`、`OHMYBUDDY_DATA_DIR`、`OHMYBUDDY_CACHE_DIR` | 分别覆盖四类内部目录 |
| `OHMYBUDDY_WORKSPACES_DIR` | 覆盖 Bot／独立会话工作文件根；改变它只影响新建工作目录，旧会话和旧 Bot 保持已保存 cwd |
| `OHMYBUDDY_CONFIG_FILE` | 显式选择实例环境配置文件；不能借此合并两份配置 |
| `OHMYBUDDY_RUNTIME_DIR` | 高级维护覆盖；已有旧维护状态时不能仅改变量，必须先完成离线迁移 |
| `PI_CODING_AGENT_DIR` | 原生 Pi 身份覆盖，名称和语义保持上游契约 |
| `OHMYBUDDY_MEDIA_CONFIG_DIR`、`OHMYBUDDY_MEDIA_DATA_DIR`、`OHMYBUDDY_WEB_DEFERRED_FILE` | 保留已有细分路径覆盖及旧别名；已有明确路径不自动改写 |
| 安装器 `--root` | 显式程序入口位置，与数据路径分开 |

工作根仍须在项目允许范围及系统权限内。显式限制项目根的管理员应将工作根纳入允许范围，或设置允许范围内、且位于所有程序／仓库之外的 `OHMYBUDDY_WORKSPACES_DIR`。普通安装采用平台原有全盘项目范围，不要求用户配置这些变量。

配置、状态、持久数据、缓存和工作根不得互相重叠，也不得与程序或 Pi 私有身份重叠。工作目录只是文件组织方式，工具权限仍沿用实际运行用户和既有策略。

## 更新、重装和卸载边界

| 操作 | 可以变更 | 必须保留 |
|---|---|---|
| 正常应用更新 | 新候选程序、验证后切换 active/previous | 配置、Pi 身份与原生会话、媒体、Bot／独立会话及真实项目工作文件 |
| 清理旧版本 | 仅严格证明可清理的 `runtime/releases` 与维护备份；仍保留当前、上一版及恢复所需内容 | 全部身份和工作文件，未知／不完整／变化中的对象 |
| 同位置重装 | 重新放置程序入口；重新连接已保存的外部实例配置 | 外部配置原字节、未知字段、原端口、Pi 身份和所有工作文件 |
| 普通卸载程序 | 停服务后移除已确认的服务登记、快捷方式和程序文件 | 默认保留全部配置、身份、媒体、聊天和工作目录 |
| 显式清除个人数据 | 先列清具体范围、做独立备份，再按用户选择处理 | 共用的 Pi 身份不能当作 OMB 专属目录整体删除；用户项目不属于卸载范围 |

当前没有新增“一键删除所有个人数据”入口，也没有后台工作目录自动清理。程序卸载不等于清除个人数据。重新安装到不同程序路径属于新的安装身份：先用路径清单定位旧外部配置与状态，再显式连接，不自动猜测或合并。

## 源码与 Git checkout 的首次配置

安装依赖后执行 `node scripts/configure-instance.cjs`，助手通过 Pi 的公开目录解析沿用身份，在程序外保存路径与默认值，不复制认证，也不收集安装终端的 Key。已有配置原位返回，不覆盖；可用 `--port` 选择固定端口。随后运行 `node scripts/install-service.cjs`。自定义 `OHMYBUDDY_HOME` 或配置文件时，后续安装／启动应保持同一覆盖或明确的 `OHMYBUDDY_CONFIG_FILE`。

## 查看实际位置

在原程序入口目录执行：

```sh
node scripts/storage-layout.cjs
```

或 `node scripts/storage-layout.cjs --root /absolute/application`。命令只读，返回实际实例配置、布局、Pi 身份、媒体、维护目录、已发现的旧工作根和需要迁移的问题。它不会创建目录、启动 worker、调用模型、搬移文件或打印环境变量中的 Key／Token／Cookie。该输出含本机路径，分享前按需要去除用户名。

`LEGACY_RUNTIME_IN_PROGRAM`、`LEGACY_CONFIG_IN_PROGRAM` 或 `LEGACY_MEDIA_IN_PROGRAM` 表示旧安装仍有程序内存储；保留旧目录，先按下一节迁移。发现冲突时不要删除其中一套来试错。

## 兼容与离线迁移

新默认不表示旧数据已经移动。现存 `pi5-*`／`pivane-*`／`ohmybuddy-*` 配置按唯一已存在位置原位使用；旧 `.env` 和 `.pivane-runtime` 也继续识别。两套候选同时存在、损坏身份或未完成恢复会明确失败，不能自动选择较新时间、复制认证或重放任务。旧 `OhMyBuddyBots`、`PivaneBots` 和 `OhMyBuddy/Tasks` 目录保持原件；旧原生 cwd 继续用于恢复与定位。

迁移分两类，不能只递归搬目录后直接启动：

1. **实例配置、媒体和维护状态出程序目录**：先生成路径清单，列出来源、目标、服务登记、active/previous、现有覆盖及冲突；固定候选包和回退入口。保存草稿、处理附件，暂停实际派发，等待主／侧／子 Agent、Shell、媒体、预约、渠道、配置写入和导入导出结束，再从独立维护通道停机，保留安装锁和单次执行记录。不能停止承载迁移 Agent 自身的服务。
2. **同时备份全部实际位置**：Pi 身份（含原生 JSONL 和外置图片）、外部／旧 `.env`、OMB 配置、媒体与历史、维护状态、Bot 和独立会话工作根及涉及的项目文件。备份需有逐项清单、SHA256、权限／Windows DACL 和完成证明；存在 CLI 等外部 writer 时一并停止。更新自动备份的范围与完整用户备份不同：维护备份包含身份、配置、媒体等已登记来源，工作文件仍需单独保存。
3. **准备而不覆盖**：目标必须为空或已证明与该来源一致；用已有描述符身份、内核路径、预算和前后变化校验复制，保留权限、未知字段和原始文件。维护状态中的活动版本、服务 runner／stop-request／日志位置与系统服务登记一起调整；不能仅移动 `.runtime` 后留下旧服务路径。失败保留旧入口和准备结果，不自动重试。
4. **核对后提交切换**：更新外部实例配置及安装回执的配置指针；原生 Pi 身份尽量原位使用。验证同一身份、配置、会话 ID、完整分支与书签、图片／附件引用、队列／预约、工作文件字节及实际服务入口，然后只启动一个管理器。对照新旧清单完成验证后，旧程序内数据才具备另行清理资格。
5. **Bot／独立会话工作目录迁移另做**：只改 `OHMYBUDDY_WORKSPACES_DIR` 不移动已存在会话。优先保留旧 cwd；确需搬移时用[原生路径迁移](development/NAMING.md#目录实例迁移是独立维护步骤)的逐文件计划和语义验证，再结构化更新确实绑定该 cwd 的 Bot 档案、窗口／预约／任务定位及来源证明。保持 session ID、时间、完整树、书签和正文；禁止全局字符串替换 JSONL。普通独立线程可使用[移动到项目](SESSION_WORKFLOWS.md#移动线程到其他项目)，但该操作不搬工作文件。
6. **回退**：停候选的全部 writer，先按验证过的清单恢复原绝对位置与权限，恢复旧入口／服务登记，再核对原生语义。不能把备份直接覆盖一个仍在运行的身份，也不重放不确定请求。

本次提供统一布局与只读检查器，没有把上述跨数据迁移包装成未经验证的一键命令，也没有对当前运行实例执行搬迁。后续真正迁移必须针对实际清单、停机窗口与目标平台产生单独回执。

## 调研依据与取舍

核对时间为 2026-11-02；实现参考与产品建议分开：

- **Codex**：[实际 `find_codex_home` 实现](https://github.com/openai/codex/blob/a09812981de703f18f38015cd5d500ab373f616c/codex-rs/utils/home-dir/src/lib.rs) 使用 `CODEX_HOME` 或 `~/.codex`，对显式位置验证并 canonicalize；[官方配置说明](https://developers.openai.com/codex/config-basic/)说明用户配置和项目配置，[官方 worktree 文档](https://developers.openai.com/codex/app/worktrees/)说明受管工作树的根目录与单独清理政策。OMB 采用明确、可检查的应用目录和单独工作根；普通工作文件不采用 Git worktree 的自动回收策略。
- **OpenCode**：[实际全局根实现](https://github.com/anomalyco/opencode/blob/e764fbe30951fd16bc1daab54a93d0b5c8cc5570/packages/util/src/global-roots.ts)分别解析 XDG data/config/state/cache，[全局路径服务](https://github.com/anomalyco/opencode/blob/e764fbe30951fd16bc1daab54a93d0b5c8cc5570/packages/util/src/global.ts)管理路径与配置覆盖；[官方排障文档](https://opencode.ai/docs/troubleshooting)区分 CLI 数据与桌面应用存储，并介绍卸载范围。OMB 采用生命周期区分，macOS／Windows 使用本机常见用户目录，不假称 OpenCode CLI 使用 AppData 或 Application Support。
- **Pi 1.4.0**：核对了锁定包的 `dist/config.js:getAgentDir/getAuthPath/getSessionsDir`、`dist/core/session-manager.js:getDefaultSessionDirPath` 和随包[环境变量说明](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/environment-variables.md)。身份默认 `~/.pi/agent`，会话目录按 cwd 编码，原生 JSONL 是唯一历史；工作目录与身份目录是不同身份。OMB 保留其目录、认证 API 和原生会话契约，避免为了统一外观产生认证副本或改写历史。

统一的实现入口为 `server/ohmybuddy-storage.js`；新增路径决策应进入此处。文件读取、权限、备份、恢复和清理继续由现有职责模块进行完整校验。
