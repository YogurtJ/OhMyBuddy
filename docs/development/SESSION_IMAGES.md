# 原生会话图片存储

OhMyBuddy 保留 Pi SessionManager 的会话树、条目 ID、时间、分支、书签和上下文编辑语义。图片字节由原生条目中的引用指向身份目录内的不可变对象。没有第二套聊天正文或模型历史。

## 数据与请求

`server/pi-session-images.js` 将标准图片 content block 保存为二进制对象，目录为 `<agentDir>/ohmybuddy-session-images/<sha256>`。文件使用私有权限，写入、fsync 后独占发布；同身份下相同字节去重。对象存储不可用时，持久化保留内联图片，不能因节省空间丢失消息。读回核验已打开文件的身份、内核路径、大小和 SHA256。非规范编码保持内联，继续由原来的图片校验处理。

JSONL 使用 A2：普通 `text` block 加 `pivaneImage` 结构字段，包含 version、sha256、bytes 和原 image block 的非 data 字段。只有结构化引用会还原，普通文字中的引用样式不触发读取。模型请求出口在副本上还原图片，再执行既有模型兼容与缩放；不按图片年龄或数量主动删除历史图片。没有图片能力的模型继续得到原来的省略提示。缺失或损坏的必需图片阻止视觉请求，不能静默退化成文字。

持久主会话、Bot 和子会话通过公开 `message_end` 扩展保存图片；直接发送的 custom message 通过公开 SDK 方法包装覆盖。侧聊可以读取继承的引用，其自身内存消息不落入原生 JSONL。工具的内部嵌套返回值不提前改成引用，保证 codemode 等调用者仍收到原始工具协议。

A2 在未安装 OhMyBuddy 适配的原版 Pi 中显示为文字占位。受管 SDK 使用 `pi-session-image-context.js` 的公开 SessionManager facade：上下文和分支读取返回带引用的轻量 image block，使 Pi 的 token 粗估、压缩切点与摘要序列化继续遵循图片语义；原生 getEntries、完整树、分叉写入仍绑定同一个实际 manager。持久化入口将运行时图片投影恢复为 A2，不能把空 data 投影写入原生文件。Bot 自有维护预算也识别引用为图片，并保留含图片的工具结果。OhMyBuddy 的 JSONL/HTML 导出会把图片还原成内联数据，适用于原版 Pi 和跨实例传输，既有导出大小限额仍有效。导入外置引用但缺少图片字节的裸 JSONL 会被拒绝。

## 展示与其他消费者

网页快照将内联图片和外置引用统一投影成会话限定的图片 URL，正文仅在可见区域加载图片，折叠工具不下载图片。URL 需要工作台鉴权及实际原生会话的持有证明，哈希本身不授予权限。编辑、分叉草稿、媒体 `chat-image:N` 及侧聊在各自的边界解析引用；分叉和同身份下跨项目移动共享不可变对象。历史目录和压缩前回看按图片计数，不把占位说明当成用户原文。

## 索引与预算

档案索引逐行扫描原生文件，单文件原始读取上限 256 MiB、单条记录 32 MiB、最多 200000 条。去掉图片 data 与 thinkingSignature 的派生视图仍受 8 MiB 上限；不修改原始签名和正文。指纹始终针对完整原始字节，读前读后核验文件身份。索引查询复核受 5000 行、64 MiB 派生内容及 2 GiB 原始读取总预算限制。超出预算仍报告不完整；不是无限制历史承诺。

## 历史迁移与恢复

`server/pi-session-image-migration.js` 提供 inventory、migrate 和 rollback；调用方必须提供明确授权清单、独立维护控制器的停机/无 writer 检查和专用回执目录。不能对正在运行的会话执行迁移。

1. 清单绑定真实 session header ID、规范路径、原文件字节数和 SHA256，扫描不输出正文。
2. 所有目标先复核；受旧跨项目移动或分叉字节前缀证明保护的文件明确拒绝，不能改写或跳过证明。
3. 原文件逐字节备份。只改含图片的原生 content 字段，其余原始行逐字节复制。
4. 每条变更还原后与原条目深比较；通过内存 SessionManager 核对完整条目与每个分支叶子的有效上下文。
5. 先写 prepared 回执，再原子替换，随后写 committed 回执。中断不能自动重放。
6. 回退要求无 writer，且当前文件仍等于迁移后的哈希；若已有新消息则拒绝回退，防止覆盖用户工作。

身份目录备份自动包含图片对象。删除会话不删除图片对象，本版不自动回收图片；未引用对象可暂时留存。恢复和原路径备份必须一起保留 JSONL 与对象目录。历史迁移原件另存于明确的维护备份目录，未获删除授权不能清理；保留恢复点期间的磁盘占用不会立即减少。

相关验证：`test/pi-session-images.test.js`、`test/pi-image-runtime.test.js`、`test/pi-profile-memory-scope.test.js`、`test/pi-session-transfer.test.js`、`test/browser/pi-session-images.cjs`。
