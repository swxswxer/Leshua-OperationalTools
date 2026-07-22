# 子商户号重置 Tampermonkey 脚本

运营后台脚本集合，用于在 `https://om.leshuazf.com/` 自动重置微信/支付宝子商户号。

当前包含两条业务线：

| 业务线 | 脚本文件 | 当前版本 | 控制台对象 | 悬浮球位置 |
| --- | --- | --- | --- | --- |
| 联合收单 | `lhsd-submch-reset.user.js` | `1.0.1` | `lhsdAutoReport` | 右下角 |
| 收银通 | `syt-submch-reset.user.js` | `1.0.14` | `sytAutoReport` | 右下角上方 |

两个脚本可以同时安装。它们使用不同的面板容器 id，避免悬浮球互相覆盖：

- 联合收单：`lhsd-auto-report-panel`
- 收银通：`syt-auto-report-panel`

`omAutoReport` 仍保留兼容，但两个脚本同时安装时会被后加载的脚本覆盖；维护和调试时请优先使用业务线专属对象。

## 安装地址

使用 Tampermonkey 打开 Raw 地址安装：

```text
https://gitee.com/swxswxer1/submch-reset/raw/master/lhsd-submch-reset.user.js
https://gitee.com/swxswxer1/submch-reset/raw/master/syt-submch-reset.user.js
```

不要使用 `blob` 预览页安装，例如：

```text
https://gitee.com/swxswxer1/submch-reset/blob/master/lhsd-submch-reset.user.js
```

`blob` 地址返回的是 Gitee HTML 页面，不是脚本源码，Tampermonkey 可能无法完成安装或更新。

## 使用方式

1. 登录运营后台。
2. 打开 `https://om.leshuazf.com/` 下的后台页面。
3. 点击右下角“重置”悬浮球。
4. 输入 10 位乐刷商户号。
5. 按需点击“微信重置子商户号”“支付宝重置子商户号”或“全部重置子商户号”。

点击任意重置按钮时，脚本会先清空微信和支付宝两个输出框，避免上一次成功结果残留导致误复制。

收银通脚本额外提供“配置商户 key”按钮。按钮使用当前输入的 10 位乐刷商户号调用 `merchant-key-info.do?method=add`，并根据响应中的“新增成功”和“新增失败”数量判断配置结果。

收银通重置面板提供“是否关闭旧子商户号”复选框，默认勾选。勾选时会在新子商户号启用确认后禁用旧号；取消勾选时会保留旧微信、支付宝子商户号，并将进度中的禁用步骤标记为已跳过。控制台调用可传入 `disableOldSubMch: false` 获得相同行为，未传时默认仍会禁用旧号。

“开通在线收款单”按钮会选择5年内创建时间最新的线下启用微信、支付宝子商户号，依次设置默认通道、开通收款单权限、增加两个支付通道，并将对应经营地址设置为全国。

收银通脚本底部“更多工具”提供“码牌划转”。进入后填写码牌开始编号、码牌结束编号、原代理商和新代理商，脚本会生成后台批量转移模板，并使用与后台页面一致的原生表单 + 隐藏 iframe 方式上传。后台受理后，脚本每 2 秒无缓存查询一次消息中心，最长等待 60 秒，并按消息正文里的码牌范围和代理商编号匹配本次结果。轮询会先按消息ID排除提交前已有记录；发现新消息但四项参数不一致时，会在日志中输出该消息的实际参数，方便定位后台结果格式变化。

“更多工具”还提供“防切户白名单”。手机号、身份证号、营业执照号、结算账号可任选一项或多项填写；多项会并发提交。脚本按字段分别判断后台响应，部分失败时会明确展示失败字段和后台原因，日志不会回显完整敏感数据。

码牌划转结果状态：

- 绿色：消息中心已确认划转成功。
- 红色：上传失败、查询失败或后台返回业务失败，页面和日志会展示具体原因。
- 橙色：后台已受理，但 60 秒内未查询到结果，需要到消息中心确认。

码牌 Excel 由脚本内嵌的官方模板生成，只替换第二行的码牌范围和代理商编号，保留模板原有的样式、共享字符串、WPS 元数据及工作簿结构。码牌编号支持英文字母和数字，并按文本保存，因此大小写和前导零都不会丢失。模板 ZIP 由脚本同步重建，不依赖外部 Excel 或 ZIP 运行库。

执行成功后，输出框会展示新上报的微信/支付宝子商户号，并支持一键复制。复制内容格式：

```text
微信：xxxx
支付宝：xxxx
```

## 业务流程

两个脚本均不再校验前端白名单，安装后即可使用；后台接口是否允许执行仍由当前登录账号的后端权限决定。点击“全部重置子商户号”时，微信和支付宝流程会并行执行，其中一边失败不会中止另一边。

### 联合收单微信

1. 校验乐刷商户号必须是 10 位数字。
2. 调用微信上报接口。
3. 获取上报接口返回的新微信子商户号。
4. 上报后等待 3 秒。
5. 每隔 1.5 秒查询新微信子商户号映射记录。
6. 最近 3 次查询到的“未通知”通道集合一致后，设置新微信子商户号为启用。
7. 查询 5 年内旧启用微信子商户号，并按 `微信子商户号 + payType` 分组禁用旧号。

联合收单微信需要手动启用新上报的“未通知”记录。

### 联合收单支付宝

1. 校验乐刷商户号必须是 10 位数字。
2. 调用支付宝上报接口。
3. 获取新支付宝子商户号。
4. 轮询确认新支付宝子商户号已启用。
5. 查询 5 年内旧启用支付宝子商户号，并按分组禁用旧号。

支付宝上报成功后，新支付宝子商户号默认已启用，因此不需要手动启用新号。

### 收银通微信

1. 校验乐刷商户号必须是 10 位数字。
2. 调用收银通微信上报接口。
3. 从响应 `data.wxMchId` 获取新微信子商户号。
4. 上报后等待 3 秒。
5. 查询新微信子商户号是否已启用；未查到则每隔 2 秒重试，最多重试 3 次。
6. 查询 5 年内旧启用微信子商户号，并按分组禁用旧号。

收银通微信上报参数里 `notice=1` 表示启用通知，新号上报后不需要再手动启用，只需要确认启用成功。

### 收银通支付宝

1. 校验乐刷商户号必须是 10 位数字。
2. 调用收银通支付宝上报接口。
3. 从响应 `data.zfbSubMch` 获取新支付宝子商户号。
4. 轮询确认新支付宝子商户号已启用。
5. 查询 5 年内旧启用支付宝子商户号，并按分组禁用旧号。

## 上报响应差异

联合收单上报接口历史上按字符串子商户号处理：

```json
{
  "respCode": 0,
  "data": "892089924"
}
```

收银通上报接口返回对象，因此脚本会归一化为后续流程使用的字符串。

微信：

```json
{
  "respCode": 0,
  "respMsg": "上报成功",
  "data": {
    "result": 0,
    "msg": "上报成功",
    "wxMchId": "892089924"
  }
}
```

支付宝：

```json
{
  "respCode": 0,
  "respMsg": "上报成功",
  "data": {
    "result": 0,
    "msg": "上报成功",
    "zfbSubMch": "2088580812349129"
  }
}
```

收银通脚本里 `submitWechatReport` 会把 `data.wxMchId` 归一化到 `report.data`；`submitAlipayReport` 会把 `data.zfbSubMch` 归一化到 `report.data`，并保留原始对象到 `rawData`。

## 通道状态设置

状态设置接口按查询到的通道决定要传哪些参数：

| 通道 | 参数名 |
| --- | --- |
| 银联 | `unionStatus` |
| 网联 | `nuccStatus` |
| 网联互联互通 | `interconnectionStatus` |

只传查询结果中实际存在且需要修改的通道参数。比如只有“银联”和“网联互联互通”，就不要传 `nuccStatus`。

状态值约定：

- `1`：启用
- `0`：禁用

禁用旧号时，如果一个分组内某个通道已经是禁用，只传仍为启用的通道。

## 控制台调用

联合收单：

```js
await lhsdAutoReport.wechatAutoReport('9550117355')
await lhsdAutoReport.alipayAutoReport('9550117355')
await lhsdAutoReport.allAutoReport('9550117355')
```

收银通：

```js
await sytAutoReport.wechatAutoReport('9550117355')
await sytAutoReport.alipayAutoReport('9550117355')
await sytAutoReport.allAutoReport('9550117355')
```

`autoReport` 是微信流程别名：

```js
await lhsdAutoReport.autoReport('9550117355')
await sytAutoReport.autoReport('9550117355')
await sytAutoReport.configureMerchantKey('9550117355')
await sytAutoReport.enableOnlineReceipt('9550117355')
```

码牌划转也可以在控制台调用：

```js
await sytAutoReport.transferCodePlates({
  startCode: '0163521800488',
  endCode: '0163521800488',
  sourceAgent: '5267151',
  targetAgent: '3287859',
})
```

防切户白名单也可以在控制台调用：

```js
await sytAutoReport.addMerchantChangeWhitelist({
  mobile: '手机号',
  idCard: '身份证号',
  businessLicense: '营业执照号',
  settlementAccount: '结算账号',
})
```

四个字段至少填写一项，空字段不会提交。

相关底层函数：

- `createCodePlateTransferFile(values)`：基于内嵌官方模板异步生成待上传的 Excel 文件，调用时需要 `await`。
- `queryCodePlateTransferMessages(values)`：查询并解析匹配参数的消息中心记录。
- `submitCodePlateTransfer(values)`：只上传划转任务，不轮询最终结果。
- `transferCodePlates(values, options)`：执行生成、上传和结果轮询完整流程。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `lhsd-submch-reset.user.js` | 联合收单 Tampermonkey 脚本 |
| `syt-submch-reset.user.js` | 收银通 Tampermonkey 脚本 |
| `README.md` | 项目说明和维护入口 |


5. 在 Tampermonkey 中手动检查更新，确认脚本版本已变更。
