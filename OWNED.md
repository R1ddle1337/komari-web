# 自管 Komari 前端

此仓库已完整合并 `komari-monitor/komari-web` 的 `radix` 开发分支，截至
`aced74240868a1d170f83c8221d0039390c8846e`（2026-09-22 检查）。
此前稳定版基线为 `1.5.0-fix1` 的 `3324844cfa347f18c83435f1ccf5634df7e5b768`。
保留上游作者和许可信息，业务功能及其删除均跟随该开发分支；
自管安装与更新来源、受控构建发布的改动继续保留。

运行版本由 `R1ddle1337/komari` 主控仓库选择本仓库的完整提交 SHA，执行
`npm ci`、`npm run build` 后嵌入主控；不能使用浮动上游前端或下载其预编译 UI。
Node.js 固定为 `22.23.2`，沿用现有 `package-lock.json`，不自动升级依赖。

## 安装来源

所有节点安装入口（普通节点、自动发现、旧节点表格）统一使用
`src/utils/ownedSources.ts`：

- 安装脚本来自 `R1ddle1337/komari-agent` 的 `1.5.13` tag。
- 默认初次安装传入 `--install-version 1.5.13`，Agent 仍可从其自管仓库自动更新。
- 保留最新 UI 的指定版本与 snapshot 选项；显式选择的版本仍只从自管 Agent 仓库下载。
- Docker 使用 `ghcr.io/r1ddle1337/komari-agent:1.5.13`。
- 主控版本提醒仅查询 `R1ddle1337/komari` 的 releases。
- 远控、终端、文件管理、自更新和上游现有安装选项均保留。

本次包含上游的新手引导、独立登录页和可配置仪表盘；也接受上游删除的
命令剪贴板、终端设置页和负载告警页面。终端使用上游的默认设置。

GitHub 代理只在管理员显式填写时使用。无协议的代理地址默认补全 HTTPS；
自管 Agent 安装器要求 HTTPS。代理能同时替换脚本、二进制和校验文件，
校验文件不能作为对该代理的独立信任凭据。

## 现有设置与数据迁移

`1.5.0-fix1` 的安装命令由前端生成，未读取 `agent_install_endpoint`。
`settings.script_domain` 仅决定 Agent 连接哪个主控，不是脚本下载地址，迁移时应保留。
后端遗留的 `base_scripts_url` 字段也未被本版本的安装按钮使用。
因此切换这个前端不需要修改数据库中的脚本地址，更不能批量替换用户数据中的域名。
若现有实例使用另一个版本或自定义主题，应另行检查其按钮是否读取旧的安装脚本配置。

## 构建、测试与发布

```sh
npm ci --no-audit --no-fund
npm run test:owned
npm run test:onboarding
npm run build
```

保留一个受限工作流：只对本仓库 `owned` 分支及其 PR 执行只读构建。
需要发布静态主题包时，从 `owned` 分支手动运行工作流并明确选择发布，填写新版本。
它只向自己的仓库创建新 release，不覆盖旧 release；不会自动跟随上游、
调用上游仓库、使用 SSH 部署到服务器，或自动修改翻译和发布说明。

未来升级前先审查代码，再更新此仓库和主控仓库中的固定 SHA。
修改 Agent 首装版本时，同时确认对应自管 release、SHA256 文件和 Docker 镜像均已发布。

上游此提交声明了 `test:onboarding`，但未提交所引用的测试文件；本仓库补齐
引导状态、站内登录回跳及主题设置保留/串行写入/失败恢复测试，单次限制 60 秒。
