# 运营工具 Chrome 插件

内部使用的 Manifest V3 Chrome 插件，界面运行在 Chrome 原生侧边栏中，不再向网页注入悬浮球或浮窗。点击右上角“运营工具”插件图标打开侧边栏，可在运营后台、H5 客服页面或其他标签页旁使用。业务请求统一由扩展后台代理到 `https://om.leshuazf.com`，携带浏览器现有的运营后台登录态，不会发送给当前网页。

## 安装与构建

```bash
cd chrome-extension
npm install
npm run typecheck
npm test
npm run build
```

在 Chrome 打开 `chrome://extensions`，启用开发者模式后选择“加载已解压的扩展程序”，加载 [`chrome-extension/dist`](/Users/swxswx/Desktop/work/code/Report-Tampermonkey/chrome-extension/dist)。

需要 Chrome 120 或更新版本。安装后在右上角扩展菜单中固定“运营工具”，点击图标即可打开原生侧边栏，关闭使用 Chrome 自带按钮。首次升级到 1.0.6 后重新加载扩展并刷新之前打开的后台/客服页面，清除旧版遗留的悬浮界面。请先在同一浏览器配置文件中登录运营后台。

执行任务时保持侧边栏打开；关闭、重新加载扩展或关闭浏览器可能中断尚未完成的前端流程，但已提交的后台操作不会撤销，重新提交前请核实结果。

## 功能

- 子商户号重置：支持收银通、联合收单，以及微信、支付宝、全部三个通道；默认批量接口一次最多处理 5 个商户。
- 自定义渠道重置：填写完整的渠道号和渠道主体后，统一执行上报、确认新号启用与旧号关闭流程。
- 微信支付参数绑定：可对新号或商户最新微信映射记录绑定 appid、支付授权目录。
- 配置商户 key：与重置页共用乐刷商户号输入框，支持使用英文 `;` 分隔任意数量的商户号；内部最多同时处理 5 个请求。
- 码牌划转、防切户白名单、收银通机具划拨、联合收单机具划拨：分别作为独立工具页面。联合收单机具划拨只需填写 SN、旧代理商编号和新代理商编号。
- 设备换绑配置：独立页面输入乐刷 SN、单日/单月最大绑定次数（留空默认 3）和结算主体白名单（默认是）。先查询精确匹配的 SN 配置，有记录则修改，无记录则新增；修改保留原累计最大商户数和累计最大绑定次数。查询失败、记录不唯一或存在多页时停止，不自动新增。新增依据 JSON 的 `success: true`，修改依据 HTML 的“操作成功”确认结果；保存请求不自动重试。
- 插件 1.0.5 新增设备换绑配置，接口与业务分别位于 `src/api/device-bind-config.ts` 和 `src/tools/device-bind-config.ts`。
- 插件 1.0.6 迁移到 Chrome 原生侧边栏，移除页面注入、浮球拖动及点击外部收起逻辑；保留原业务流程。
- 插件 1.0.7 优化侧边栏：顶部下拉切换工具；业务线和重置通道使用分段单选；可选配置默认折叠；商户输入提供计数、格式提示与清空按钮；结果改为纵向列表，支持逐项复制、复制全部和自动复制，未执行通道不显示。日志折叠时完整显示最新一条消息。接口及业务流程不变。

“开通在线收款单”已删除，不再提供入口或请求实现。

## 源码结构

依赖方向固定为 `sidepanel -> tools -> api`：界面层只调用工具层，工具层编排接口层，接口层不反向引用界面或业务流程。`api/http.ts` 通过扩展消息交给 `background/index.ts` 执行后台请求。

```text
chrome-extension/src/
├── background/
│   └── index.ts                 # 图标打开侧边栏、运营后台请求代理
├── api/
│   ├── http.ts                  # 通用请求、日期和 HTML 解析
│   ├── quick-report.ts          # 收银通/联合收单共用批量重置接口
│   ├── mapping.ts               # 微信/支付宝映射记录查询
│   ├── report.ts                # 自定义渠道上报接口
│   ├── notification-status.ts   # 子商户号状态确认与启用/禁用接口
│   ├── payment-config.ts        # appid/支付授权目录绑定接口
│   ├── merchant-key.ts          # 商户 key 接口
│   ├── code-plate.ts            # 码牌模板、上传及消息查询接口
│   ├── whitelist.ts             # 防切户白名单接口
│   ├── device-transfer.ts       # 机具代理查询及划拨接口
│   └── device-bind-config.ts    # 设备换绑查询、新增及修改接口
├── tools/
│   ├── batch-reset.ts           # 默认批量重置流程
│   ├── custom-channel-reset.ts  # 自定义渠道重置流程
│   ├── payment-config.ts        # 单独绑定微信支付参数流程
│   ├── merchant-key.ts          # 配置商户 key 流程
│   ├── code-plate-transfer.ts   # 码牌划转流程
│   ├── change-whitelist.ts      # 防切户白名单流程
│   ├── device-transfer.ts       # 机具划拨流程
│   └── device-bind-config.ts    # 设备换绑配置：先查询后修改或新增
├── sidepanel/
│   ├── index.html               # Chrome 原生侧边栏入口
│   ├── index.ts                 # 页面交互、表单和结果展示
│   ├── results.ts               # 商户结果列表、状态摘要与复制
│   ├── icons.ts                 # 本地打包的 Lucide 图标
│   └── helpers.ts               # 纯界面辅助函数
├── styles/sidepanel.css
└── types.ts                     # 跨层共享类型
```

收银通与联合收单的默认重置共用 `quick-report.ts`，只通过 `reportMode=SYT/COMMON` 区分。两条业务线的自定义渠道请求共用 `report.ts`，微信支付参数绑定也始终共用 `payment-config.ts`，不再复制两套实现。

- [`chrome-extension/src/sidepanel/index.ts`](/Users/swxswx/Desktop/work/code/Report-Tampermonkey/chrome-extension/src/sidepanel/index.ts)：侧边栏页面交互、表单和结果展示。
- [`chrome-extension/src/api`](/Users/swxswx/Desktop/work/code/Report-Tampermonkey/chrome-extension/src/api)：纯后台接口层，负责请求参数、响应解析和接口级校验，不处理界面。
- [`chrome-extension/src/api/quick-report.ts`](/Users/swxswx/Desktop/work/code/Report-Tampermonkey/chrome-extension/src/api/quick-report.ts)：收银通与联合收单共用的默认批量重置接口。
- `api/mapping.ts`、`api/report.ts`、`api/notification-status.ts`、`api/payment-config.ts`：映射查询、自定义渠道上报、通知状态和微信支付参数接口。
- `api/merchant-key.ts`、`api/code-plate.ts`、`api/whitelist.ts`、`api/device-transfer.ts`：各独立后台能力的接口实现。
- [`chrome-extension/src/tools`](/Users/swxswx/Desktop/work/code/Report-Tampermonkey/chrome-extension/src/tools)：业务流程层，负责组合 API，包括批量重置、自定义渠道重置、参数绑定、商户 key、码牌、白名单和机具划拨。
- [`chrome-extension/src/types.ts`](/Users/swxswx/Desktop/work/code/Report-Tampermonkey/chrome-extension/src/types.ts)：跨模块共用类型，避免 API 层依赖界面层。

修改后应在 `chrome-extension/` 下运行类型检查、测试和构建，再到扩展管理页点击“重新加载”。
