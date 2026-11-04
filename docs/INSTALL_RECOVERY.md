# 干净安装、更新与数据恢复

本指南的命令以 **Linux Bash** 为主，面向个人安装；[macOS](MACOS.md)与[Windows](WINDOWS.md)另有原生步骤。OhMyBuddy 支持 Linux、macOS 与 Windows，统一使用 Node 22.x；各版本实际验收过的系统、磁盘与浏览器见[平台验证](RELEASE_INSTALL_VALIDATION.md)。不要把POSIX命令直接粘贴到Windows cmd，Windows项目路径列表使用分号。

## 1. 安装前提

- Node.js **22.x（22.19.0 或更新的 22.x）** 与随附 npm；这是当前锁定依赖的最低次版本要求（用 `node --version`、`npm --version` 核对）。其他 Node 主版本应单独验证。
- Linux Bash、tar、gzip、sha256sum、curl、ripgrep（命令名 `rg`）、CA 根证书。Debian/Ubuntu 可运行 `sudo apt-get update && sudo apt-get install -y bash tar gzip coreutils curl ripgrep ca-certificates`；Node.js 22 按 Node 官方发行说明安装。
- npm registry 的 HTTPS 网络访问；首次安装需要下载依赖，发布包不包含 `node_modules`。界面图标随包本地提供；可选 Inter 字体通过 Google Fonts 加载，不可达时使用系统字体。无需全局安装 Pi、前端构建、GPU、Python、ComfyUI、systemd 或维护者的媒体 Package。
- 运行 Agent 所需的项目命令另行安装，例如 Git、编译器、Python。安装 Git/npm 类型 Package 也可能需要 Git或额外构建工具。`gio` 是可选回收站命令，缺少时网页删除会永久删除选中的文件。
- 自己的服务商账户/API Key，或可访问的兼容模型服务。目录中出现模型不代表已经获得使用额度。

建议使用运行 Pi CLI 的同一普通系统用户安装，不使用 root。普通安装复用当前用户的 Pi 原生身份；模型和认证已配置时无需重新登录，目录识别与 Windows/WSL 差异见[已有 Pi 接入](PI_CLI.md)。只有独立实例或隔离验收才另建身份。并排演练还应清除继承的模型 Key、代理、GPU、`NODE_OPTIONS` 和 `PI_*` 等进程变量；`PI_MEDIA_PROFILE=clean` 只是只读预览模式，**不要用于需要保存配置的正式安装**。

## 选择项目范围

OhMyBuddy 媒体和预约数据按实例保存，Pi 身份默认与 CLI 共用；`PI_PROJECT_ROOTS` 决定网页可以选择哪些服务器项目，两者分别配置。普通安装默认开放电脑上系统用户可访问的目录，Linux/macOS 使用 `/`，Windows 使用各盘符根目录。无需让用户先选择最小范围，也不要自行限制到 Documents 或 demo 目录；用户明确要求缩小时再配置：

| 使用范围 | Linux/macOS 配置示例 |
|---|---|
| 个人电脑上所有系统用户可访问的目录，包括已挂载外置磁盘 | `PI_PROJECT_ROOTS=/` |
| 仅当前用户主目录 | `PI_PROJECT_ROOTS=/absolute/path/to/home` |
| 多个指定目录 | `PI_PROJECT_ROOTS=/absolute/projects:/absolute/other-projects` |

以下 Linux 和 macOS 安装示例统一采用 `/`。路径必须存在并使用真实绝对路径，`.env` 不展开 `~` 或 `$HOME`。Windows 使用分号分隔的盘符路径，见[Windows指南](WINDOWS.md)。系统权限继续生效；目录范围不是工具沙箱。

## 2. 从源码发布包安装

以下以 1.6.0 归档为例，安装其他版本时替换版本号，可下载版本以 [Releases](https://github.com/YogurtJ/OhMyBuddy/releases) 为准。先下载 `ohmybuddy-1.6.0.tar.gz` 及同名 .sha256 到 Downloads，核对发布来源，然后检查哈希：

```bash
ARCHIVE="$HOME/Downloads/ohmybuddy-1.6.0.tar.gz"
(cd "$(dirname "$ARCHIVE")" && sha256sum -c "$(basename "$ARCHIVE").sha256")
```

采用固定的媒体/预约路径与独立版本目录，Pi 身份沿用当前用户的原生目录。以下为新实例，BASE必须尚不存在；已有实例使用更新流程：

```bash
BASE="$HOME/ohmybuddy"
test ! -e "$BASE" || { echo "此目录已存在，请按更新流程操作或选择新的BASE"; exit 1; }
umask 077
mkdir -p "$BASE/releases/1.6.0"
tar -xzf "$ARCHIVE" -C "$BASE/releases/1.6.0" --strip-components=1
cd "$BASE/releases/1.6.0"
node scripts/install.cjs
```

只在所有前置检查成功后安装依赖。使用 nvm 等版本管理器时，版本切换与安装用 `&&` 连接，切换失败不要继续；用 `node -p 'process.execPath'` 核对实际 Node 路径。上述流程使用 Release 发布包；如果用户明确选择 Git checkout，记录 commit 并保留包内原生组件，同样配置独立数据与项目范围，不因源码安装自动运行开发验收。

不要省略 optional dependencies 或复用其他 CPU/操作系统的 `node_modules`。不要执行 `npm audit fix --force` 来改变发布包依赖。部分 npm 镜像不提供 audit 接口，404 不表示存在漏洞或审计通过；可以单次运行 `npm audit --omit=dev --registry=https://registry.npmjs.org`，不改全局 registry。官方接口也失败时保留失败结果，不把它算作0漏洞。

在与原 Pi CLI 相同的用户和配置环境中取得实际身份目录。此命令只报告路径；不要在安装前把 `PI_CODING_AGENT_DIR` 改成新空目录。若 CLI 通过 alias 或启动脚本设置覆盖变量，先使用其实际绝对路径，见[已有 Pi 接入](PI_CLI.md)。

```bash
AGENT_DIR=$(node scripts/pi-agent-dir.cjs) || exit 1
printf 'Pi identity: %s\n' "$AGENT_DIR"
```

以下外部布局适用于包含 configure-instance.cjs 的当前源码；旧归档按随包指南继续识别原位置。生成本实例配置并检查实际路径，助手不复制认证或终端环境中的 Key；完整位置和迁移规则见[存储布局](STORAGE_LAYOUT.md)：

```bash
PI_CODING_AGENT_DIR="$AGENT_DIR" node scripts/configure-instance.cjs
node scripts/storage-layout.cjs
```

安装后台服务，固定实际 Node、身份与启动配置：

```bash
node scripts/install-service.cjs
```

Node/npm 必须可由 PATH 找到；使用版本管理器时保留其 Node 所在路径。非交互 SSH 和 systemd 通常不加载 nvm 的交互初始化，应在服务中明确 Node 的绝对路径和 PATH；不要因 `node: command not found` 就覆盖机器上已有的 Node。常驻服务不会自动继承安装终端的 API Key、代理或 GPU 配置；已保存在 Pi 身份中的认证仍可读取，依赖环境变量或外部命令的认证需为此实例提供相同依赖。如网络必须走代理，请明确添加本实例所需代理。之后也应使用同样的启动方式或专用服务用户/环境，非空进程变量优先于 `.env`。前台 `npm start` 仅用于试用和排障。正式安装默认配置[后台常驻](BACKGROUND_SERVICE.md)，Linux 服务器须核对用户服务的 linger 或等价系统服务，确保注销和重启后仍可启动。

另一个终端检查：

```bash
curl -fsS http://127.0.0.1:11408/api/pi/status
```

预期 `ok=true`，`projectRoots` 为本次配置的 `/`，实际 Pi `version` 对应发布包依赖。浏览器打开 `http://127.0.0.1:11408`。从其他设备访问需要修改 HOST、重启并配置自己的地址/防火墙/访问验证；localhost 指浏览器所在机器。远程管理凭据请使用可信 HTTPS 或受信网络。

## 默认可选能力

`node scripts/install.cjs` 安装锁定依赖并准备随包子 Agent 与档案记忆组件，失败返回非零结果；不会启动任务或启用身份记忆。旧归档没有该脚本时使用 `npm ci`。

子 Agent 模型与角色设置沿用原生配置，资源可在扩展页停用；档案记忆按助手身份启用。旧 CLI 包声明、过滤、记忆数据和独立安装路径保留，OhMyBuddy 优先加载自己的版本。旧跳过变量与安装尝试记录不再控制内置组件。SQLite 平台依赖、跳过脚本后的补全步骤和旧安装兼容见[内置能力包](BUNDLED_CAPABILITIES.md)。

## 3. 首次网页使用

1. 首次进入可“直接开始”独立会话，或“打开项目文件夹”；不会强制先选项目。打开设置 → **服务商与模型**。复用 Pi 身份时应能看到原生配置中的服务商和认证；只有新身份才需要首次配置。
2. 没有可用认证时，展开自己的服务商，选择 API Key 或 OAuth 登录，按步骤提交。OAuth 回调中的 localhost 指服务器，远程浏览器需要服务方支持的设备码/手动回调。Key 只在网页输入，不发到聊天或截图。
3. 自定义兼容服务通过“新增服务商”配置 ID、Base URL 与 API 类型，再添加模型；填真实模型 ID、窗口和输入能力。保存 Key 后选择一个模型设为默认。点击“测试”会产生一次小额真实请求；认证状态不等于请求已测试成功。
4. 关闭设置后直接开始，或在项目入口浏览实际已有文件夹并点击“在此文件夹开始”；也可输入其绝对路径。项目框从服务器的有效默认目录开始，按钮可进入子目录、返回上级或返回可选位置，不再预填维护者路径。网页不创建服务器项目目录，浏览器本机路径不能代替服务器路径。未选择项目时，Pi配置、Packages和Skills只管理全局范围。
5. 只读状态正常、网页可用即完成基础启动。若用户已授权真实模型验收，再新建线程发送“只回复 OK”，刷新后核对回复保留；该请求可能收费。
6. 如需单独验证项目工具，使用合成 UTF-8 文件，不用私人项目作测试；失败或投递结果不明时先核对，不自动重发。

本例默认 `PI_PROJECT_ROOTS=/`，可从用户主目录向上浏览服务器目录树，无需为 Documents 之外的项目另改配置。只有用户希望缩小范围时才改为主目录或多个冒号分隔的指定目录，并空闲重启；系统用户的读/进入权限仍生效，目录范围不是工具沙箱。

如果项目或会话为空，先确认绝对路径存在、在 `PI_PROJECT_ROOTS` 内，且启动读取的是本实例配置。模型设置完成后会在空闲时更新会话目录；已打开会话的模型仍需明确选择，参数与原生资源按其重载契约生效。项目资源是否信任由项目菜单 `/trust` 管理；未信任并不等于工具沙箱。

### 媒体的安装前提

实验室内的“生成方案”显式加载发布包内 `pi-packages/media-workbench/extensions/media-tools.ts`，**不依赖预先全局安装 Package**。它仍需要一个已配置的聊天模型。普通持久聊天的 `media_models`、`media_results`、`media_generate` 已内置，无需另装 Package。独立 CLI 或需要额外兼容规划工具时，才在“扩展 → 已安装”安装本发布目录下的 `pi-packages/media-workbench`，阅读并确认 Package 风险；工具范围见[媒体 Agent](MEDIA_AGENT.md#pi-package)。使用版本目录更新后，要把这个本地 source 改到新版本，或将 Package 单独保留在固定路径并自行更新。

无媒体服务时图像/视频可显示未配置，TTS 为空，这是正常首次状态。托管 HTTP 媒体可在实验室管理页配置；GPU bridge、Z-Image worker 文件/LoRA、ComfyUI 权重、Breeze/Qwen 远端脚本以及 curl/Python/SSH 等是所选 adapter 的额外前提，未附带在发布包中。详见 [媒体接入](MEDIA_CONNECTIONS.md)、[Flux](FLUX2_DEV.md) 与 [TTS](tts-providers/README.md)。不要复制维护者的本机路径或配方来“修复”空目录。

## 项目选择器找不到目录

当前网页不能修改实例的 `PI_PROJECT_ROOTS`。目标目录存在却不在可选范围时，先检查 `/api/pi/status` 返回的 `projectRoots`，再核对实例启动配置。这个问题不能通过创建线程、刷新网页或修改 Pi 项目信任解决。

1. 在检查器返回的实际外部实例配置或服务环境中修改 `PI_PROJECT_ROOTS`；旧 `.env` 继续按原位置修改，不再复制到每个 release。非空进程环境优先于 `.env`，服务管理器中的旧值也要同步。
2. 例如个人 macOS 实例可改为 `PI_PROJECT_ROOTS=/`；仅开放主目录则填真实绝对路径，不能写 `~/Documents` 或 `$HOME`。无需移动项目、会话或数据目录。
3. 保存草稿、暂停预约、等待 Agent/Shell/侧聊/媒体/配置与导入导出操作空闲，再按实例原有方式重启。不能从承载当前操作会话的服务内部停掉自身，应使用独立管理终端或通道。
4. 重新检查 `projectRoots` 并打开目标目录。范围已包含目标但仍无法进入时，再检查目录是否存在、系统读/进入权限与 macOS 隐私控制；扩大根范围不会绕过这些权限。

## 4. 备份范围与一致性

先运行 `node scripts/storage-layout.cjs`，按实际清单备份，不假定个人数据仍在 BASE/data。完整生命周期、平台默认路径与旧布局迁移见[存储布局](STORAGE_LAYOUT.md)。旧安装维持原路径，不能因为新默认已实现就删除原数据。

| 范围 | 必须包含 |
|---|---|
| Pi 身份 | 实际 PI_CODING_AGENT_DIR 的全部配置、原生认证、完整 JSONL、外置图片、附件、档案、窗口索引、队列、预约、用量和来源证明 |
| OMB 配置 | 检查器返回的实例配置、CONFIG_DIR，以及明确覆盖到其他位置的访问／通知／网络／媒体配置 |
| OMB 持久文件 | 实际媒体原件、历史、提示词和其他已登记的数据路径 |
| 用户工作 | 统一工作根、旧 Bot／独立会话工作根和用户项目；工作文件不是可清空缓存 |
| 运行与回退 | 实际 runtime 状态、服务登记、当前／上一版本、恢复所需备份及包摘要 |

保存草稿，暂停派发并等待所有主／侧／子 Agent、Shell、媒体、配置和传输完成，从独立管理通道正常停机；共享身份的 CLI 等外部 writer 同时停止。不能停止承载当前维护 Agent 的服务。备份保存原绝对路径、文件清单与 SHA256、POSIX 权限或 Windows DACL，使用私有位置，不放进源码、下载站或正在备份的树里。

应用更新的自动备份不等于完整用户备份：自动范围包含已登记的身份、配置和媒体来源，用户工作目录还需单独保存。只备份 JSONL 会遗漏其引用的图片和附件；只备份程序目录会遗漏外部配置与工作文件。

## 5. 更新演练

优先在“设置 → 版本与更新”使用受管更新，保留稳定程序入口，由独立启动器准备候选、正常停机、备份、核对并切换外部 active/previous。已有更新授权仍须满足空闲和一次性执行门槛，不确定结果先查看同一维护任务，不重复提交。

手动更新源码时保留原程序、配置和数据清单作回退。新目录先安装锁定依赖，使用同一个外部实例配置；明确选择 `OHMYBUDDY_CONFIG_FILE`，并核对实际 runtime 身份及服务入口。程序路径改变属于安装身份调整，不能只在新目录 npm start，让它误用一套默认空状态。不要复制 .env 回候选版本，也不复制旧 node_modules；旧安装原有 .env 仅按兼容路径保留，搬迁另做。

启动后核对同一 Pi 身份、模型与认证、会话 ID、完整树／书签、图片／附件、媒体历史、工作文件和预约／队列。关闭旧实例后才能启动新实例；失败保留现场，按已验证的原路径备份回退，不重放不确定请求。

## 6. 从备份恢复

1. 从独立管理通道停机，保留当前数据的安全副本。检查备份完成证明、清单、SHA256、权限和匹配的程序版本；不能将备份覆盖到仍有 writer 的身份。
2. 整套恢复到记录的原绝对路径，包含外部 Pi 身份、实例配置、媒体和工作文件。原路径恢复与目录迁移是不同操作；搬移 cwd 必须使用原生路径迁移和语义验证，不能批量替换 JSONL 正文。
3. 恢复原服务入口与配置指针。启动前比对字节，启动后核对原生 ID、完整分支、书签、引用及任务状态。预约暂停状态无法确认时先隔离出站并核对队列，不直接补发未知结果。

现有维护备份可在稳定程序入口用 `node scripts/restore-managed-backup.cjs <备份ID>` 只读验证；实际恢复需在全部 writer 已停止后按该工具的显式 apply 参数操作。它保留安全快照和原生校验，不合并两个身份。跨目录整理按[离线迁移清单](STORAGE_LAYOUT.md#兼容与离线迁移)另行准备与验证。

## 7. 发布验收记录

准确归档的验收流程见[发行规程](development/RELEASING.md)，各版已验证及未覆盖范围见[平台验证](RELEASE_INSTALL_VALIDATION.md)。合成服务与浏览器仿真不代表真实服务商或目标平台验收。
