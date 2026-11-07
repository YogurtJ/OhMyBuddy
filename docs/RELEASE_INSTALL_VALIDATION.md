# OhMyBuddy 平台验证范围

本页是版本验收索引。**结果只适用于对应归档**：准确 SHA256、测试明细和失败尝试见各 [Release](https://github.com/YogurtJ/OhMyBuddy/releases) 的 `ohmybuddy-<版本>.validation.json`（旧发布仍用 `pivane-` 前缀）。源码、浏览器模拟和旧版结果不能替代新包的实机验收。

## 后续版本的平台范围

后续完整包制作与发布前验收聚焦 macOS ARM64（Apple Silicon）、Windows x64 和 glibc Linux x64；暂停为新版本制作、验收和承诺更新 Linux ARM64 完整包。下方各版本的 ARM64 结果保留其历史适用范围，不自动转为后续版本的支持证明；源码兼容与实际分发范围分别记录。具体流程见[发布准备](development/RELEASING.md#后续发布平台)。

## 1.12.2：候选已验证（待公开发布）

[1.12.2 说明](releases/1.12.2.md)。冻结源码 `eb22a0215d66004b04a4e9ebb6cd68a5045b78a2`，源码归档 SHA256 `55a4602eba6625ca9f53f89a66676ef0873de868ce2e1fa9f5187c7f1553ccdf`（10,261,712 字节、2,031 个清单文件）。本版在 1.12.1（`f035b44919f36fcf5d1621d67706d1a6513f74ef`）基础上合入伙伴身份术语统一、浏览器设置页改版与发现页去重、伙伴做事方式三档重构、侧聊临时附件上传与自动释放（含 Windows 无 Git Bash 环境下有工具侧聊的工具列表修正）、微信启动提示与回复恢复改进及英文界面补齐。Pi 1.5.0、生产依赖锁定图、原生组件、会话 JSONL 与 v2 费用账本结构保持不变。

macOS ARM64 和 Linux x64（UID1002）各执行 21 个受影响 Node 文件共 172 项通过；Windows Medium 首轮 149 项通过、5 项失败（3 个符号链接夹具文件因 Limited 令牌无权限报 EPERM，2 项有工具侧聊用例因 `+name` 工具修饰符保留默认 `bash` 在无 Git Bash 时退出），修正 `server/pi-side-runtime.mjs`（`eb22a02`）后三端补验 3 个侧聊文件 13/13 通过，Windows 另在 High 令牌下补验 3 个符号链接文件 21/21 通过（重叠项不相加，原失败保留）。三平台各 13 个相关 Chromium 脚本通过（页面错误 0）；语法 889、公开文档 94、生产依赖审计 0 漏洞，macOS 独立源码探针校验 269 项 HTTP 静态资源字节与正常停机通过。未重跑全量 Node 或浏览器，未受影响范围复用 1.12.1 / 1.12.0 基线。

三平台从同一冻结源码构建完整平台包（认证载荷文件数：macOS 22,112、Linux 22,116、Windows 31,793），完成清单及 SDK/RPC/原生组件探针；macOS 只读挂载 DMG 校验一致；macOS 与 Linux 新装、私有运行时 HTTP、正常停机和配置重接入通过；Windows 实际 Medium RID8192 非管理员令牌下 EXE 完成 `--prepare-only` 安装准备，不注册或启动永久系统服务。三端各从正式 1.12.1 完整包经私有回环 HTTPS 与实际发行公钥单次更新到 1.12.2（`executeCount=1`），会话／媒体、停机备份和原路径恢复（macOS 13、Linux 13、Windows 14 文件）通过，页面错误 0；Linux 与 Windows 同时验证外置图片字节保持。macOS DMG 未公证，Windows EXE 未系统代码签名；真实付费供应商/OAuth、微信、实体手机、Safari/Firefox 和其他架构不由合成验收代替。候选已完成三端验收，尚未公开发布或切换本机运行实例。

## 1.12.1：已正式发布

2026-11-04 已[正式发布](https://github.com/YogurtJ/OhMyBuddy/releases/tag/v1.12.1)并设为 Latest，八份发行附件匿名完整回下载摘要一致。冻结源码 `f035b44919f36fcf5d1621d67706d1a6513f74ef`，源码归档 SHA256 `3077f533378233c6b0909cb312037aa83ddbdc8b7e5485a3fbd327416fc21854`（2,028 个清单文件）。[验收 JSON](https://github.com/YogurtJ/OhMyBuddy/releases/download/v1.12.1/ohmybuddy-1.12.1.validation.json)、[验收说明](https://github.com/YogurtJ/OhMyBuddy/releases/download/v1.12.1/ohmybuddy-1.12.1.validation.md)及[校验和](https://github.com/YogurtJ/OhMyBuddy/releases/download/v1.12.1/SHA256SUMS-1.12.1.txt)记录准确包、原失败和复用；发布后补记不改冻结标签与归档。

macOS ARM64 和 Linux x64 各执行 13 个定向 Node 文件共 120 项通过；Windows Medium 原批次 120 项通过、1 个临时目录清理钩子 EBUSY，修正重试后对应文件在独立验证副本补验 3/3，重叠项不相加。三平台各 11 个相关 Chromium 脚本通过，服务商设置另补 320px；语法 887、公开文档 93、生产依赖审计 0 漏洞。未重跑全量 Node 或浏览器，未受影响范围复用 1.12.0 基线。

三平台准确原生包完成清单及 SDK/RPC/原生组件探针；Mac/Linux 新装、HTTP、正常停机和配置重接入通过，Windows 实际 Medium 非管理员令牌下 EXE 为 prepare-only，不注册永久服务。三端各从正式 1.12.0 经私有回环 HTTPS 和实际发行公钥单次更新到 1.12.1，会话／媒体、停机备份和原路径恢复通过，页面错误 0；Linux/Windows 另核对外置图片。Mac DMG 未公证，Windows EXE 未系统代码签名。公开安装器在 HTTPS443 完整回下载摘要一致；stable／preview 在 443 和 8443 的签名、版本、来源及 no-store 核验通过，下载页在 1440／393／320px 无页面错误或横向溢出。真实付费供应商/OAuth、微信、实体手机、Safari/Firefox 和其他架构不由合成验收代替。

## 1.12.0：已正式发布

2026-11-04 已[正式发布](https://github.com/YogurtJ/OhMyBuddy/releases/tag/v1.12.0)并设为 Latest，八份源码发行附件匿名 HTTP 完整回下载的大小与 SHA256 一致。正式冻结源码 `6aa6895b304ca4bdd189a9a9e1b9f8a7305fe971`，源码归档 SHA256 `18d11b67c41476c28c036e17fd247126aca9626422bf3d4351f71ba323951349`（10,183,458 字节、2,021 个清单文件）。[正式验收 JSON](https://github.com/YogurtJ/OhMyBuddy/releases/download/v1.12.0/ohmybuddy-1.12.0.validation.json)、[验收说明](https://github.com/YogurtJ/OhMyBuddy/releases/download/v1.12.0/ohmybuddy-1.12.0.validation.md)与[校验和](https://github.com/YogurtJ/OhMyBuddy/releases/download/v1.12.0/SHA256SUMS-1.12.0.txt)绑定准确包、原失败与复用；标签和归档不随主分支补记改变。

正式化仅改根版本、已验证夹具和说明，server/public/scripts 字节及依赖图与候选一致。三端源清单核验、Mac 正式源码包独立安装／SDK／RPC／原生组件及266项HTTP资源、三端新原生包清单与私有探针通过；载荷数 Mac22,102、Linux22,106、Windows31,783。Mac／Linux正式包新装、HTTP、正常退出与配置保持重接入通过，Windows真实EXE以实际Medium非提升令牌完成prepare-only安装准备，永久服务注册分列。

三端从准确rc.1完整包，经实际下载服务器的HTTPS及真实发行公钥单次更新到1.12.0，会话／媒体保持、停机备份和原路径恢复通过，pageerror0；Linux／Windows另核对外置图片，恢复文件数分别Mac13、Linux14、Windows14。公开DMG／EXE全量回下载摘要一致，stable／preview在443和8443均通过签名、版本、来源与no-store核验。公开下载页1440／393／320px的三目标链接、实际版本、CSP和宽度通过；旧Pivane频道及历史ARM64资产保持，新ARM64包暂停。Mac DMG未公证，Windows EXE未作系统代码签名。

syntax882、文档92、刷新生产审计0漏洞。此前formal1.11.1源包升级／停机／恢复及下述回归按未变行为复用；未机械重跑全量，原失败不抹去，真实供应商／OAuth、微信、实体手机、Safari／Firefox与其他架构不由合成服务验收代替。

### rc.1 行为基线（按范围复用）

[1.12.0 说明](releases/1.12.0.md)。**1.12.0-rc.1** 已完成三目标验证，其冻结源码 `42ec53e3433864dd35460670e8d26830af936a43`，源码归档 SHA256 `ce2965a8642cbbf28dfd478da0c023c584ce4c94496f6b9106eeea19fa0e474e`，2,021 个清单文件。候选后的验证夹具和文档修正分别记录；运行实现与原候选归档不改写。

| 本轮目标 | Node／Chromium 回归 | 准确源码包安装、正式 1.11.1 升级、正常停机与原路径恢复 |
|---|---|---|
| macOS ARM64 | 原全量基线与分组补验；144 个浏览器脚本覆盖 | 通过 |
| Windows x64 | 原全量基线与分组补验；144 个浏览器脚本使用实际 Medium RID8192、非管理员令牌；真正符号链接 Node 夹具另用 High | 通过，实际 Medium 令牌 |
| glibc Linux x64 | 原全量基线与分组补验；144 个浏览器脚本使用独立普通用户 UID1002 | 通过 |

首次 Node 全量保留 macOS 143、Windows 39、Linux 35 项失败。按命名／存储夹具、原生 Pi 工具清单、平台路径与权限、浏览器依赖等原因定位后定向修正；首次浏览器结果分别为 112/144、138/141、140/141，另两端先避开三项已知夹具问题，之后补齐。有效覆盖由基线与完成的退出码 0 补验组成，不写成重新执行一次全量全绿，也不累加重叠用例数。

完整包均绑定同一冻结源码，包含独立 Node 22.23.4、Pi 1.5.0、rg 15.2.0、fd 10.5.0，以及已审查的 pi-subagents 0.82.1／pi-hermes-memory 0.9.10。实际认证的载荷文件数为 macOS 22,102、Linux 22,106、Windows 31,783；各包通过私有 SDK／RPC、原生扩展与平台工具探针。

| 完整包目标 | 新安装 | 实际签名更新、停机备份与原路径恢复 |
|---|---|---|
| macOS ARM64 | 准确归档新装、HTTP、正常停机与重接入配置字节保持；DMG 只读挂载载荷一致 | 正式完整包 1.11.1 → 候选，执行一次，会话／媒体字节保持，恢复与正常停机通过，页面错误 0 |
| glibc Linux x64 | 准确归档新装、HTTP、正常停机与重接入配置字节保持 | 正式完整包 1.11.1 → 候选，执行一次，会话／媒体／图片保持，恢复与正常停机通过，页面错误 0 |
| Windows x64 | 准确 asInvoker EXE 在实际 Medium 令牌下完成解包、载荷安装、私有 SDK 探针及外部配置；prepare-only 不注册系统服务 | 已发布完整包 1.11.1-rc.2 → 候选，实际 Medium 令牌、执行一次，会话／媒体／图片保持，恢复与正常停机通过，页面错误 0 |

签名更新使用仅监听回环的私有 HTTPS 验收源，保留实际发行校验公钥，未切换公开频道或当前用户实例。冻结后独立夹具补验保留原脚本失败和原／修正 SHA256。macOS DMG 未公证，Windows EXE 未作系统代码签名；这与分发清单的 Ed25519 校验分别记录。

候选归档、安装器及最终校验和作为包外验收附件交付；候选尚未公开发布，Linux ARM64 不纳入本轮新完整包。真实付费模型／供应商 OAuth、微信投递、实体手机、Safari／Firefox、其他架构和网络文件系统不由本轮合成服务验收代替。

## 1.11.1：已正式发布

2026-10-30 已[正式发布](https://github.com/YogurtJ/OhMyBuddy/releases/tag/v1.11.1)并确认为 Latest，九份源码发行附件匿名 HTTP 200 回下载的大小与 SHA256 一致。冻结源码 `0808965f3d9b986bfd03118cf67b227c4a8f0f24`，源码归档 SHA256 `813e2e088dc450271b1abd5a2864f3e0efc9467f667823ff83288740a1296833`（9,888,479 字节、1,981 个清单文件）。[验收 JSON](https://github.com/YogurtJ/OhMyBuddy/releases/download/v1.11.1/ohmybuddy-1.11.1.validation.json)、[验收说明](https://github.com/YogurtJ/OhMyBuddy/releases/download/v1.11.1/ohmybuddy-1.11.1.validation.md)与[版本说明](releases/1.11.1.md)记录执行、复用、失败与范围；主分支补写发布结果，标签与归档保持冻结。

四个目标均使用独立 Node 22.23.4 对准确归档锁定安装，完成 SDK／RPC、相关 Node、263 项 HTTP 资源与正常停机、对应操作系统的原生文件身份检查。清单文件测试前后逐字节一致。

| 原生目标 | 11 个相关 Node 文件／75 项唯一场景 | 正式 1.11.0 调度库升级与原路径字节恢复 |
|---|---|---|
| Linux ARM64 | 首轮 75/75，无跳过 | 通过 |
| Linux x64 | 首轮 75/75，无跳过 | 通过 |
| macOS Apple Silicon | 首轮 75/75，无跳过 | 通过 |
| Windows11 x64，实际 Medium RID8192、非管理员 | 原 74/75；深 TEMP 导致一项 ENAMETOOLONG，原生 TEMP 下仅该文件补验 1/1，源文件和断言不变 | 通过；探针初次被 Git whoami 遮蔽，在建库前退出，固定 System32 命令后完成 |

旧调度库专项保留任务、主页、未知元数据与预算，回收残留的存活 PID owner；中断执行仍为 uncertain、不重放。恢复原始数据库字节后用旧 Store 重新打开。Windows 原失败与定向完成分别记录，不重写为首轮全绿。

Chromium 对头像／话题整理完成中英文、1440／393 两种宽度的八张快照，核对全部英文状态、pageerror 与页面宽度。既有工作台／应用更新及相关伙伴／类别浏览器结果按相同代码复用。语法 846 文件、公开文档 89 份及主生产／Mermaid 构建图审计（均退出 0、零漏洞）通过；没有重跑全量 Node 或全量浏览器。

Pi 1.4.0 和生产锁定依赖图不变；22 项安装／应用解包／备份恢复／RPC／会话图片及原生契约与正式 1.11.0 字节相同，未受影响的完整会话／图片／媒体升级和原路径恢复按该正式附件链复用。源码 launcher 保持原环境分支，新增 PATH 分支只作用于自带运行环境的完整包。不能把复用写成本包再次执行完整基线。

本次 GitHub 发布为源码发行。完整安装包仍按独立预览渠道、准确源码与构建回执记录，既有 1.11.1-rc.2 未重建为本次最终源码。真实用户迁移／重启、付费模型媒体、真实微信、实体手机、Safari／Firefox、其他架构和网络文件系统不在本次声明范围。

## 1.11.0：已正式发布

2026-10-29 已[正式发布](https://github.com/YogurtJ/OhMyBuddy/releases/tag/v1.11.0)并确认为 Latest，九份附件匿名 HTTP 200 回下载逐字节一致。冻结源码 `9d3755b9479ee9aec6eda5b4562c9e5335831db6`，源码归档 SHA256 `453ae4039ecf4607054514e64daafbc4c280854d25e92831118b334998b07e8c`（9,836,329 字节、1,961 个清单文件）。[验收 JSON](https://github.com/YogurtJ/OhMyBuddy/releases/download/v1.11.0/ohmybuddy-1.11.0.validation.json)与[验收说明](https://github.com/YogurtJ/OhMyBuddy/releases/download/v1.11.0/ohmybuddy-1.11.0.validation.md)记录本轮执行、基线复用、原失败及限制。最终包另完成本机独立安装与部署后验，252 个 HTTP 静态资源字节一致。

[1.11.0说明](releases/1.11.0.md)。Pivane更名为OhMyBuddy，版本号延续。三平台实机补验绑定改名执行候选`791b3d2b69f3b34974d05855eb793d1d8e4f002a`、归档`039681f5ce460ec9a76a870b21bf5cfe068f3e5d1e93cf638d79f9ad0a9a3d58`（1,961个文件）。最后仅更新CHANGELOG、文档索引、本页和版本说明；发行清单中的其余1,957个发行文件、依赖、测试及原生组件与该执行候选逐字节一致。最终交付包的实际SHA256及差异清单在包外验收附件绑定，公开状态以Release列表为准。

| 平台（独立Node22.23.3） | 改名与服务定向Node | 浏览器回归与组合覆盖 | 正式1.10.2升级／正常停机／原路径恢复 |
|---|---|---|---|
| Linux ARM64／Debian13.2／Chromium142.0.7444.175 | 包内7文件52通过；工作区41受影响文件324通过 | 工作区23个改名相关浏览器脚本通过；其余复用基线40条路径 | 独立锁定安装、正式1.10.2升级、正常停机、20文件逐字节恢复与文件查看器通过 |
| Apple M2／macOS26.5.1／Chrome156.0.8078.48 | 包内7文件52通过 | 安装／升级／恢复／文件查看器4阶段桌面与手机通过；其余复用基线40条路径 | 独立锁定安装、正式1.10.2升级、正常停机、20文件逐字节恢复通过；另完成OhMyBuddy合成HTTPS完整平台包更新／12文件恢复试验 |
| Windows11 x64 build26200／Edge156.0.4314.50 | 真实Limited，包内7文件52通过 | 安装／升级／恢复／文件查看器4阶段桌面与手机通过；其余复用基线40条路径 | 真实Limited独立锁定安装、正式1.10.2升级、正常停机、20文件逐字节恢复通过 |

本轮验收在改名前三平台候选`1ff1f47525943b53474468904d4c76b06f056234`（归档`da78a25c930c4720758088c3b6aab843b6c67f9958328d805670f3239cd4feda`）的基础上按[影响范围与证据复用](development/RELEASING.md#验证范围与证据复用)补验。改名与导航文案更新未改变Pi 1.4.0依赖图、原生C组件或RPC协议；未受影响的75文件Node与40条浏览器路径基线（以及Windows候选3的单独High令牌符号链接夹具70通过／27平台跳过、Linux `/proc`、M2 `F_GETPATH` 和 Windows `HANDLE`／DACL原生证明）按相同依赖与环境复用，不把重叠case相加，也不把原失败改写为首次全绿。

改名涉及网页／图标／文档、导航“伙伴／工作台”文案、`YogurtJ/OhMyBuddy`同源API跳转跟随、Linux拉丁字体回退、新包与服务名称、环境别名、新旧存储选择及安装元数据。三平台均在各自独立环境对准确改名归档`039681f5ce460ec9a76a870b21bf5cfe068f3e5d1e93cf638d79f9ad0a9a3d58`执行全新锁定安装、7个改名／升级／应用更新／服务安装／更新检查／微信／中英文测试文件（52/52通过）、语法与87份公开文档检查、生产依赖审计（0漏洞）、干净运行、从正式`pivane-1.10.2`归档升级、正常停机、停机备份后20文件原路径逐字节恢复（重新打开Pi前核对哈希）及恢复后搜索／媒体／文件查看器验证；测试后1,961个清单文件字节未变。普通Windows令牌由运行进程实测为RID8192、`TokenIsElevated=false`、Administrators禁用且deny-only。历史原生标记、浏览器偏好、私有桥接和旧数据位置保持兼容，新旧位置冲突失败关闭，详见[命名与升级](development/NAMING.md)。

M2另用改名代码构建两份明确的OhMyBuddy合成完整平台包（`1.11.0-m2omb.0`与`1.11.0-m2omb.1`，含`OHMYBUDDY_BUNDLE.json`与`ohmybuddyBundle`），经过真实回环HTTPS下载、签名／来源／哈希校验、一次浏览器提交、`.ohmybuddy-runtime`停机备份、12文件恢复与正常停机；当前版本卡与截图确认`OhMyBuddy`及`1.11.0-m2omb.1`。前两次包装脚本输入错误（缺`marked`及ripgrep哈希替换笔误）均在构建前退出并原样保留记录。旧Mac更新器仍需显式Pivane格式过渡包和安全重启原服务。该试验不代表公开DMG、Developer ID签名、公证、Finder首次打开或LaunchAgent安装已验收。

桌面和手机视口、pageerror、宽度、抽屉、附件、工具及媒体断言均无错误；验收服务每平台仅7次合成Provider请求，零付费模型或真实微信调用。Chromium视口不代表Safari或实体手机验收。成功临时树、测试私钥和Windows一次性计划任务已按所有权核对清理，原失败与补验资料保留。源码完成、现有实例部署及公开发布分别记录。

## 1.10.2

[1.10.2说明](releases/1.10.2.md) · [Release](https://github.com/YogurtJ/pivane/releases/tag/v1.10.2) · [验收JSON](https://github.com/YogurtJ/pivane/releases/download/v1.10.2/pivane-1.10.2.validation.json) · [验收说明](https://github.com/YogurtJ/pivane/releases/download/v1.10.2/pivane-1.10.2.validation.md)。2026-10-24正式发布并确认为Latest，九份公开附件匿名HTTP200回下载逐字节一致。冻结源码`9aa4647dec9890f35311763912f88707b658629f`，归档SHA256`ad9691b616795978a9eaf2d0870edfdb80e86a730a8083d5825c8ede52235ab2`，1730个清单文件。

Linux ARM64（Node22.23.3/Chromium142）、macOS ARM64（Node22.23.1/Chrome156）和Windows11 x64（Node22.23.3/Edge155）均从准确包独立锁定安装，各16项相关Node、一个中英文四视口翻译脚本（8场景）、微信组件完整安装与私有回执重载、原生SDK/RPC、HTTP启动和正常停机通过；安装前后清单字节一致。Windows实际Limited令牌RID8192；首次浏览器因隔离夹具的系统目录环境而在页面打开前失败，原退出1保留。最小启动对照后仅恢复USERPROFILE/APPDATA/LOCALAPPDATA，Pi身份和数据仍隔离，用原脚本、原断言和原300秒期限补齐浏览器及HTTP，组合完成不冒称首次全绿。

主生产图和Mermaid构建图审计均刷新为退出0、零漏洞。依赖图、原生组件及更新/备份/恢复算法与1.10.1相同，未受影响的业务和升级/原路径恢复证据按[复用规则](development/RELEASING.md#验证范围与证据复用)引用其公开附件链；未重跑三平台全量，不把复用计为本包再次执行。微信安装使用锁定官方归档的离线字节，不发业务消息或付费请求。

## 1.10.1

[1.10.1 说明](releases/1.10.1.md) · [Release](https://github.com/YogurtJ/pivane/releases/tag/v1.10.1) · [验收JSON](https://github.com/YogurtJ/pivane/releases/download/v1.10.1/pivane-1.10.1.validation.json) · [主图审计](https://github.com/YogurtJ/pivane/releases/download/v1.10.1/pivane-1.10.1.audit.json) · [构建图审计](https://github.com/YogurtJ/pivane/releases/download/v1.10.1/pivane-1.10.1.mermaid-build.audit.json)。2026-10-24正式发布并确认为Latest，九份附件公开匿名下载均HTTP200，尺寸和SHA256与上传原件一致。冻结源码`7eb6c85fe094e12d2c23a844681746dbc2aebd34`，归档SHA256`68a79005b38074ea05440ed48e45b85a6843ad85e39e375fd8a3623be68d39df`，1728个清单文件。最终包在Linux ARM64独立安装、SDK、12项Node及5个Chromium脚本、HTTP版本与正常停机完成；主生产图和隔离浏览器构建图审计均真实退出0、clean=true、total=0。桌面/手机图表已回看，所有清单文件安装前后不变。标签与归档冻结不因主分支补写发布记录改变。

前一未公开归档A5已在三平台完成独立锁定安装、原生/SDK、JSON/gzip/SSE/完整性校验、HTTP版本及正常停机；Linux隔离记忆安装和FTS、5文件19项Node及7项安装守卫通过。Mac平台4文件58项为57pass/1个Windows专用skip；Windows经settings文件30项补验，与另外3文件合成58项覆盖，导航原失败和抽屉就绪补验分别保留，普通令牌RID8192、administrator=false、tokenIsElevated=false。未变的业务、原生与安装边界按[影响范围与证据复用](development/RELEASING.md#验证范围与证据复用)复用，不重跑全量。

本轮主锁仅将DOMPurify更新至3.4.17；Mermaid11.17.2官方模块在独立锁中使用DOMPurify3.4.17、KaTeX0.18.7及esbuild0.28.2重新打包。两个构建字节一致，来源与方法见[Mermaid](MERMAID.md)。本轮5脚本覆盖Markdown、数学、图表、文件及SVG/HTML成果预览；Chromium首次在长TMP下启动即SIGTRAP、未进入页面，最小对照仅缩短TMP后可启动，随后5脚本通过。续验脚本在浏览器及服务通过后、审计启动前发生局部变量错误，独立补审计退出0；两次控制器原退出1保留，完成覆盖按真实子项合成，未重跑已通过安装/Node，也不冒称单次首次全绿。前一DOMPurify延期状态和原始非零记录属于此前未公开候选。

## 1.10.0

[1.10.0 说明](releases/1.10.0.md) · [Release](https://github.com/YogurtJ/pivane/releases/tag/v1.10.0) · [验收JSON](https://github.com/YogurtJ/pivane/releases/download/v1.10.0/pivane-1.10.0.validation.json) · [验收说明](https://github.com/YogurtJ/pivane/releases/download/v1.10.0/pivane-1.10.0.validation.md) · [审计记录](https://github.com/YogurtJ/pivane/releases/download/v1.10.0/pivane-1.10.0.audit.json)。2026-10-24正式发布，九份附件公开无鉴权回下载逐字节一致。准确包SHA256：`0717a9a82b382b19f5f1abea30e2123095bcf293cac7d0e42d4d5117893fbd22`，源码`d1ebe81fd790d73a1e22bf1cfbc9b54dea2d41e0`，1703文件。冻结标签和归档不因补写记录改变。

| 平台 | Node（206文件） | 自动浏览器与补验 | 安装、正式1.9.1升级、正常停机与恢复 |
|---|---|---|---|
| Linux ARM64 | 1212通过、1项Windows专属跳过 | 原116/116 | 通过；原生语义及manual通过 |
| macOS ARM64 | 1184通过、29项平台跳过 | 原115/116；交付预览以指针就绪夹具补验12个目标场景和原8个语言/视口场景通过 | 准确包核心检查及manual通过；原生语义复用同实现/依赖/环境的候选6证明 |
| Windows x64 | 1185通过、28项Linux专属跳过 | 原116/116 | 通过；原生语义及manual通过；普通令牌RID8192、非管理员、未提升阶段实际exit0 |

Mac原点击超时和实际exit1保留，修正只在隔离验证副本等待按钮实际进入`:hover`后再单次点击，保留全部隔离/网络/脚本断言。归档、夹具SHA、原始失败及补验证据分别绑定；不把原全量改写成116/116。原生恢复复用经过1703文件集合比对，候选6与7只差Shell测试，运行代码、依赖、原生组件、恢复脚本和平台环境一致。各平台相关进程关闭已核对。

生产审计依维护者决定保留DOMPurify3.4.16及三条已知公告（含critical），`clean=false`、audit exit1不变；不是零漏洞发布。执行范围及有效复用按[发布流程](development/RELEASING.md#验证范围与证据复用)，完整结果放在包外验证附件中。

## 历史正式版 1.9.1

[1.9.1说明](releases/1.9.1.md) · [Release](https://github.com/YogurtJ/pivane/releases/tag/v1.9.1) · [验收JSON](https://github.com/YogurtJ/pivane/releases/download/v1.9.1/pivane-1.9.1.validation.json) · [验收说明](https://github.com/YogurtJ/pivane/releases/download/v1.9.1/pivane-1.9.1.validation.md)

2026-10-22正式发布，准确归档SHA256：`8a166561cb89947dbd2032a03360709b08b862d76aaaccb363b26b8becf08d9c`，冻结源码：`f0c9d5d5149d5cf2e0972234884788da6acf00a4`。六附件公开无鉴权回下载逐字节一致，标签和包未改写。

| 实机 | Node | 浏览器（115个脚本） | 安装／正式1.9.0升级／原路径恢复 |
|---|---|---|---|
| Linux arm64 / Node22.23.3 / Chromium142.0.7444.175 | 1105通过、1项Windows专属跳过 | 首次114/115；失败脚本查明为上游更新提醒遮挡，修复测试夹具后完整通过 | 通过 |
| Apple M1 / macOS15.5 / Node22.23.1 / Chrome155.0.8059.85 | 1077通过、29项平台跳过 | 首次115/115 | 通过 |
| Windows11 x64 / Node22.23.2 / Chrome155.0.8059.85 | 1078通过、28项Linux专属跳过 | 首次115/115 | 通过；另在真实普通权限完成安装、运行与会话导入 |

所有平台在独立锁定安装后核对2330发行文件、准确归档、lock及实际依赖；语法、文档和平台打包通过。每台均从正式1.9.0升级并原路径恢复20文件，另用真实新旧SDK验证双分支、书签、会话ID和二进制附件的4文件恢复。首次生产audit遇npm服务端故障（Linux 503/400、macOS 503/520、Windows 400），服务恢复后在准确包安装目录内刷新审计均为零漏洞。Linux浏览器失败的原样复跑仍在同一位置失败，修复只改测试夹具，断言、视口矩阵和时限未改。原始失败、补验和观察器采集限制见验收附件。

## 历史正式版 1.9.0

[1.9.0说明](releases/1.9.0.md) · [Release](https://github.com/YogurtJ/pivane/releases/tag/v1.9.0) · [验收JSON](https://github.com/YogurtJ/pivane/releases/download/v1.9.0/pivane-1.9.0.validation.json) · [验收说明](https://github.com/YogurtJ/pivane/releases/download/v1.9.0/pivane-1.9.0.validation.md)

2026-10-21正式发布，准确归档SHA256：`44e27335b84e7a542c60b7bff69eba814921b63a947ef416fbcd36f1b114f620`，冻结源码：`5b9e93c937d2f90afdc7e8e2671c3f612843d9a1`。六附件公开无鉴权回下载逐字节一致，标签和包未改写。

| 实机 | Node首次与专项 | 浏览器首次与最终覆盖 | 安装／正式1.8升级／原路径恢复 |
|---|---|---|---|
| Linux arm64 / Node22.23.3 / Chromium142.0.7444.175 | 1088/1088；Node24.13.1另1088/1088 | 首次114/114 | 17/17 |
| Apple M1 / macOS15.5 / Node22.23.1 / Chrome155.0.8059.85 | 1060通过、28平台跳过 | 首次110/114，4个脚本有界完成，最终覆盖114 | 17/17 |
| Windows11 x64 / Node22.23.2 / Chrome155.0.8059.85 | 原1057通过、3失败、28跳过；3项完整路径专项补齐 | 首次111/114，3个脚本12场景有界完成，最终覆盖114 | 17/17组合 |

所有平台在独立锁定安装后核对2314发行文件、准确归档、lock及实际依赖，前后字节不变；语法、文档、生产audit和平台打包通过，2026-10-21刷新生产audit仍零漏洞。Playwright1.58.2、平台原生Chrome/Chromium、回退字体和DPR保留，阻止可选Google Fonts。Linux locale为已安装的en_GB.UTF-8。28项跳过包括26个显式Linux描述符删除边界及2个Linux-only保留/清理用例，不把跳过计作通过。

Windows两个临时路径用例按原源码和原断言在native TEMP环境完成；版本包完整场景只在包外把两处POSIX路径字面量改为原生相对路径构造，保留全部断言、操作和期限。原全量Node/接受任务退出1保留；13项续接检查与已完成安装/Node专项/普通token核心组成17项，不宣称原全量一次退出0。

浏览器首次非零退出、原错误和补验分别保存。扩展清单尚在加载、独立记忆fixture绕过生产关闭guard而未等待变更结算、知识合并尚在busy时即跨视图检查，均由实际失败状态归因，再加入就绪或结算前提；Mac启动页5/4另由加载Back按钮被误认作Retry导致，经受控正负时序验证。原断言和期限不变，已通过的独立场景不重跑；最终114是原始运行与有界完成合成的原场景覆盖，不称两平台首次全绿。Windows首次完整浏览器原作业及外层退出恢复收取，观察中断未触发重启或重放。

每台17项检查按原路径恢复20文件；真实1.8 SDK另创建双分支、书签、会话ID和二进制附件，1.9只读打开，变更后4文件原路径恢复并由新旧SDK核对语义。Windows完整文件系统/浏览器使用提升权限；真实Limited token另证明独立安装、1440/393 onboarding、SDK/RPC/runtime及正常退出，不能称普通token完整114。所有模型/媒体请求使用合成服务，零付费产品请求。Chromium手机视口不证明真实手机键盘/麦克风/后台行为；Safari、Firefox、IntelMac、WindowsARM64及真实用户供应商/GPU未验收。

## 历史正式版 1.8.0

[1.8.0 说明](releases/1.8.0.md) · [验收附件](https://github.com/YogurtJ/pivane/releases/download/v1.8.0/pivane-1.8.0.validation.json)

准确归档 SHA256：`23c0f5ff5a68a14213bd399e493aaac493494af851f8e2e59ce7c23cd3f57394`，冻结提交：`1e8d1bc5e299061fe7b8665f193c9ef47cbf5418`。

| 实机 | Node | 完整浏览器 | 安装／正式1.7升级／原路径恢复 |
|---|---|---|---|
| Linux arm64 / Node22.23.3 / Chromium142 | 900通过 | 101/101 | 17/17 |
| Apple M1 / macOS15.5 / Node22.23.1 / Chrome155 | 872通过、28平台跳过 | 101/101 | 17/17 |
| Windows11 x64 / Node22.23.2 / Chrome155 | 872通过、28平台跳过 | 实际普通token101/101 | 17/17 |

三台均零失败、实际退出0，独立锁定安装后核对2253发行文件与七个Pi1.2.0实际包版本，测试后不变；语法、文档及生产依赖audit通过，发布前刷新audit仍零漏洞。Playwright1.58.2、原DPR/Retina和每文件300秒上限保留，截图按CSS像素导出。28项只涉及Linux目录描述符删除边界，macOS/Windows仍执行保留与共同生命周期断言。

Windows17项原生文件系统／安装夹具使用提升权限隔离环境；另以真实Interactive+Limited token独立通过普通安装、onboarding、RPC、完整101和服务退出0，安装／运行administrator均false。每台17项恢复20文件；原生SessionManager另在正式1.7创建完整分支、书签、ID和附件引用，以1.8只读验证并恢复4文件原路径后由新旧SDK重新打开。每台7次loopback请求，Windows普通流程另3次，零真实凭据和付费请求。三平台1440／393恢复截图已复核。

前候选及失败尝试按独立哈希保留，不替代此包；B5一次手机搜索超时首因尚未锁定，文字选择退出的原socket／阶段没有捕获，本包首次完整运行均通过原用例。准确包、历史结果及范围见附件。公开发行没有切换维护者或用户实例，也不证明真实供应商账户或GPU环境已验收。

## 历史正式版 1.7.0

[1.7.0 说明](releases/1.7.0.md) · [验收附件](https://github.com/YogurtJ/pivane/releases/download/v1.7.0/pivane-1.7.0.validation.json)

准确归档 SHA256：`351b0085699334828635121eab9f161ba7cf2841eb245ad28e164c6956d50b2a`，源码提交：`98cadc6e9fb3c98f142fa7f19bc7227b4443170d`。2026-10-11 公开发布，六项附件重新下载后与冻结文件逐字节一致；标签与归档保持不变，主分支补记发布结果。

Linux ARM64 / Node 22.23.2、Apple Silicon macOS / Node 22.23.1 与 Windows 11 x64 / Node 22.23.2，各完成719项 Node 测试（零失败、取消或跳过）、550文件语法、76份文档检查、生产 audit 零漏洞、17项安装升级恢复检查、从正式1.6.2升级与20文件原路径恢复。每台核对2115个包文件，测试后不变；真实 HTTP、三项手动专项及正常停机通过，每台7次合成 Provider 请求、零付费请求。

每平台覆盖94个唯一自动浏览器脚本。原全量均为93通过／1失败，原结果保留，最终覆盖由同一归档的针对性补验完成：Linux 布局夹具使用原宽度选择参数分组完成全部28个场景，每组保留300秒原期限；Windows 预约夹具在原目标选择前等待工作目录异步刷新完成；macOS 菜单夹具等待初始字体、页眉及视口布局稳定，Shell 专项等待第二设备取消完成后执行原排除断言。原断言、输入及驱动期限保留，包外执行文本与原文件分别绑定 SHA；macOS 早期补验和手动失败也保留，不能把原全量记为94／94零失败。

Chromium 桌面和手机宽度检查不代表 Safari、真实手机键盘或麦克风验收；Windows 全套使用提升权限 SSH 用户。未验证真实付费模型／媒体与用户 GPU。本次公开发行未重启或切换运行实例，未迁移用户数据；并行开发保留在共享工作区，发行从隔离源码完成。

## 历史正式版 1.6.2

[1.6.2 说明](releases/1.6.2.md) · [验收附件](https://github.com/YogurtJ/pivane/releases/download/v1.6.2/pivane-1.6.2.validation.json)

准确归档 SHA256：`dd992f00b4a362a4d03df22d9ba55324905d4f62ec55d49236f7812b773cb81c`，源码提交：`9fc875adc74b3937a7076e4d3ba86c24142f8340`。

Linux ARM64 / Node 22.23.2、原生 Windows 11 x64 / Node 22.23.2、Apple Silicon macOS 15.5 / Node 22.23.1，均完成准确归档的独立锁定安装、各 661 项 Node 测试（零失败／跳过）、518 文件语法、74 份文档检查、生产 audit 零漏洞、本机打包、从正式 1.6.1 升级和 20 文件原路径逐字节恢复。每台机器核对全部 2,080 个包内文件，测试后不变；每台 7 次本地合成 Provider 请求、零付费请求。

办公上传、全屏交付物、工作台、输入控制、聊天媒体卡片、媒体接入／实验室，以及干净安装／旧包／更新／恢复／文件查看的 Chromium 桌面和手机宽度回归通过。Linux 使用 Chromium 142.0.7444.175 / Playwright 1.62.1，Windows 与 Mac 使用 Chrome 154.0.8037.98 / Playwright 1.58.2。Windows 完整验收使用提升权限 SSH 用户，不宣称新普通权限安装已通过。首轮夹具失败及修正、准确环境和明细均保留在验收附件；浏览器模拟不代表 Safari 或真实手机。本次发布未切换运行实例或迁移用户数据。

## 历史正式版 1.6.1

[1.6.1 说明](releases/1.6.1.md) · [验收附件](https://github.com/YogurtJ/pivane/releases/download/v1.6.1/pivane-1.6.1.validation.json)

Linux ARM64 / Node 22.23.2 完成准确归档的独立安装、635 项 Node 测试、语法／文档检查、生产依赖审计、从 1.6.0 升级和 19 文件原路径恢复。5 个相关 Chromium 专项及安装／升级／恢复／文件预览检查通过；18 个既有专项仅在生产文件与浏览器用例字节一致后复用。2,060 个包内文件逐项核对，7 次合成请求、0 付费请求。未新增其他平台实机验收。

## 历史正式版 1.6.0

[1.6.0 说明](releases/1.6.0.md) · [验收附件](https://github.com/YogurtJ/pivane/releases/download/v1.6.0/pivane-1.6.0.validation.json)

Linux ARM64 与原生 Windows 11 x64 / Node 22.23.2 完成安装、运行、恢复和浏览器检查。Linux 验证从正式 1.5.0 升级；Windows 验证干净安装及同版更新恢复，普通权限核心运行另行通过，完整测试因符号链接 fixture 使用提升权限。

## 历史正式版 1.5.0

[1.5.0 说明](releases/1.5.0.md)：Linux ARM64 / Node 22.23.2，准确归档安装、从 1.4.0 升级、原路径恢复及 Chromium 检查。

## 历史正式版 1.4.0

[1.4.0 说明](releases/1.4.0.md)：Linux ARM64 / Node 22.23.2，准确归档安装、从 1.3.0 升级、原路径恢复及 Chromium 检查；旧 MCP 迁移须显式执行。

## 历史正式版 1.3.0

[1.3.0 说明](releases/1.3.0.md)：Linux ARM64 / Node 22.23.2，准确归档安装、从 1.2.0 升级、旧版网页更新器安装、原路径恢复及 Chromium 检查。

## 历史正式版 1.2.0

[1.2.0 说明](releases/1.2.0.md)：Linux ARM64 / Node 22.23.2，安装、从 1.1.0 升级、旧版网页更新器安装及原路径恢复。全量 Node 在冻结源码执行，准确归档补验安装恢复与相关浏览器场景，其余按文件一致复用。此前内置组件的 Mac／Windows 候选检查不等同于本包整体验收。

## 历史正式版 1.1.0

[1.1.0 说明](releases/1.1.0.md)：Linux ARM64 / Node 22.23.2，准确归档安装、从 1.0.0 升级、原路径恢复及 Chromium 检查。

## 历史正式版 1.0.0

[1.0.0 说明](releases/1.0.0.md)：Linux ARM64 / Node 22.x，准确归档安装、RC4 升级、原路径恢复及浏览器检查。

## 历史 RC4

[RC4 说明](https://github.com/YogurtJ/pivane/blob/v1.0.0-rc.4/docs/releases/1.0.0-rc.4.md)：以最终归档的 validation 附件为准，中间候选失败和更早 RC 的通过结果不能互相替代。

## 已验证基线

2026-09-11 的 Pi 0.85.0 基线涵盖 Linux（ARM64、x86_64）、Apple Silicon M2 macOS 和 Windows 11 x64：安装、聊天、文件／搜索／用量、更新与原路径恢复。此记录只证明当时的实现，不能表示当前版本已在这些平台重新验收。

## 尚未验收

- 当前包未明确列出的原生系统和架构，包括 Intel Mac、Windows ARM64、网络文件系统。
- Safari、真实手机的软键盘、麦克风、后台通知及系统剪贴板行为；Chromium 手机宽度模拟不等同实机。
- 所有真实模型／媒体供应商、付费服务与用户自有 GPU 环境。
- 通用跨路径完整会话树迁移；现有恢复按原路径执行，分支导入另建线程。

安装步骤见[安装与恢复](INSTALL_RECOVERY.md)、[macOS](MACOS.md)、[Windows](WINDOWS.md)；维护者验收方法见[发布流程](development/RELEASING.md)。
