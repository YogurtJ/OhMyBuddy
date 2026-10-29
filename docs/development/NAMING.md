# OhMyBuddy 命名与旧版兼容

产品显示名为 **OhMyBuddy**，原名 **Pivane**。应用包名、新源码归档、新安装目录和服务标识使用 `ohmybuddy`；公开启动配置使用 `OHMYBUDDY_`。应用版本延续1.11.0，不因改名重置版本号。

Pi Coding Agent及其包名、原生SessionManager、JSONL格式和原生环境变量属于上游接口，继续使用Pi的真实名称。`pi-*.js`中的适配模块不表示产品仍叫旧名称。第三方源码、版权及已发布版本说明保留原身份。

## 当前品牌与真实外部地址

网页标题、PWA、通知、指南、安装包、服务描述和新图标使用OhMyBuddy。README首次说明“原Pivane”，以便旧用户识别同一项目。当前公开仓库仍是`YogurtJ/pivane`；在维护者真正改名之前，文档、问题链接与更新检查继续访问这个实际地址。源码修改不自动重命名GitHub仓库、域名、远端、系统服务或运行目录，也不推送或公开发行。

## 单一旧版数据位置

`server/ohmybuddy-compat.js`集中选择新旧存储和安装身份；旧`server/pivane-compat.js`仅保留导入转发，供已安装扩展兼容。

新建位置使用`ohmybuddy-workspace.json`、`ohmybuddy-access.json`、`ohmybuddy-network.json`、`ohmybuddy-notifications.json`和`ohmybuddy-deferred-messages*.json`。既有Pivane文件或更早`pi5-*`文件继续原位使用；读取时不复制、不迁移、不建立第二份配置。若同一逻辑数据的新旧位置同时存在，明确拒绝猜测，先停机备份并由维护者确定有效来源。

此规则同样用于`.ohmybuddy-runtime`与`.pivane-runtime`、档案与Bot、定时／渠道、队列／移动回执、附件／图片／交付和用量数据。知识日志与pending标记按一组选择，不能将未完成操作遗留在旧命名下、另开一份新账本。实际路径仍接受原有realpath、描述符、类型、权限、预算及前后变化核验，名称选择不能替代这些边界。

访问Cookie继续从原配置派生，改名不要求清空浏览器或重新创建身份。手工改变配置实际位置可能需要重新验证，不能只改文件名就声称会话已迁移。若跨域名，浏览器存储和Cookie按浏览器同源规则处理，源码兼容不等于跨域迁移。

## 有意保持的持久格式和协议

以下旧拼写是已保存或线上互通的格式标识，继续保持，不作品牌字符串替换：

- 原生会话中的`pivane-*` custom entry／custom message、旧`pi5-*`兼容标记、工具结果details中的`pivane…`字段、上下文标记和结构化回执。
- 已外置图片的`pivaneImage`字段；旧图片说明文本继续可读取。新图片说明显示OhMyBuddy，旧JSONL原字节不改写。
- `<pivane_document>`、`<pivane_attachment>`引用、`#pi-delivery`链接、REST／RPC路径与现有更新响应中的`pivane`键。
- 私有桥接命令和版本化IPC字段、Symbol注册键、任务／预约的既有类型标记。旧或迟到私有回复仍被截获，不进入模型正文或浏览器普通消息。
- 浏览器`pi.web.*`、`pivane.*`偏好、历史路由键、头像preset ID及SQLite表名。原收藏、通知、主题和模型偏好无需重置。

这些名称的协议升级应作为独立迁移处理。历史聊天、工具参数、提示词、摘要、旧路径、正式包名和校验记录保留原文。不能把改名变成对原生JSONL正文或数据库的全局替换。

## 环境变量与凭据

新的公开配置优先使用`OHMYBUDDY_`。同后缀的`PIVANE_`仍兼容；下列原有`PI_`别名也保持：

| 用途 | 后缀 |
|---|---|
| 项目与访问 | `PROJECT_ROOTS`、`ALLOWED_ORIGINS`、`WEB_TOKEN`、`WEB_SECURE_COOKIE` |
| worker与项目资源 | `WEB_IDLE_MS`、`WEB_STARTUP_TIMEOUT_MS`、`WEB_APPROVE_PROJECTS`、`WEB_CLI` |
| 实例数据与媒体 | `WEB_DEFERRED_FILE`、`MEDIA_CONFIG_DIR`、`MEDIA_DATA_DIR`、`MEDIA_PROFILE`、`MEDIA_PLANNER_MODEL` |
| 实例URL与媒体CLI | `WORKSPACE_BASE_URL`、`WORKSPACE_ACCESS_TOKEN` |

保留策略和文件交付限额等应用配置也支持`OHMYBUDDY_`与`PIVANE_`。继承环境优先于`.env`中的所有拼写；同一来源出现互相冲突的非空值时拒绝启动，只列变量名，不显示值。`OHMYBUDDY_MEDIA_PROFILE=clean`跳过本地配置。内部适配层可继续使用规范化后的旧变量，不改变上游身份。

`PI_CODING_AGENT_DIR`、`PI_CODING_AGENT_SESSION_DIR`、`PI_OFFLINE`、`PI_TELEMETRY`等原生变量保持原名。不得把真实HOME／USERPROFILE改成应用名，也不复制auth.json制造新身份。

新媒体凭据通过ModelRuntime.login保存为`ohmybuddy-media:`；读取依次兼容`ohmybuddy-media:`、`pivane-media:`和`pi5-media:`，逻辑Provider状态去重。删除通过公开logout处理三种名称。读取不改写凭据，保留原有私有权限、原子保存和未知字段语义。

## 源码归档与Mac完整平台包

新源码包为`ohmybuddy-<version>.tar.gz`，manifest产品为OhMyBuddy，根包名为`ohmybuddy`。新代码可验证新旧两种已知源码归档，但根目录、产品、版本和包名必须一致，全部文件摘要及私有文件排除仍校验；不会根据远端提供的任意文件名或URL下载代码。公开源仍使用实际GitHub仓库。

新Mac包为`ohmybuddy-<version>-darwin-<arch>.tar.gz`，元数据为`OHMYBUDDY_BUNDLE.json`与`OHMYBUDDY_INSTALLATION.json`；包内使用`ohmybuddyBundle`／`ohmybuddyCompatibility`／`ohmybuddyManaged`。新读取器兼容原Pivane格式，拒绝冲突双元数据。签名分发清单的product同时绑定资产名和载荷产品，正常TLS、签名、来源、大小／哈希与运行时核验保持。

旧Pivane更新器只认识旧格式，**不能直接向旧客户端的原渠道发布OhMyBuddy格式包**。迁移应先提供显式过渡包：在新源码的Mac构建命令中传`--product Pivane`，生成旧包名／旧元数据外壳、内含新兼容代码的包，并在仍为Pivane的签名渠道发布。旧客户端完成这一版本后，应在空闲时经原管理入口正常停止／启动服务，让固定入口从已选中的新版本加载新版启动器；核对其新格式支持后再切换渠道。只更新子服务而未重启仍可能保留内存中的旧更新器，不能直接进入下一步。新的OhMyBuddy渠道应独立配置并签名；发布工具拒绝在同一渠道混合两种product。构建支持不表示过渡包或渠道已经构建、验收或公开发布。

新Mac桌面入口为OhMyBuddy.app，默认安装到`~/Library/Application Support/OhMyBuddy/desktop`。若已有Pivane安装，启动器选择已有原目录和服务记录，不移动用户数据、不重复登记另一服务；两份安装父目录同时存在时拒绝猜测。新服务标识以`ohmybuddy-`、`app.ohmybuddy.`开头，已有服务保留原登记标识与启动路径。

## 目录／实例迁移是独立维护步骤

源码目录改名还涉及Git工作区、服务启动路径、运行快照、Package路径、项目信任、预约和原生会话。改名源码不会移动当前运行目录，也不会在对话中重启承载自身的服务。

原生会话通常位于Pi身份目录的`sessions/--编码后的项目路径--/`。以实际header ID和原生文件识别会话，文件名ID可能不同；`cwdOverride`或`forkFrom`不能当作保留身份的迁移。

`server/pi-session-relocation.js`提供离线迁移函数：调用方先停止全部相关writer并备份，取得安装锁，拒绝目标碰撞、链接和不支持格式，检查跨项目parent引用；仅修改完整v3头部cwd和范围内parentSession路径，保留会话ID／时间及头部后的全部正文原字节，并保留活动时间。通过原生SessionManager核对完整分支、leaf、书签、名称与上下文，再检查源文件未变后发布新目录。中断不自动重放，按plan、备份和两处目录核对恢复。

真实实例切换还要检查所有任务、Shell、侧聊、预约、媒体、导入导出、配置及外部Pi写入；验证项目列表、继续会话、分支／书签、附件引用、任务回执和维护入口。现有实例迁移完成之前，旧服务／目录／远端名称属于真实现状，不能仅改文档冒充完成。
