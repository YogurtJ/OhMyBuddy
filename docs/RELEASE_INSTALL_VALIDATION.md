# OhMyBuddy 平台验证范围

本页是版本验收索引。**结果只适用于对应归档**：准确 SHA256、测试明细和失败尝试见各 [Release](https://github.com/YogurtJ/OhMyBuddy/releases) 的 `ohmybuddy-<版本>.validation.json`（旧发布仍用 `pivane-` 前缀）。源码、浏览器模拟和旧版结果不能替代新包的实机验收。

## 后续版本的平台范围

后续完整包制作与发布前验收聚焦 macOS ARM64（Apple Silicon）、Windows x64 和 glibc Linux x64；暂停为新版本制作、验收和承诺更新 Linux ARM64 完整包。下方各版本的 ARM64 结果保留其历史适用范围，不自动转为后续版本的支持证明；源码兼容与实际分发范围分别记录。具体流程见[发布准备](development/RELEASING.md#后续发布平台)。

## 1.12.0：发布候选验收中

[1.12.0 说明](releases/1.12.0.md)。当前候选为 1.12.0-rc.1，Pi 升至 1.5.0，并包含官方 Playwright MCP、外部存储、任务／项目导航和费用账本 v2。已有源码专项与 macOS 本机启用结果按内容复用；核心依赖和跨模块行为的变化需要在本轮目标系统建立相应发行基线。

| 本轮目标 | Node／浏览器 | 准确包安装、正式 1.11.1 升级、正常停机与恢复 |
|---|---|---|
| macOS ARM64 | 待完成发行验证 | 待完成 |
| Windows x64 | 待完成；普通令牌与符号链接夹具权限分别记录 | 待完成 |
| glibc Linux x64 | 待完成发行验证 | 待完成 |

表中待完成项不作为通过证据。最终记录由包外附件绑定源码提交、实际归档 SHA256、本次执行、有效复用、失败及补验。候选尚未公开发布，Linux ARM64 不纳入本轮新完整包。

## 1.11.1：已正式发布

2026-10-30 已[正式发布](https://github.com/YogurtJ/OhMyBuddy/releases/tag/v1.11.1)。源码 `0808965f3d9b986bfd03118cf67b227c4a8f0f24`，源码归档 SHA256 `813e2e088dc450271b1abd5a2864f3e0efc9467f667823ff83288740a1296833`，Pi 1.4.0。四个历史原生目标的调度器专项、安装／SDK／HTTP／正常停机及升级／原路径恢复结果，见该版[验收说明](https://github.com/YogurtJ/OhMyBuddy/releases/download/v1.11.1/ohmybuddy-1.11.1.validation.md)与[验收 JSON](https://github.com/YogurtJ/OhMyBuddy/releases/download/v1.11.1/ohmybuddy-1.11.1.validation.json)。Windows 原首次失败及 native TEMP 定向补验保留，不能写为首次全绿。

该版生产依赖图保持不变，未重跑全量；完整平台安装包与源码发行分别记录，不能把旧预览包当作对应正式源码的完整包。历史 Linux ARM64 结果仍仅适用于当时归档。

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
