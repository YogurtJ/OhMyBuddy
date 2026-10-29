# 助手档案与会话身份

`pi-profile-state.js` 的 `readProfileBinding(manager)` 读取原生 custom entries，只接受唯一且匹配当前原生会话 ID 的档案标记。树导航不改变会话身份；复制的旧 ID 标记不生效，冲突或无效标记使档案能力保持未启用。档案是数据归属规则，不是阻止任意本地代码访问文件的操作系统沙箱。

`pi-profile-registry.js` 拥有档案、兼容项目默认值及修订。名称、头像引用、SOUL、记忆字符上限和技能设置保存在同一私有注册表；图片内容单独保存。回收站使用成对的 `trashedAt`／`trashedEnabled` 并强制 `enabled:false`，移入／恢复沿用相同预占及原子注册表 CAS，移入同时清除关联默认值，保留身份数据和所有原生会话。读写复用 no-follow 描述符、内核路径、完整身份和前后状态核对；保存使用进程间锁、私密权限、原子替换及目录刷盘。未知持久字段保留。`profiles.reserve()` 在异步工作前预占设置互斥，覆盖档案、头像发布、文档编辑和起草会话创建；维护与 disposal 观察同一占用状态。

`pi-session-store.js` 在原生会话暴露前保存身份标记。新建区分省略 profileId 与显式 null；工作台普通新建使用 null，“以身份新建”显式传入档案，伙伴窗口另附原生窗口标记。服务端专用同步 initializer 仅供受信任的内部创建流程使用，HTTP JSON 不能传入函数。列表与定点查找核对原生文件及解析时修订；worker 仍按唯一规范 sessionPath 管理。列表额外保留最多 32 个 cwd 的可丢弃展示缓存：`pi-session-list-revision.js` 每次重新枚举目录成员，并核对各文件 no-follow 描述符、内核路径、完整身份、类型、大小、mtime/ctime 与前后变化；超过 5,000 个文件或核实失败时不复用缓存。只有原生文件集合、档案修订及服务实例均相同时才复用投影，缓存不参与原生会话恢复。分叉保留原生历史并为新会话 ID 显式重新绑定身份；导入不会仅凭历史标记激活档案或起草权限。

## 旧分类退役与运行配置

旧助手分类注册表、归属解析、运行扩展与变更服务均已移除。HTTP 边界为旧分类路径及带 assistantProjectId 的新建请求提供鉴权后的 410 tombstone，不触碰历史数据；会话存储不再依赖分类注册表的格式、修订或可用性，不投影 assistantProject，不为分叉的新 ID 绑定分类。旧原生 custom entries 保留为无效历史元数据，复制分支时沿用 Pi 原生历史语义。worker 环境显式清除旧分类变量；Supervisor 只消费迟到的旧私有通知，不保存或投影旧加载状态。

`pi-agent-routes.js` 继续核对规范原生会话身份并传入档案及伙伴上下文；`pi-web-session-extension.ts` 注册各自扩展。档案加载确认、SOUL／记忆和伙伴话题指令保持原有契约。

## 文档、技能与辅助起草

`profile-memory/extension.ts` 在每次索引、检索、注入、技能发现及写入时校验有效档案与原生会话。环境 JSON 本身不是授权令牌。适配器使用已核对的独立 bundle，按档案和真实 cwd 保存资源；不会全局注册上游默认扩展或扫描其他档案。`background-index.js` 持有每个启用记忆 worker 的历史索引工作线程；`index-worker.js` 串行执行原有来源核实、事务替换和检索，不写原生会话；它也按 `hits` 批次为 `memory_search` 实际返回的行（由适配器在上游同步读取时记录）调用上游 `recordSearchHits`：主线程按行合并待写计数、队列中最多一个批次，worker 以 100 ms 忙等待单事务写入，失败即丢弃不影响检索，`management.memoryRecall` 只读汇总后由知识快照附加为不进入 revision 的 `recall`，整理合并建议把它作为可选 `recalled` 提示传给模型。启动与 settled 只调度可合并的派生工作，搜索等待在途刷新并继续前后核实，退出等待线程关闭；详情见[索引边界](../PROFILE_MEMORY.md#source-index-and-bounds)。`schema-prep.js` 在索引线程、文档索引打开前及 worker 首次执行记忆工具前，以 `BEGIN IMMEDIATE` 补齐上游追加的 `memories` 列，避免并发首次打开时上游未加事务的列快照重复 ALTER；锁等待超时等失败会让该次调用失败关闭，不回退到上游无同步迁移，扩展注册阶段不执行；升级上游时须核对其列定义与上游一致（[0.9.10 接入](../PROFILE_MEMORY.md#upstream-0910-adaptation)）。

`pi-profile-documents.js` 提供 USER/MEMORY 文档及双修订编辑，使用与 worker 写入相同的变更锁和代次。`profile-memory/document-index.js` 只同步旧／新 Markdown 对应的准确 SQLite 身份，保留不相关的扩展记忆。重复候选或冲突身份拒绝保存。待同步标记保护文件发布与索引间的中断；未发布计划只有在旧内容被验证后才可清除，已发布计划按当前修订修复，未知内容继续拒绝。文件保存、索引状态与失败结果分开返回，不能用 HTTP 超时推断回滚或自动重放修改。

`profile-memory/management.js` 提供只读列表和按不透明 ID 读取的单条技能正文。来源说明表示受控的助手技能库位置，不推断实际作者；正文读取仍执行范围、描述符及预算检查。

`pi-profile-authoring.js` 创建专用的无档案原生会话，`pi-profile-authoring-extension.ts` 仅在当前 ID 的有效起草会话中提供 `profile_draft`。工具只记录提案，不写档案或文档。网页创建后填入可见草稿，用户发送才调用模型；审核提案时核对服务端 `profileRevisions`，导入后仍需显式保存。普通会话、分叉和导入不会继承此工具权限。

身份页前端由 `pi-agent-profiles.js` 外壳组合：它拥有已保存档案快照、选中身份、五个分页（overview／persona／memory／skills／learning，旧地址的 soul、user、projects 等由别名映射）、设定草稿、回收站操作和离开保护。`pi-profile-knowledge.js`（记忆、技能，含 USER/MEMORY 全文模式）与 `pi-profile-learning.js` 各自拥有草稿、修订与在途请求，通过 `open/close/dirty/busy/discardChanges` 契约接入，外壳只汇总，不复制它们的状态。`pi-identity-ui.js`／`.css` 是共享组件与主题令牌，页面样式只补布局；`pi-identity-templates.js` 只提供 SOUL 示例文本。`close()` 仅在用户明确拒绝放弃或保存仍在进行时返回 false，设置页据此保留身份页；“与 Agent 起草”以一次性离开标记跳过放弃确认并保留内存草稿，返回后由用户导入提案。

旧助手地址仅保留小型路由兼容：有真实 cwd 的线程链接在工作台打开，伙伴身份链接进入主聊天，其余回到工作台，不读取旧分类。身份页只展示记忆、技能、学习，不提供关联分类入口。原生历史仍是唯一对话事实来源；头像与索引不能成为另一份聊天历史。接口及限制见[助手档案](../AGENT_PROFILES.md)、[记忆适配](../PROFILE_MEMORY.md)和[API](../API.md)。
