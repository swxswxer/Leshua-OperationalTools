# 运营工具 Chrome 插件

内部使用的 Manifest V3 Chrome 插件，在 `https://om.leshuazf.com/*` 运营后台内注入悬浮工具。插件沿用浏览器当前登录态，不需要油猴脚本，也不向页面暴露控制台全局对象。

## 安装与构建

```bash
cd chrome-extension
npm install
npm run typecheck
npm test
npm run build
```

在 Chrome 打开 `chrome://extensions`，启用开发者模式后选择“加载已解压的扩展程序”，加载 [`chrome-extension/dist`](/Users/swxswx/Desktop/work/code/Report-Tampermonkey/chrome-extension/dist)。

## 功能

- 子商户号重置：支持收银通、联合收单，以及微信、支付宝、全部三个通道；默认批量接口一次最多处理 5 个商户。
- 自定义渠道重置：填写完整的渠道号和渠道主体后，统一执行上报、确认新号启用与旧号关闭流程。
- 微信支付参数绑定：可对新号或商户最新微信映射记录绑定 appid、支付授权目录。
- 配置商户 key：与重置页共用乐刷商户号输入框，支持使用英文 `;` 分隔任意数量的商户号；内部最多同时处理 5 个请求。
- 码牌划转、防切户白名单、机具划拨：分别作为独立工具页面。

“开通在线收款单”已删除，不再提供入口或请求实现。

## 源码结构

依赖方向固定为 `content -> tools -> api`：界面层只调用工具层，工具层编排接口层，接口层不反向引用界面或业务流程。

```text
chrome-extension/src/
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
│   └── device-transfer.ts       # 机具代理查询及划拨接口
├── tools/
│   ├── batch-reset.ts           # 默认批量重置流程
│   ├── custom-channel-reset.ts  # 自定义渠道重置流程
│   ├── payment-config.ts        # 单独绑定微信支付参数流程
│   ├── merchant-key.ts          # 配置商户 key 流程
│   ├── code-plate-transfer.ts   # 码牌划转流程
│   ├── change-whitelist.ts      # 防切户白名单流程
│   └── device-transfer.ts       # 机具划拨流程
├── content/
│   ├── index.ts                 # 悬浮窗和页面交互
│   └── helpers.ts               # 纯界面辅助函数
├── styles/content.css
└── types.ts                     # 跨层共享类型
```

收银通与联合收单的默认重置共用 `quick-report.ts`，只通过 `reportMode=SYT/COMMON` 区分。两条业务线的自定义渠道请求共用 `report.ts`，微信支付参数绑定也始终共用 `payment-config.ts`，不再复制两套实现。

- [`chrome-extension/src/content/index.ts`](/Users/swxswx/Desktop/work/code/Report-Tampermonkey/chrome-extension/src/content/index.ts)：悬浮窗、页面交互、表单和结果展示。
- [`chrome-extension/src/api`](/Users/swxswx/Desktop/work/code/Report-Tampermonkey/chrome-extension/src/api)：纯后台接口层，负责请求参数、响应解析和接口级校验，不处理界面。
- [`chrome-extension/src/api/quick-report.ts`](/Users/swxswx/Desktop/work/code/Report-Tampermonkey/chrome-extension/src/api/quick-report.ts)：收银通与联合收单共用的默认批量重置接口。
- `api/mapping.ts`、`api/report.ts`、`api/notification-status.ts`、`api/payment-config.ts`：映射查询、自定义渠道上报、通知状态和微信支付参数接口。
- `api/merchant-key.ts`、`api/code-plate.ts`、`api/whitelist.ts`、`api/device-transfer.ts`：各独立后台能力的接口实现。
- [`chrome-extension/src/tools`](/Users/swxswx/Desktop/work/code/Report-Tampermonkey/chrome-extension/src/tools)：业务流程层，负责组合 API，包括批量重置、自定义渠道重置、参数绑定、商户 key、码牌、白名单和机具划拨。
- [`chrome-extension/src/types.ts`](/Users/swxswx/Desktop/work/code/Report-Tampermonkey/chrome-extension/src/types.ts)：跨模块共用类型，避免 API 层依赖界面层。

修改后应在 `chrome-extension/` 下运行类型检查、测试和构建，再到扩展管理页点击“重新加载”。
