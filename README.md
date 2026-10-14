# Review Desk

一个给内部运营使用的内容审核工作台。支持同批次逐条通过或驳回、不同驳回原因、审核记录，以及其他操作人先行处理后的冲突反馈。

前端使用 Vue 3 + TypeScript，后端使用 Node.js + TypeScript，数据仅保存在本地 SQLite。详细方案见 [V1.md](./V1.md)，需求假设、AI 协作与验证结果见 [SUBMISSION.md](./SUBMISSION.md)。

## 快速开始

本机验证环境：Windows、Node.js **24.18.0**、npm **11.16.0**。建议使用 Node.js 24 LTS；依赖版本由 `package-lock.json` 固定。

```bash
git clone https://github.com/ljq1300425941-bit/review-desk.git
cd review-desk
npm ci
npm run db:init
npm run dev
```

打开 **http://127.0.0.1:5173**。开发前端会把 `/api` 请求代理到 **http://127.0.0.1:3001**。

数据库首次创建时会自动生成 30 条演示投稿：24 条待审核、3 条已通过、3 条已驳回。重复初始化、刷新和重启均不覆盖已有审核结果。

## 三分钟演示

1. 保持“待审核”筛选，在当前页勾选三条，点击“设置审核决策”。
2. 第一条选择“通过”；第二、三条选择“驳回”，分别填写不同原因。
3. 可点击“查看全文”阅读完整正文，关闭详情后原有草稿仍然保留。
4. 全部填写完整后提交，在结果窗口核对每条结果。
5. 切换“已通过”或“已驳回”，打开详情，查看操作人、时间和原因。
6. 刷新页面，或停止并重新启动服务，检查结果仍然存在。

误审批时，在“已通过”或“已驳回”列表打开投稿详情，使用原审核员身份点击“撤回审核”，确认后退回待审核。原审批记录仍然可见，并追加撤回记录。其他审核员没有撤回入口，服务端也会拒绝代他人撤回。

演示并发冲突：两个浏览器窗口同时勾选同一条待审核投稿，分别选择“林晓”和“陈舟”，打开审核窗口。一个窗口先提交，另一个随后提交，后者应看到“状态冲突”，不会覆盖第一次的结果。

演示公共设置：先独立设置一条决策，再用“未设置项全部驳回”；已设置项保持不变。公共原因只填入空白的驳回原因，不覆盖手工填写的内容。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 同时启动前后端开发服务 |
| `npm run db:init` | 初始化数据库，保留已有数据 |
| `npm run db:reset` | **清除现有审核结果**并重新生成演示数据；请先停止服务 |
| `npm run typecheck` | 检查前后端与测试代码的 TypeScript 类型 |
| `npm test` | 运行审核、接口及草稿规则测试，使用独立数据库 |
| `npm run build` | 构建前端静态文件与后端 JavaScript |
| `npm start` | 启动构建后的单进程服务 |

## 构建后运行

```bash
npm run build
npm start
```

打开 **http://127.0.0.1:3001**。后端同时提供前端静态页面和 API，不需要另外运行 Vite。默认监听本机回环地址，当前交付用于本地演示，没有配置公网托管。

## 本地数据和配置

默认数据库为 `backend/data/review-desk.sqlite`，基于项目路径解析，不依赖启动命令所在目录。SQLite 数据文件和 WAL/SHM 文件不提交到 Git。

可通过环境变量 `DATABASE_PATH` 指定数据库。相对路径基于项目根目录解析；`PORT` 可改变后端端口。修改开发后端端口时，还需同步修改 `frontend/vite.config.ts` 的代理目标。项目不会自动读取 `.env` 文件。

PowerShell 示例：

```powershell
$env:DATABASE_PATH = 'backend/data/my-demo.sqlite'
$env:PORT = '3001'
npm start
```

两名审核员是预置的演示身份，前端选择后由后端校验 ID。它们用于区分操作来源，没有密码和真实身份认证。

## 接口与失败语义

| 接口 | 说明 |
| --- | --- |
| `GET /api/operators` | 预置审核员 |
| `GET /api/submissions?status=pending&q=&page=1&pageSize=20` | 投稿列表；status 也可为 approved/rejected/all |
| `GET /api/submissions/:id` | 正文、附件描述和审核记录 |
| `POST /api/reviews/batch` | 混合批量决策；一条元素即为单条审核 |
| `POST /api/submissions/:id/withdraw` | 原处理人撤回当前这一次审核，退回待审核 |
| `GET /api/health` | 本地服务健康检查 |

```json
{
  "operatorId": "reviewer-a",
  "items": [
    { "submissionId": 1, "expectedRevision": 0, "decision": "approve" },
    { "submissionId": 2, "expectedRevision": 0, "decision": "reject", "reason": "包含商业广告" }
  ]
}
```

- 参数不合法返回 400，整批没有写入：包括重复 ID、无效操作人、缺少决策、空白或超过 500 个 Unicode 字符的驳回原因、超过 50 条的批次。
- 参数合法后，已审核和不存在的条目分别返回 conflict/not_found；有效项继续处理。200 表示请求已处理，不表示每条都成功。
- 数据库异常整批回滚，包括先前已更新的状态和日志；写锁等待超过 3 秒返回 503。
- 网络断开或响应丢失时，界面不认定成功或失败，而是要求核对当前状态。核对完成后，仅允许显式提交仍待审核的条目。

列表和详情返回 `revision`。审核和撤回都应提交读取时的 `expectedRevision`，每次成功的状态变化将版本加一，防止旧页面在“审核 → 撤回 → 再审核”后误操作新结果。批量审核为兼容首次审核的旧请求，未传版本时按 0 处理；已撤回的投稿必须使用重新读取的版本。

撤回请求示例（具体版本以详情返回值为准）：

```json
{ "operatorId": "reviewer-a", "expectedRevision": 1 }
```

撤回成功返回 200；非原处理人返回 403，投稿不存在返回 404，已待审核或版本过期返回 409。状态回退与撤回日志在同一事务中完成。网络异常后详情页会要求核对当前状态，不直接重复撤回。

已有 V1 SQLite 数据库会在服务启动时自动迁移到 schema version 2，保留投稿、审批记录和原因，无需执行 `db:reset`。

## 安装问题

`better-sqlite3` 是原生模块，首次安装需要下载对应 Node.js/系统架构的官方预编译包。若 GitHub 下载超时，可能转为本地编译并提示缺少 Visual Studio C++ 工具链；这属于依赖安装问题。

本次 Windows 验证遇到上述下载超时，通过直接下载官方 Node ABI 137 / Windows x64 预编译包、核对发布 SHA-256、放入 npm 本地缓存后执行 `npm rebuild` 解决。没有更换 SQLite 驱动，也没有提交二进制文件。其他环境应先确保 npm 官方仓库和 GitHub Release 下载可访问；只有确需源码编译时才需要安装对应 C++ 工具链。

Windows 下载超时时，可在项目根目录的 PowerShell 中执行以下恢复步骤。辅助脚本按已安装包版本、Node ABI 和系统架构查找官方文件，并校验发布的 SHA-256；不会修改全局 npm 配置：

```powershell
npm ci --ignore-scripts --cache .npm-cache
.\scripts\cache-sqlite-prebuild.ps1
npm rebuild --cache .npm-cache
npm run db:init
```

若 npm 版本启用了安装脚本审批，按照 npm 提示批准 `better-sqlite3` 与 `esbuild` 的安装脚本。不要仅用 `--ignore-scripts` 安装后就认为原生依赖已经可运行。

## 当前边界

- 仅文本审核，预留 `MediaAttachment[]` 和 `SubmissionMedia` 入口；尚未实现媒体上传、图片/视频预览。
- 原处理人可以单条撤回，通过和驳回均退回待审核。重新处理需显式设置新决策；暂不提供直接改写结果或批量撤回。
- 仅当前页选择，不支持跨页全选。
- 只记录实际成功的审核，不持久化每次失败尝试。
- 条件更新防止重复审核，但尚未实现请求级幂等结果重放。

后续可扩展媒体审核、复审状态流转、真实账号权限、批次查询和请求级幂等。
