# DSH Lake 0.2 验证记录

日期：2026-10-22。macOS arm64，官方 DeepSeek Harness `0.2.1-rc.2` CLI/Web runtime。使用独立 DSH_HOME；模型为本地 OpenAI 协议测试服务，SSH 为随机生成服务器密钥的本地测试服务。没有使用正式模型密钥、SSH 私钥或生产服务。

## 来源与构建

- Lake `develop / 89a02c6c85d972c70579a14e238bac80be281fbb`，版本 0.3.21。
- `npm run verify:source`：1630 文件逐个匹配固定提交的 Git blob。
- `npm run build:client`：宿主 React 外置，原生插槽客户端与 xterm 构建成功。
- `codesign --verify --strict bin/darwin-arm64/lake`：通过。后端复用已构建的相同上游提交；本次未修改上游或重复运行全部 Go/React 回归。
- 完整构建脚本已加入原生客户端步骤；prepack 检查后端提交和原生客户端源码/产物 SHA-256，拒绝过期客户端。

## 自动化验证

`npm test` 11 项通过：

- DSH 认证、同源与 loopback 请求边界。
- 私有数据目录、禁止覆盖独立 Lake/Dev 目录。
- 内部 bearer 不传到客户端，目录投影不包含模型或人工会话。
- 并发终端范围关联、不同 DSH 会话隔离、关联持久化与重载。
- 原生 main/sidebar 插槽、SessionProvider 子槽和宿主 Conversation Factory。
- 工具审批保留上游 deny/cancel/ask；命令必须询问。
- 使用实际 DSH agent.id 归属终端，不制造 Lake 危险操作的目标确认。
- 取消中断所属终端；相同 call ID 的并发投递只执行一次。

`npm run test:integration` 2 项通过，直接使用打包的真实 Go 后端：

- 并发启动、数据独占锁、项目/本机资源创建、PTY 实际执行 printf。
- 目录不包含模型/人工会话，独立 Lake 模型/消息 API 不对浏览器开放。
- 其他 DSH 会话不能读取当前终端。
- 模型工具实际执行 printf；危险命令被 Lake 拒绝。
- 实际启动 sleep 后取消，中断后命令不再处于 running/queued。
- 仅杀死测试子进程，重启后项目保留；dispose 释放子进程和锁。
- 符号链接不能绕过独立 Lake 数据目录保护。

## 实际 DSH 浏览器验收

- 本地目录由实际 DSH CLI 的插件命令安装，侧栏 Lake 入口和原生页面加载成功，无 iframe。
- 在 DSH 设置中配置本地测试模型，Lake 原生模型选择器立即展示同一目录并使用该模型流式回复。
- 在 Lake 发送消息后，DSH 原生会话树新增同一会话。返回 DSH 对话布局，消息、草稿和模型选择连续保留；刷新后历史仍可用。
- 新建会话继承 DSH 工作区，只有一个可编辑输入框；引用资源写入该 DSH 草稿。
- 测试模型发起 `lake_run_command`，出现 DSH 原生审批；第一次拒绝，第二次允许。后端数据库只有一次获准测试命令记录，输出正确、exitCode=0。
- 本机终端通过真实键盘输入执行 printf，获得实际输出。
- 添加本地 SSH 测试主机，首次指纹与测试服务器打印的 SHA-256 一致。拒绝后停止连接；明确重试、信任后建立 Shell 并获得 SSH printf 输出。
- 明暗主题跟随 DSH；1512×761 桌面界面和 540×800 窄窗口截图检查通过。
- 540px 下 document.scrollWidth=540，资源栏默认折叠，展开为 246px 浮层；原生对话保持 484px 宽，输入框可用。

截图：[浅色](images/native-light.png)、[深色与本机终端](images/native-dark.png)、[窄窗口](images/native-narrow.png)、[窄窗口资源栏](images/native-narrow-resources.png)。

## 预构建包安装

- `dsh plugin --profile web add <clean-lakes-dsh-lake-0.2.0.tgz>` 在另一个干净 DSH_HOME 成功安装，确认安装版本为 0.2.0。
- 从包启动实际 DSH Web runtime，完成初次引导后，Lake 页面加载原生组件，iframe 数量为 0，可编辑输入框数量为 1。
- 已登录的 `/lake/api/catalog` 返回 200，未登录访问返回 401；包内签名 Go 后端成功启动。
- 验证 `--dsh-frame-top-clearance=48px` 时原生页面头部 top=48px，给宿主窗口控件保留空间。

## 覆盖边界

0.2 的原生界面覆盖 DSH 模型/会话及 Lake 资源创建、目录、引用和本机/SSH 终端。Lake 原版全部资源编辑、分组、文件、SRE、策略、工作流和记忆页面尚未迁移；不能以保留源码替代这些页面的原生功能验收。

SSH 仅验证了本地密码认证测试服务，未连接实际远程主机或读取真实私钥。模型仅验证本地协议测试服务，未使用真实付费模型。宿主 macOS 标题栏预留变量已接入，官方 Electron 桌面及其他 DSH 版本仍需现场验收；Linux/Windows 未构建和验收。

工具 call ID 结果复用限于当前插件进程，执行结果不明确时不自动重试。原版历史保留，不自动迁移到 DSH。手动终端在离开页面/切换会话时断开；后端保留记录，当前界面不恢复断开的手动 Shell。
