# Review Desk：项目说明与 AI 协作复盘

Review Desk 是一个面向内部运营的内容审核工作台，支持查看投稿、同批次逐条通过或驳回、独立填写原因、追踪审核记录，以及由原处理人撤回误审批。前端采用 Vue 3 + TypeScript，后端采用 Node.js + TypeScript，业务数据保存在本地 SQLite。

**我在项目中的主要贡献是需求澄清、交付范围决策、迭代方向和 Agent 协作组织。** 我将开放题面收敛为具体业务约定，要求先形成独立方案，再推进实现；在初版之后提出撤回需求，并进一步将后续改动组织为功能层与体验层。Agent 承担具体代码、测试和文档的辅助编写，以及安装、构建和浏览器验证的执行。

运行方式和操作演示见 [README.md](./README.md)，开发与验收约定见 [V1.md](./V1.md)。本文说明个人贡献、题目回答、工程选择及实际交付结果。

## 1. 我的贡献：把开放需求变成可执行约定

题目给出了技术约束和运营场景，但没有完整定义批量决策、失败处理、误操作恢复及交付范围。我通过与 Agent 的持续讨论明确方向，让后续实现围绕具体任务展开。

| 我做出的判断或推动的工作 | 对项目的影响 | 对应产物 |
| --- | --- | --- |
| 明确“同一批次每条可以有不同决策和驳回原因” | 批量操作保留逐条判断能力，可以一次处理不同情况 | 逐条决策窗口、混合批量请求 |
| 在当天 17:00 前的交付约束下，确定先做文本审核，图片和视频只预留接口 | 优先完成可运行的审核流程，媒体能力作为后续方向 | 附件类型、媒体组件入口、范围说明 |
| 主动调用 GrillMe 协助确认项目细节 | 将模糊想法通过逐项问答收敛为明确需求 | 已确认业务范围及默认约定 |
| 要求把基础方案写入独立的 V1.md，再推进实现 | 后续代码、接口、测试和文档有共同依据 | V1.md、前后端与测试代码 |
| 在初版后提出“原处理人撤回已审批内容，防止误触” | 为错误判断提供恢复路径，并带动版本校验、历史保留和旧库升级 | 撤回接口、详情入口、迁移与回归测试 |
| 提出以“功能层 / 体验层”组织后续改动 | 每次迭代同时说明业务规则的变化和用户操作的改善 | 本文的迭代分类与后续方向 |

我的工作重点是把目标、约束和优先级说明白，再将确定的方案交给 Agent 执行。接口、事务、版本校验和迁移细节由 Agent 进一步展开，个人决策与实现结果通过方案、代码、测试和提交记录对应起来。

## 2. 对题目的逐项回答

### 2.1 题面要求 → 解决方案

以下是题面要求的精简表达。原题文件保留在本地，仓库通过本表说明落实方式。

| 问题或要求 | 解决方案 | 实现或说明位置 |
| --- | --- | --- |
| 前端使用什么技术？ | Vue 3 + TypeScript，使用 Vite 构建、Element Plus 提供基础组件 | [frontend/package.json](./frontend/package.json)、[App.vue](./frontend/src/App.vue) |
| 后端使用什么技术？ | Node.js + TypeScript，使用 Express 提供 HTTP API、Zod 校验外部输入 | [backend/package.json](./backend/package.json)、[api.ts](./backend/src/routes/api.ts) |
| 数据只用本地 SQLite，如何落地？ | 使用 better-sqlite3；默认数据库路径为 `backend/data/review-desk.sqlite`，不接远程业务数据库 | [database.ts](./backend/src/db/database.ts)、[paths.ts](./backend/src/config/paths.ts) |
| 不做完整账号系统，如何区分“谁在操作”？ | 用预置人员 ID 区分：`reviewer-a`（林晓）、`reviewer-b`（陈舟）。前端选择 ID，后端校验并记录 ID 与姓名快照；撤回按当前结果的处理人 ID 校验归属 | [operators.ts](./backend/src/config/operators.ts)、[reviews.ts](./backend/src/services/reviews.ts)、[withdrawals.ts](./backend/src/services/withdrawals.ts) |
| 表结构和演示数据怎么设计？ | `submissions` 保存投稿及当前审核结果，`review_logs` 保存成功的状态变化。首次初始化生成 30 条投稿：24 条待审、3 条通过、3 条驳回，并为已审核项生成一致日志 | [database.ts](./backend/src/db/database.ts)、[seed.ts](./backend/src/db/seed.ts) |
| 运营如何完成“看列表、勾几条、通过或驳回”？ | 默认进入待审核列表，勾选本页投稿，查看全文，逐条设置决策和原因，一次提交后查看逐条结果 | [App.vue](./frontend/src/App.vue)、[BatchDialog.vue](./frontend/src/components/BatchDialog.vue) |
| 一次处理多条，情况不同怎么办？ | 请求中每条分别携带 `submissionId`、`expectedRevision`、`decision` 和需要时的 `reason`；同批次可混合通过、驳回及不同原因 | [reviews.ts](./backend/src/services/reviews.ts)、[BatchDialog.vue](./frontend/src/components/BatchDialog.vue) |
| 没看过仓库的人如何自己完成任务？ | 提供根目录启动命令、固定演示数据、清楚的空状态和错误反馈，以及 README 中的混合审核、并发冲突和撤回操作步骤 | [README.md](./README.md)、[package.json](./package.json) |
| 需求未写死的部分如何处理？ | 将补充假设明确记录在本文与 V1.md，覆盖状态流转、选择范围、校验、冲突、网络异常、媒体范围和数据持久化 | 本文 2.2 节、[V1.md](./V1.md) |
| 允许使用 AI，工程和交付如何组织？ | 本地搭建前后端工程；按澄清、规划、执行、排错、验证和提交的阶段使用 Agent，记录个人决策与 AI 执行的分工 | 本文第 5 节 |
| GitHub 仓库和最终材料在哪里？ | 使用[公开仓库 review-desk](https://github.com/ljq1300425941-bit/review-desk)持续提交源码、测试、运行说明和本文件；本地数据库、缓存和构建产物由 `.gitignore` 排除 | [提交记录](https://github.com/ljq1300425941-bit/review-desk/commits/main)、[.gitignore](./.gitignore) |

预置 ID 是演示身份，满足本项目区分操作来源的需要。真实登录、可信身份认证和完整权限体系属于后续功能范围。

### 2.2 题面未定义的工程问题 → 项目约定

下表是项目补充的实施选择，不将其当作题目原有要求。

| 工程问题 | 当前选择及理由 | 实现位置 |
| --- | --- | --- |
| 投稿有哪些状态？ | `pending / approved / rejected`。仅待审核项可设置决策；原处理人可撤回当前审核，再显式重新处理 | [reviews.ts](./backend/src/services/reviews.ts)、[withdrawals.ts](./backend/src/services/withdrawals.ts) |
| 单条与批量是否分别实现？ | 共用 `POST /api/reviews/batch`，单条就是一个 item，保持校验和事务规则一致 | [api.ts](./backend/src/routes/api.ts)、[reviews.ts](./backend/src/services/reviews.ts) |
| 默认是否直接通过？ | 初始决策为空，全部选中项明确决策且原因完整后才允许提交，降低误审批风险 | [batch.ts](./frontend/src/components/batch.ts)、[BatchDialog.vue](./frontend/src/components/BatchDialog.vue) |
| 公共设置会不会覆盖手工判断？ | 统一决策只改未设置项；公共原因只填充已选驳回且原因为空的项 | [batch.ts](./frontend/src/components/batch.ts) |
| 跨页如何选择？ | 仅选择当前页待审核项，翻页或修改筛选后清空选择，便于确认本次处理范围 | [App.vue](./frontend/src/App.vue) |
| 批量大小和原因长度如何限制？ | 单批 1～50 条、ID 不重复；驳回原因去除首尾空白后为 1～500 个 Unicode 字符；通过时原因归一化为 null | [reviews.ts](./backend/src/services/reviews.ts)、[batch.ts](./frontend/src/components/batch.ts) |
| 列表如何排序和检索？ | 默认按投稿时间、ID 升序，优先展示较早投稿；按标题或作者搜索；SQL 参数绑定，搜索通配符按文字转义 | [submissions.ts](./backend/src/repositories/submissions.ts) |
| 某条被其他人先处理怎么办？ | 不覆盖现有结果；该条返回 conflict，其他有效项继续提交，并逐条反馈 | [reviews.ts](./backend/src/services/reviews.ts)、[ResultDialog.vue](./frontend/src/components/ResultDialog.vue) |
| 参数错误或数据库异常怎么处理？ | 参数错误返回 400，整批不写入；数据库异常回滚整个事务；写锁等待超过 3 秒返回 503。状态和成功日志保持一致 | [app.ts](./backend/src/app.ts)、[reviews.ts](./backend/src/services/reviews.ts) |
| 网络异常后是否直接重试？ | 保留草稿并提示结果未确认，先查询当前状态和版本；核对后只允许显式提交仍待审核项 | [BatchDialog.vue](./frontend/src/components/BatchDialog.vue)、[SubmissionDrawer.vue](./frontend/src/components/SubmissionDrawer.vue) |
| 如何防止撤回后的旧请求重放？ | 每次审核或撤回递增 revision，请求携带 expectedRevision；后端同时检查状态和版本 | [reviews.ts](./backend/src/services/reviews.ts)、[withdrawals.ts](./backend/src/services/withdrawals.ts) |
| 重启或初始化会覆盖审核结果吗？ | 首次建库时生成数据；重启与 `db:init` 保留现有记录；`db:reset` 才主动清除。schema 1 → 2 自动迁移并保留原记录 | [database.ts](./backend/src/db/database.ts)、[cli.ts](./backend/src/db/cli.ts) |
| 数据层如何保证基本一致性？ | 启用外键、CHECK 约束、WAL 和有限写锁等待；使用同步、短 immediate 事务，事务内不执行网络请求 | [database.ts](./backend/src/db/database.ts)、[reviews.ts](./backend/src/services/reviews.ts) |
| 投稿能否编辑，是否记录失败尝试？ | 审核期间不提供投稿编辑；只持久化成功的状态变化，失败尝试在响应中反馈 | [api.ts](./backend/src/routes/api.ts)、[database.ts](./backend/src/db/database.ts) |
| 投稿中的 HTML 如何显示？ | 正文作为纯文本插值并保留换行，不执行投稿中的脚本和标签 | [SubmissionDrawer.vue](./frontend/src/components/SubmissionDrawer.vue) |
| 图片、视频当前做到哪一步？ | 预留附件类型、数据库字段和媒体组件入口，演示数据附件为空；上传、存储及真实预览留待后续实现 | [types.ts](./backend/src/types.ts)、[SubmissionMedia.vue](./frontend/src/components/SubmissionMedia.vue) |

## 3. 功能层：添加、优化、删除

功能层关注“系统能做什么、业务规则如何变化”。每次改动需要说明接口、状态、数据兼容和验收行为。同一项改动也可以同时带来体验改善。

| 类型 | 已交付能力 | 验收重点 |
| --- | --- | --- |
| 添加 | 投稿列表、详情、逐条决策、混合批量提交、审核记录 | 三条投稿可以分别通过、驳回并使用不同原因，提交后状态和日志一致 |
| 优化 | 单条和批量共用规则；业务冲突逐条跳过，数据库异常整批回滚 | 两个操作人不能覆盖同一结果；有效项不因预期冲突丢失 |
| 添加 | 原处理人单条撤回审核 | 通过或驳回均可退回待审核，其他人无法代为撤回，原日志及原因保留 |
| 优化 | 为审核与撤回加入版本条件 | 重复请求和旧页面请求不能误处理后来的状态 |
| 优化 | 已有 SQLite 数据库升级 | 原投稿、日志 ID、原因以及既有索引、触发器保留，迁移失败回滚 |

撤回是本次迭代的代表：我从“误触后要能够恢复”的使用需要出发提出功能，Agent 将它细化为完整状态变化。实现覆盖后端归属校验、事务、历史日志、前端确认以及旧库迁移。

例如，同一条投稿从 `pending(revision=0)` 审核到 `approved(1)`，撤回后回到 `pending(2)`。它再次处于待审状态，但旧页面携带的版本 0 仍必须被拒绝，否则原来的误审批可能被重放。同样，旧撤回请求也不能撤掉后来重新审核的新结果。

“删除”作为后续迭代类型保留，当前版本没有移除已交付功能。删除功能时需要说明替代流程、接口兼容和历史数据保留方式。

## 4. 体验层：让任务更容易完成，让误操作可以恢复

体验层关注用户能否理解操作范围、顺利完成任务，以及在错误或中断后继续处理。

| 使用中的问题 | 当前体验处理 | 带来的结果 |
| --- | --- | --- |
| 批量动作可能覆盖逐条判断 | 默认不选决策，公共设置只补未设置项，提交前显示数量汇总和未完成项 | 保留审核员对每条内容的明确判断 |
| 阅读全文后需要重新填写 | 批量窗口上打开详情抽屉，返回后保留决策和原因 | 阅读与填写可以连续进行 |
| 提交后只知道笼统的“成功” | 展示逐条结果、成功/冲突/不存在汇总，以及可查看的最新记录 | 可以确认本次哪些条目已处理、哪些需继续核对 |
| 误审批后难以恢复 | 原处理人在详情中确认撤回，退回待审后重新设置决策；撤回期间锁定相关操作 | 有明确恢复路径，减少重复点击和身份切换造成的误操作 |
| 网络断开后不知道后端是否已提交 | 展示“结果尚未确认”，阻止直接重复请求，提供“核对当前状态”入口 | 不将连接失败直接解释为业务失败 |
| 新使用者不知道从哪里开始 | 默认待审、清楚的选择范围、空状态、加载失败重试、README 操作步骤及移动端布局 | 能够从启动到完成一次审核，再查看结果 |

撤回需求同时体现两类变化：功能层增加恢复审核状态的能力，体验层提供确认、历史反馈和异常后的核对入口。后续迭代会沿用这种方式记录变更目的和验收结果。

## 5. 我如何组织 Agent 协作

我按任务阶段组织 Agent 的工作方式，让每个阶段的输出成为下一阶段的输入：需求讨论形成约定，约定形成 V1.md，方案推进代码，代码再通过测试和真实操作验证。

| 工作模式（按任务阶段） | 我提供的输入或推动的动作 | Agent 使用的方法与产物 |
| --- | --- | --- |
| 澄清与质询 | 主动调用 GrillMe，说明交付时间、混合决策、独立原因和媒体范围 | 通过访谈逐项确认需求与假设，收敛项目范围 |
| 方案规划 | 要求生成独立 V1.md，确认后再执行 | 将需求展开为页面流程、模块职责、数据模型、接口与验收约定 |
| 执行实现 | 将确定的方案交给 Agent，后续以具体行为提出改动，如原处理人撤回 | 编写前后端、演示数据和测试；使用 `frontend-design` 组织界面设计，使用 `minimal-project-change` 控制已有项目的修改范围 |
| 定位与排错 | 提供实际使用中的启动需求，推进问题定位和修复 | 使用 `project-debugger` 区分依赖、环境与代码问题；解决 SQLite 原生模块下载问题及后续不完整依赖导致的 tsx 启动失败 |
| 验证与交付 | 推进本机运行和仓库交付，要求说明真正验证的结果 | 使用 `playwright` 操作真实 Chrome，执行类型检查、测试和构建；使用 `git-commit-cleanup` 整理可审查提交 |

**协作分工是明确的：** 我主导业务目标、范围取舍和迭代方向；Agent 提供实现方案、辅助编写代码与文档，并执行命令和浏览器检查。测试、构建和浏览器运行结果是 Agent 在本机执行得到的证据，具体记录见下一节。

这段经历中，我的个人优势体现在三个具体动作上：

- **把模糊表述拆成行为。** 将“一次处理多条，情况不同”明确为逐条决策和独立原因；将“防止误触”转为可撤回、可重新处理的需求。
- **在约束下确定交付范围。** 给出时间目标，先完成文本审核流程，把媒体能力明确记录为接口预留和后续工作。
- **持续推动落地和迭代。** 从澄清到独立方案，再到实际运行、撤回改动和仓库交付，逐步给 Agent 更明确的任务与输出要求。

对应的工程链路可以在仓库中检查：`Vue 页面 → HTTP 路由与校验 → 审核服务 → SQLite 状态与日志`。状态条件更新、事务失败语义、版本校验和网络异常后的核对，是理解和解释实现时的关键位置。

## 6. 实际验证与审查入口

以下记录来自功能实现和本机启动阶段已经执行的验证，环境为 Windows、Node.js 24.18.0、npm 11.16.0。本文重组属于文档改动，验证结果与对应功能实现保持区分。

| 验证项目 | 已执行结果 |
| --- | --- |
| 类型检查与构建 | `npm run typecheck`、`npm run build` 通过，覆盖前后端与测试代码 |
| 自动测试 | `npm test` 通过：3 个测试文件、50 项测试；其中 17 项覆盖撤回和数据库迁移 |
| Chrome 真实操作 | 验证混合决策、不同原因、详情往返、公共设置、分页/筛选、并发冲突、加载重试、关闭确认和移动端布局 |
| 撤回与异常恢复 | 验证取消不发请求、原处理人入口、通过/驳回撤回、原因保留、重新审核、结果详情撤回、旧版本冲突，以及后端提交后丢失响应的核对流程 |
| 数据持久化与升级 | 停止并重启后记录保留；schema 1 → 2 升级前备份、升级后逐字段比较，升级时的 30 条投稿和 10 条日志原字段与 ID 全部保留，外键检查通过 |
| 干净目录交付 | 从仅含源码的目录执行安装、初始化、类型检查、测试、构建和单进程启动；没有复制 node_modules 或数据库，仅共享下载缓存 |
| Windows 依赖恢复 | SQLite 官方预编译文件的 SHA-256 校验与缓存恢复通过；后续修复不完整 node_modules，并重新启动前后端 |
| 最近本机启动检查 | 页面返回 200、后端健康检查通过，前端 API 代理可读取审核员和投稿数据 |

自动测试覆盖参数拒绝、业务冲突、并发请求、SQLite 写锁、日志失败回滚、Unicode 长度、数据库约束、持久化和迁移。故障注入使用独立测试数据库，生产接口没有测试开关；浏览器故障验证也使用独立数据库。

网络验证区分“请求尚未到达后端便断开”和“后端已提交但响应丢失”。界面先核对当前状态，再决定后续操作；当前已处理状态不自动归因于原请求成功。版本条件更新防止重复状态变化，完整的请求级幂等记录和结果重放仍属于后续工作。

审查时可以沿以下路径查看：

1. 按 [README.md](./README.md) 启动，完成一次混合审核，再撤回其中一条，查看完整历史。
2. 查看 [reviews.ts](./backend/src/services/reviews.ts) 与 [withdrawals.ts](./backend/src/services/withdrawals.ts)，核对业务规则、版本条件与事务。
3. 查看 [reviews.test.ts](./backend/tests/reviews.test.ts)、[withdrawals.test.ts](./backend/tests/withdrawals.test.ts) 和 [batch.test.ts](./frontend/src/components/batch.test.ts)，核对关键风险的验证覆盖。
4. 对照[初版实现提交](https://github.com/ljq1300425941-bit/review-desk/commit/249e82e60c3cf88562377f4246ea621cb44ac070)与[撤回迭代提交](https://github.com/ljq1300425941-bit/review-desk/commit/4426fb29fc223e0b5db62512ff8adc2c79039c29)，查看项目如何从基础审核扩展到误操作恢复。

## 7. 后续迭代方向

### 功能层

- **添加：** 图片/视频上传与预览、真实身份认证、请求级幂等与批次结果查询、失败尝试审计。
- **优化：** 复审权限、批量撤回、跨页选择、审核记录查询与导出。当前先支持原处理人单条撤回和显式重新处理。
- **删除：** 接入真实身份后，评估移除演示身份切换；同时调整操作入口、接口约定和演示说明，保留历史记录。

### 体验层

- 优化错误定位、键盘操作、移动端阅读与审核历史展示，依据具体使用问题确定优先级。
- 当前 Element Plus 全量引入，构建给出体积提示；后续可按需引入组件和拆分代码，并在实际加载条件下验证改善。

当前交付范围是可在本机运行的文本审核原型：媒体尚未实现，身份是预置演示身份，投稿编辑、完整复审体系和公网生产部署不在已完成范围中。
