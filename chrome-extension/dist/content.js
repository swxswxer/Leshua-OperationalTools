"use strict";
(() => {
  // src/content/quick-report.ts
  function parseMerchantIds(raw) {
    const merchantIds = raw.split(";").map((item) => item.trim()).filter(Boolean);
    if (merchantIds.length === 0) throw new Error("\u8BF7\u81F3\u5C11\u8F93\u5165\u4E00\u4E2A\u4E50\u5237\u5546\u6237\u53F7");
    if (merchantIds.length > 5) throw new Error("\u4E00\u6B21\u6700\u591A\u91CD\u7F6E 5 \u4E2A\u4E50\u5237\u5546\u6237\u53F7");
    const duplicates = merchantIds.filter((item, index) => merchantIds.indexOf(item) !== index);
    if (duplicates.length > 0) throw new Error(`\u4E50\u5237\u5546\u6237\u53F7\u91CD\u590D: ${duplicates[0]}`);
    const invalid = merchantIds.find((item) => !/^\d{10}$/.test(item));
    if (invalid) throw new Error(`\u4E50\u5237\u5546\u6237\u53F7\u5FC5\u987B\u662F 10 \u4F4D\u6570\u5B57: ${invalid}`);
    return merchantIds;
  }
  function requested(type, channel) {
    return type === "ALL" || type === "WECHAT" && channel === "wechat" || type === "ALIPAY" && channel === "alipay";
  }
  function skipped() {
    return { state: "skipped" };
  }
  function failure(error) {
    return { state: "failure", error };
  }
  function readChannelResult(channel, response) {
    if (!response) return failure(`\u63A5\u53E3\u672A\u8FD4\u56DE${channel === "wechat" ? "\u5FAE\u4FE1" : "\u652F\u4ED8\u5B9D"}\u5904\u7406\u7ED3\u679C`);
    const data = response.data;
    const success = String(response.respCode) === "0" && Number(data?.result) === 0;
    const id = channel === "wechat" ? data?.wxMchId : data?.zfbSubMch;
    if (!success) return failure(String(response.respMsg || data?.msg || "\u4E0A\u62A5\u5931\u8D25"));
    if (!id || !/^\d+$/.test(String(id))) return failure("\u4E0A\u62A5\u6210\u529F\u4F46\u672A\u8FD4\u56DE\u5B50\u5546\u6237\u53F7");
    return { state: "success", subMchId: String(id) };
  }
  function isChannel(response, channel) {
    return channel === "wechat" ? response.channel === "\u5FAE\u4FE1" : response.channel === "\u652F\u4ED8\u5B9D";
  }
  function parseQuickReportResponse(payload, merchantIds, reportType) {
    const response = payload;
    const globalError = response?.success === false ? String(response.errMsg || response.data?.respMsg || "\u6279\u91CF\u91CD\u7F6E\u8BF7\u6C42\u5931\u8D25") : String(response?.data?.respCode) !== "0" ? String(response?.data?.respMsg || "\u6279\u91CF\u91CD\u7F6E\u8BF7\u6C42\u5931\u8D25") : "";
    const rows = Array.isArray(response?.data?.data) ? response.data.data : [];
    return merchantIds.map((merchantId) => {
      const row = rows.find((item) => String(item.merchantId) === merchantId);
      const noRowError = globalError || "\u63A5\u53E3\u672A\u8FD4\u56DE\u8BE5\u5546\u6237\u7684\u5904\u7406\u7ED3\u679C";
      const results = row?.results || [];
      const wechat = requested(reportType, "wechat") ? row ? readChannelResult("wechat", results.find((item) => isChannel(item, "wechat"))) : failure(noRowError) : skipped();
      const alipay = requested(reportType, "alipay") ? row ? readChannelResult("alipay", results.find((item) => isChannel(item, "alipay"))) : failure(noRowError) : skipped();
      return {
        merchantId,
        route: "batch",
        wechat,
        alipay
      };
    });
  }
  async function submitQuickReport(merchantIds, reportType, fetchImpl = fetch) {
    const body = new URLSearchParams({
      merchantIds: merchantIds.join(";"),
      reportType,
      reportMode: "SYT"
    });
    const response = await fetchImpl("/lspos/atBatchTask.do?method=quickManualReport", {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest"
      },
      body
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`\u6279\u91CF\u91CD\u7F6E\u8BF7\u6C42\u5931\u8D25 ${response.status}: ${text.slice(0, 200)}`);
    try {
      return parseQuickReportResponse(JSON.parse(text), merchantIds, reportType);
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`\u6279\u91CF\u91CD\u7F6E\u63A5\u53E3\u8FD4\u56DE\u975E JSON \u5185\u5BB9: ${text.slice(0, 200)}`);
      throw error;
    }
  }

  // src/content/helpers.ts
  function channelText(result) {
    if (result.state === "success") return `${result.subMchId}${result.note ? `\uFF08${result.note}\uFF09` : ""}`;
    if (result.state === "skipped") return "\u672A\u6267\u884C";
    return `\u5931\u8D25\uFF1A${result.error || "\u672A\u77E5\u9519\u8BEF"}`;
  }
  function validateChannels(options) {
    if (Boolean(options.channelId) !== Boolean(options.channelName)) {
      throw new Error("\u5FAE\u4FE1\u6E20\u9053\u53F7\u4E0E\u6E20\u9053\u53F7\u4E3B\u4F53\u5FC5\u987B\u540C\u65F6\u586B\u5199");
    }
    if (Boolean(options.sourcePid) !== Boolean(options.sourceName)) {
      throw new Error("\u652F\u4ED8\u5B9D\u6E20\u9053\u53F7\u4E0E\u6E20\u9053\u53F7\u4E3B\u4F53\u5FC5\u987B\u540C\u65F6\u586B\u5199");
    }
  }
  function hasCustomChannel(options) {
    return Boolean(options.channelId || options.channelName || options.sourcePid || options.sourceName);
  }
  function isRequested(type, channel) {
    return type === "ALL" || type === "WECHAT" && channel === "wechat" || type === "ALIPAY" && channel === "alipay";
  }
  function skippedChannel() {
    return { state: "skipped" };
  }
  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("\u6D4F\u89C8\u5668\u62D2\u7EDD\u590D\u5236\u6743\u9650");
  }

  // src/tools/batch-reset.ts
  async function bindWechatPaymentConfigs(api, results, options, log) {
    if (!options.subAppids && !options.jsapiPaths) return;
    for (const result of results) {
      if (result.wechat.state !== "success" || !result.wechat.subMchId) continue;
      try {
        log(`\u5F00\u59CB\u7ED1\u5B9A\u5546\u6237 ${result.merchantId} \u7684\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570`);
        await api.bindWechatPaymentConfig(result.merchantId, result.wechat.subMchId, options);
        log(`\u5546\u6237 ${result.merchantId} \u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570\u7ED1\u5B9A\u5B8C\u6210`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.wechat.note = `\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570\u7ED1\u5B9A\u5931\u8D25\uFF1A${message}`;
        log(`\u5546\u6237 ${result.merchantId} ${result.wechat.note}`, true);
      }
    }
  }
  async function runBatchReset(api, merchantIds, reportType, options, log) {
    const results = await submitQuickReport(merchantIds, reportType);
    if (isRequested(reportType, "wechat")) {
      await bindWechatPaymentConfigs(api, results, options, log);
    }
    return results;
  }

  // src/tools/legacy-reset.ts
  async function runLegacyReset(api, merchantIds, reportType, options, log) {
    const output = [];
    for (const merchantId of merchantIds) {
      const result = {
        merchantId,
        route: "legacy",
        wechat: skippedChannel(),
        alipay: skippedChannel()
      };
      log(`\u5546\u6237 ${merchantId} \u4F7F\u7528\u81EA\u5B9A\u4E49\u6E20\u9053\u65E7\u6D41\u7A0B\u5904\u7406`);
      if (isRequested(reportType, "wechat")) {
        try {
          const response = await api.wechatAutoReport(merchantId, options);
          result.wechat = { state: "success", subMchId: response.newWxSubMchId };
        } catch (error) {
          result.wechat = { state: "failure", error: error instanceof Error ? error.message : String(error) };
        }
      }
      if (isRequested(reportType, "alipay")) {
        try {
          const response = await api.alipayAutoReport(merchantId, options);
          result.alipay = { state: "success", subMchId: response.newZfbSubMchId };
        } catch (error) {
          result.alipay = { state: "failure", error: error instanceof Error ? error.message : String(error) };
        }
      }
      output.push(result);
    }
    return output;
  }

  // src/tools/merchant-key.ts
  async function configureMerchantKey(api, merchantId, log) {
    log(`\u5F00\u59CB\u914D\u7F6E\u5546\u6237 ${merchantId} \u7684 key`);
    await api.configureMerchantKey(merchantId);
    log("\u5546\u6237 key \u914D\u7F6E\u5B8C\u6210");
  }

  // src/tools/online-receipt.ts
  async function enableOnlineReceipt(api, merchantId, log) {
    log(`\u5F00\u59CB\u5F00\u901A\u5546\u6237 ${merchantId} \u7684\u5728\u7EBF\u6536\u6B3E\u5355`);
    await api.enableOnlineReceipt(merchantId, { onLog: log });
    log("\u5728\u7EBF\u6536\u6B3E\u5355\u5F00\u901A\u5B8C\u6210");
  }

  // src/tools/code-plate-transfer.ts
  async function transferCodePlates(api, values, log, onStatus) {
    await api.transferCodePlates(values, { onLog: log, onStatus });
  }

  // src/tools/change-whitelist.ts
  async function addChangeWhitelist(api, values, log, onStatus) {
    await api.addMerchantChangeWhitelist(values, { onLog: log, onStatus });
  }

  // ../syt-submch-reset.user.js
  (function() {
    "use strict";
    const SCRIPT_VERSION = "1.0.14";
    const ORIGIN = "https://om.leshuazf.com";
    const SAAS = `${ORIGIN}/saasadmin`;
    const SYT_OMS = `${ORIGIN}/syt_oms`;
    const USER_CENTER = `${ORIGIN}/lsuser_center`;
    const CODE_PLATE_RESULT_SUBJECT = "\u7801\u724C\u6279\u91CF\u8F6C\u79FB\u5904\u7406\u7ED3\u679C";
    const CODE_PLATE_RESULT_SOURCE = "\u7801\u724C\u7BA1\u7406-\u7801\u724C\u8F6C\u79FB";
    const CODE_PLATE_ACCEPTED_MESSAGE = "\u540E\u53F0\u6279\u91CF\u5904\u7406\u4E2D\uFF0C\u7ED3\u679C\u4EE5\u7CFB\u7EDF\u5185\u6D88\u606F\u901A\u77E5";
    const MERCHANT_CHANGE_WHITELIST_FIELDS = [
      { key: "mobile", dataType: "1", label: "\u624B\u673A\u53F7" },
      { key: "idCard", dataType: "2", label: "\u8EAB\u4EFD\u8BC1\u53F7" },
      { key: "businessLicense", dataType: "3", label: "\u8425\u4E1A\u6267\u7167\u53F7" },
      { key: "settlementAccount", dataType: "4", label: "\u7ED3\u7B97\u8D26\u53F7" }
    ];
    const CODE_PLATE_TEMPLATE_BASE64 = "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";
    const CODE_PLATE_SHEET_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:etc="http://www.wps.cn/officeDocument/2017/etCustomData"><sheetPr/><dimension ref="A1:D2"/><sheetViews><sheetView tabSelected="1" workbookViewId="0"><selection activeCell="D9" sqref="D9"/></sheetView></sheetViews><sheetFormatPr defaultColWidth="9" defaultRowHeight="16.8" outlineLevelRow="1" outlineLevelCol="3"/><cols><col min="1" max="2" width="11.7692307692308"/></cols><sheetData><row r="1" spans="1:4"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row><row r="2" spans="1:4"><c r="A2" s="1" t="s"><v>4</v></c><c r="B2" s="1" t="s"><v>4</v></c><c r="C2"><v>5267151</v></c><c r="D2"><v>3287859</v></c></row></sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><headerFooter/></worksheet>';
    const DEFAULT_WECHAT_CHANNEL_ID = "209096974";
    const DEFAULT_WECHAT_CHANNEL_NAME = "\u6DF1\u5733\u5E02\u524D\u6D77\u626B\u626B\u79D1\u6280\u6709\u9650\u516C\u53F8";
    const DEFAULT_ALIPAY_CHANNEL_ID = "2088621549599695";
    const DEFAULT_ALIPAY_CHANNEL_NAME = "\u4E50\u5237\u652F\u4ED8\u79D1\u6280\u6709\u9650\u516C\u53F8";
    const STATUS = {
      UNNOTIFIED: "\u672A\u901A\u77E5",
      DISABLED: "\u7981\u7528",
      ENABLED: "\u542F\u7528"
    };
    const CHANNEL_STATUS_FIELD = {
      \u94F6\u8054: "unionStatus",
      \u7F51\u8054: "nuccStatus",
      \u7F51\u8054\u4E92\u8054\u4E92\u901A: "interconnectionStatus"
    };
    const CHANNEL_DEFAULT_FIELD = {
      \u94F6\u8054: "unionDefault",
      \u7F51\u8054: "nuccDefault",
      \u7F51\u8054\u4E92\u8054\u4E92\u901A: "interconnectionDefault"
    };
    const STATUS_FIELD_CHANNEL = {
      unionStatus: "\u94F6\u8054",
      nuccStatus: "\u7F51\u8054",
      interconnectionStatus: "\u7F51\u8054\u4E92\u8054\u4E92\u901A"
    };
    const WECHAT_PAYMENT_PRESETS = [
      {
        name: "\u7F8E\u56E2",
        channelId: "755607656",
        channelName: "\u5929\u6D25\u4E09\u5FEB\u98DE\u8DC3\u79D1\u6280\u6709\u9650\u516C\u53F8",
        subAppids: "wx1fde2c33280d64b6;wx0e8672034309be8f",
        jsapiPaths: "https://openpay.meituan.com/;https://openpay-zc.st.meituan.com/"
      },
      {
        name: "\u4E50\u5E97\u5B9D",
        channelId: "835134506",
        channelName: "\u6DF1\u5733\u5BCC\u4E91\u6570\u79D1\u4FE1\u606F\u6280\u672F\u6709\u9650\u516C\u53F8",
        subAppids: "wx76a4c0a8a9ef465b",
        jsapiPaths: ""
      }
    ];
    function pad(value) {
      return String(value).padStart(2, "0");
    }
    function formatDateTime(date) {
      return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
      ].join("-") + " " + [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
      ].join(":");
    }
    function getDateRange(options = {}) {
      const end = /* @__PURE__ */ new Date();
      const start = new Date(end);
      if (options.years) {
        start.setFullYear(start.getFullYear() - options.years);
      } else {
        start.setDate(start.getDate() - (options.days || 1));
      }
      return {
        createStartTime: formatDateTime(start),
        createEndTime: formatDateTime(end)
      };
    }
    function getAroundDateRange(options = {}) {
      const now = /* @__PURE__ */ new Date();
      const start = new Date(now);
      const end = new Date(now);
      start.setDate(start.getDate() - (options.beforeDays || 1));
      end.setDate(end.getDate() + (options.afterDays || 1));
      return {
        createStartTime: formatDateTime(start),
        createEndTime: formatDateTime(end)
      };
    }
    function getDefaultRange() {
      return getDateRange({ days: 1 });
    }
    function uniqueBy(list, keyFn) {
      const seen = /* @__PURE__ */ new Set();
      const result = [];
      list.forEach((item) => {
        const key = keyFn(item);
        if (!key || seen.has(key)) return;
        seen.add(key);
        result.push(item);
      });
      return result;
    }
    function normalizeText(text) {
      return String(text || "").replace(/\s+/g, " ").trim();
    }
    function buildFormBody(params) {
      const body = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        body.set(key, value == null ? "" : String(value));
      });
      return body;
    }
    function getPageFetch() {
      if (typeof unsafeWindow !== "undefined" && unsafeWindow.fetch) {
        return unsafeWindow.fetch.bind(unsafeWindow);
      }
      return window.fetch.bind(window);
    }
    function summarizeHtml(html) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const title = normalizeText(doc.querySelector("title") ? doc.querySelector("title").textContent : "");
      const body = normalizeText(doc.body ? doc.body.textContent : html);
      const summary = [title ? `\u6807\u9898: ${title}` : "", body ? `\u6B63\u6587: ${body.slice(0, 260)}` : ""].filter(Boolean).join("\uFF1B");
      return summary || html.slice(0, 260);
    }
    function getHtmlMessage(html) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      return normalizeText(doc.body ? doc.body.textContent : html);
    }
    function detectHtmlError(html) {
      const message = getHtmlMessage(html);
      if (message.includes("\u6CA1\u6709\u8BE5\u9879\u64CD\u4F5C\u6743\u9650")) {
        return "\u6CA1\u6709\u8BE5\u9879\u64CD\u4F5C\u6743\u9650\uFF0C\u8BF7\u786E\u8BA4\u5F53\u524D\u8D26\u53F7\u5DF2\u5F00\u901A\u8BE5\u540E\u53F0\u64CD\u4F5C\u6743\u9650";
      }
      if (/登录|login|验证码/.test(message)) {
        return "\u5F53\u524D\u767B\u5F55\u6001\u53EF\u80FD\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55\u8FD0\u8425\u540E\u53F0\u540E\u518D\u8BD5";
      }
      return "";
    }
    function looksLikeHtml(text) {
      return /^\s*<!doctype html/i.test(text) || /^\s*<html[\s>]/i.test(text);
    }
    async function requestText(url, options = {}) {
      const fetchImpl = getPageFetch();
      const { accept, headers, timeoutMs, ...fetchOptions } = options;
      const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
      const controller = timeoutMs && !fetchOptions.signal ? new pageWindow.AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      try {
        const response = await fetchImpl(url, {
          credentials: "include",
          redirect: "follow",
          ...fetchOptions,
          ...controller ? { signal: controller.signal } : {},
          headers: {
            Accept: accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "X-Requested-With": "XMLHttpRequest",
            ...headers || {}
          }
        });
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`\u8BF7\u6C42\u5931\u8D25 ${response.status}: ${text.slice(0, 200)}`);
        }
        return text;
      } catch (error) {
        if (controller?.signal.aborted) throw new Error(`\u8BF7\u6C42\u8D85\u65F6\uFF08${timeoutMs}ms\uFF09: ${url}`);
        throw error;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }
    async function requestJson(url, options = {}) {
      const text = await requestText(url, {
        ...options,
        accept: "application/json, text/javascript, */*; q=0.01",
        headers: {
          "Content-Type": "text/json,charset=utf-8",
          ...options.headers || {}
        }
      });
      try {
        return JSON.parse(text);
      } catch (error) {
        const htmlError = looksLikeHtml(text) ? detectHtmlError(text) : "";
        if (htmlError) throw new Error(htmlError);
        const detail = looksLikeHtml(text) ? summarizeHtml(text) : text.slice(0, 260);
        throw new Error(`JSON \u89E3\u6790\u5931\u8D25\uFF0C\u4E0A\u62A5\u63A5\u53E3\u8FD4\u56DE\u4E86\u975E JSON \u5185\u5BB9\u3002${detail}`);
      }
    }
    function normalizeMerchantChangeWhitelistValues(values = {}) {
      return MERCHANT_CHANGE_WHITELIST_FIELDS.reduce((result, field) => {
        result[field.key] = String(values[field.key] || "").trim();
        return result;
      }, {});
    }
    function getMerchantChangeWhitelistItems(values = {}) {
      const normalized = normalizeMerchantChangeWhitelistValues(values);
      return MERCHANT_CHANGE_WHITELIST_FIELDS.filter((field) => normalized[field.key]).map((field) => ({
        ...field,
        dataValue: normalized[field.key]
      }));
    }
    async function addMerchantChangeWhitelistItem(dataType, dataValue, options = {}) {
      const field = MERCHANT_CHANGE_WHITELIST_FIELDS.find((item) => item.dataType === String(dataType));
      if (!field) throw new Error(`\u4E0D\u652F\u6301\u7684\u767D\u540D\u5355\u6570\u636E\u7C7B\u578B: ${dataType}`);
      const normalizedValue = String(dataValue || "").trim();
      if (!normalizedValue) throw new Error(`${field.label}\u4E0D\u80FD\u4E3A\u7A7A`);
      const response = await requestJson(
        options.endpoint || `${SYT_OMS}/merchantChange/addMerchantChangeWhitelist`,
        {
          method: "POST",
          body: JSON.stringify({
            dataType: field.dataType,
            dataValue: normalizedValue
          }),
          timeoutMs: options.timeoutMs == null ? 15e3 : options.timeoutMs,
          headers: {
            "Content-Type": "application/json;charset=UTF-8"
          }
        }
      );
      if (String(response.error_code) !== "0") {
        throw new Error(response.error_msg || `${field.label}\u6DFB\u52A0\u5931\u8D25`);
      }
      return {
        ok: true,
        key: field.key,
        label: field.label,
        dataType: field.dataType,
        response
      };
    }
    async function addMerchantChangeWhitelist(values, options = {}) {
      const items = getMerchantChangeWhitelistItems(values);
      if (items.length === 0) throw new Error("\u8BF7\u81F3\u5C11\u586B\u5199\u624B\u673A\u53F7\u3001\u8EAB\u4EFD\u8BC1\u53F7\u3001\u8425\u4E1A\u6267\u7167\u53F7\u6216\u7ED3\u7B97\u8D26\u53F7\u4E2D\u7684\u4E00\u9879");
      const log = (message2, isError = false) => {
        if (options.onLog) options.onLog(message2, isError);
      };
      const status = (state, message2) => {
        if (options.onStatus) options.onStatus(state, message2);
      };
      status("submitting", `\u6B63\u5728\u5E76\u53D1\u63D0\u4EA4 ${items.length} \u9879\u767D\u540D\u5355`);
      log(`\u5F00\u59CB\u6DFB\u52A0\u9632\u5207\u6237\u767D\u540D\u5355: ${items.map((item) => item.label).join("\u3001")}`);
      const settled = await Promise.allSettled(items.map(async (item) => {
        try {
          const result = await addMerchantChangeWhitelistItem(item.dataType, item.dataValue, options);
          log(`${item.label}\u9632\u5207\u6237\u767D\u540D\u5355\u6DFB\u52A0\u6210\u529F`);
          return result;
        } catch (error) {
          log(`${item.label}\u9632\u5207\u6237\u767D\u540D\u5355\u6DFB\u52A0\u5931\u8D25: ${error.message}`, true);
          throw Object.assign(new Error(error.message), {
            key: item.key,
            label: item.label,
            dataType: item.dataType
          });
        }
      }));
      const successes = [];
      const failures = [];
      settled.forEach((result, index) => {
        if (result.status === "fulfilled") {
          successes.push(result.value);
        } else {
          failures.push({
            key: items[index].key,
            label: items[index].label,
            dataType: items[index].dataType,
            message: result.reason?.message || String(result.reason)
          });
        }
      });
      const summary = {
        ok: failures.length === 0,
        total: items.length,
        successes,
        failures
      };
      if (failures.length > 0) {
        const failureText = failures.map((item) => `${item.label}: ${item.message}`).join("\uFF1B");
        const successText = successes.length > 0 ? `\uFF1B\u5DF2\u6210\u529F: ${successes.map((item) => item.label).join("\u3001")}` : "";
        const message2 = `\u9632\u5207\u6237\u767D\u540D\u5355\u6DFB\u52A0\u5B58\u5728\u5931\u8D25\u9879\uFF1A${failureText}${successText}`;
        status("failure", message2);
        const error = new Error(message2);
        error.result = summary;
        throw error;
      }
      const message = `\u9632\u5207\u6237\u767D\u540D\u5355\u6DFB\u52A0\u5B8C\u6210\uFF1A${successes.map((item) => item.label).join("\u3001")}`;
      status("success", message);
      log(message);
      return summary;
    }
    function getReportDataObject(response) {
      return response && response.data && typeof response.data === "object" ? response.data : {};
    }
    function assertReportBusinessSuccess(response, label) {
      const reportData = getReportDataObject(response);
      if (reportData.result != null && Number(reportData.result) !== 0) {
        throw new Error(`${label}\u4E0A\u62A5\u5931\u8D25: ${reportData.msg || response.respMsg || JSON.stringify(response)}`);
      }
    }
    async function configureMerchantKey2(merchantId) {
      assertMerchantId(merchantId);
      const html = await requestText(`${SAAS}/merchant-key-info.do?method=add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        referrer: `${SAAS}/merchant-key-info.do?method=addPage`,
        body: buildFormBody({
          merchants: merchantId,
          submit: "\u786E\u8BA4\u63D0\u4EA4"
        })
      });
      const htmlError = detectHtmlError(html);
      if (htmlError) throw new Error(htmlError);
      const message = getHtmlMessage(html);
      const successMatch = message.match(/新增成功\s*[：:]\s*(\d+)\s*个/);
      const failureMatch = message.match(/新增失败\s*[：:]\s*(\d+)\s*个/);
      const successCount = successMatch ? Number(successMatch[1]) : 0;
      const failureCount = failureMatch ? Number(failureMatch[1]) : 0;
      if (!successMatch || !failureMatch) {
        throw new Error(`\u65E0\u6CD5\u786E\u8BA4\u5546\u6237 key \u914D\u7F6E\u7ED3\u679C: ${summarizeHtml(html)}`);
      }
      if (successCount < 1 || failureCount > 0) {
        throw new Error(`\u5546\u6237 key \u914D\u7F6E\u5931\u8D25\uFF0C\u65B0\u589E\u6210\u529F ${successCount} \u4E2A\uFF0C\u65B0\u589E\u5931\u8D25 ${failureCount} \u4E2A`);
      }
      return {
        ok: true,
        merchantId,
        successCount,
        failureCount,
        message
      };
    }
    function assertOmsSuccess(response, label, codeField = "error_code") {
      if (!response || String(response[codeField]) !== "0") {
        const message = response?.error_msg || response?.returnDesc || JSON.stringify(response);
        throw new Error(`${label}\u5931\u8D25: ${message}`);
      }
      return response;
    }
    function pickLatestEnabledMappingGroup(rows, type) {
      const subMchIdKey = type === "alipay" ? "zfbSubMchId" : "wxSubMchId";
      const groupMap = /* @__PURE__ */ new Map();
      rows.filter((row) => {
        return normalizeText(row.noticeStatus) === STATUS.ENABLED && String(row.payType || "2") === "2" && /^\d+$/.test(String(row[subMchIdKey] || ""));
      }).forEach((row) => {
        const subMchId = String(row[subMchIdKey]);
        if (!groupMap.has(subMchId)) {
          groupMap.set(subMchId, {
            subMchId,
            payType: "2",
            rows: [],
            latestTime: 0,
            defaultParams: {}
          });
        }
        const group = groupMap.get(subMchId);
        group.rows.push(row);
        group.latestTime = Math.max(group.latestTime, parseLooseDateTime(row.createTime));
        const field = CHANNEL_DEFAULT_FIELD[normalizeText(row.channel)];
        if (field) group.defaultParams[field] = "0";
      });
      return Array.from(groupMap.values()).filter((group) => Object.keys(group.defaultParams).length > 0).sort((left, right) => right.latestTime - left.latestTime)[0] || null;
    }
    function parseDefaultResultHtml(html, defaultParams) {
      const message = getHtmlMessage(html);
      const expectedTexts = Object.keys(defaultParams).map((field) => {
        const channel = Object.entries(CHANNEL_DEFAULT_FIELD).find(([, value]) => value === field)?.[0] || "";
        return `${channel}:\u8BBE\u7F6E\u9ED8\u8BA4\u6210\u529F`;
      });
      return {
        ok: expectedTexts.length > 0 && expectedTexts.every((text) => message.includes(text)),
        message,
        html
      };
    }
    async function setMappingTradeDefault(merchantId, group, type) {
      assertMerchantId(merchantId);
      if (!group || !/^\d+$/.test(String(group.subMchId || ""))) {
        throw new Error(`\u672A\u627E\u5230\u53EF\u8BBE\u7F6E\u9ED8\u8BA4\u7684${type === "alipay" ? "\u652F\u4ED8\u5B9D" : "\u5FAE\u4FE1"}\u5B50\u5546\u6237\u53F7`);
      }
      const isAlipay = type === "alipay";
      const endpoint = isAlipay ? "alipayMappingInfo.do" : "wechatMappingInfo.do";
      const subMchParam = isAlipay ? "zfbSubMchId" : "wxSubMchId";
      const body = buildFormBody({
        merchantId,
        [subMchParam]: group.subMchId,
        payType: group.payType || "2",
        ...group.defaultParams,
        submit: "\u63D0 \u4EA4"
      });
      const html = await requestText(`${SAAS}/${endpoint}?method=setTradeDefault`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        referrer: `${SAAS}/${endpoint}?method=getSetTradeDefaultPage&merchantId=${encodeURIComponent(merchantId)}&${subMchParam}=${encodeURIComponent(group.subMchId)}&payType=${encodeURIComponent(group.payType || "2")}`,
        body
      });
      const htmlError = detectHtmlError(html);
      if (htmlError) throw new Error(htmlError);
      const result = parseDefaultResultHtml(html, group.defaultParams);
      if (!result.ok) throw new Error(`\u8BBE\u7F6E\u9ED8\u8BA4\u7ED3\u679C\u672A\u786E\u8BA4\u6210\u529F: ${result.message}`);
      return result;
    }
    async function openOnlineReceiptAuthority(merchantId) {
      const response = await requestJson(`${SYT_OMS}/syt-online-receipt-manager/batchOpenOnlineReceiptAuthhority`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=UTF-8"
        },
        referrer: `${SYT_OMS}/views/ods/onlineReceiptManagement.html`,
        body: JSON.stringify({ merchantId, branchAuthorityFlag: 0 })
      });
      return assertOmsSuccess(response, "\u5F00\u901A\u5728\u7EBF\u6536\u6B3E\u5355\u6743\u9650", "returnCode");
    }
    async function reportOnlineReceiptChannel(merchantId, subMerchantId) {
      const response = await requestJson(`${SYT_OMS}/syt-online-receipt-manager/report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=UTF-8"
        },
        referrer: `${SYT_OMS}/views/ods/addressManagement.html`,
        body: JSON.stringify({
          hasSubMerchantId: 1,
          feeType: null,
          channel: null,
          channelId: null,
          subMerchantId,
          merchantId
        })
      });
      return assertOmsSuccess(response, `\u589E\u52A0\u901A\u9053\u53F7 ${subMerchantId}`);
    }
    async function queryOnlineReceiptAddresses(merchantId, channel, subMerchantId) {
      const params = new URLSearchParams({
        pageNo: "1",
        pageSize: "20",
        merchantId,
        startTime: "",
        endTime: "",
        channel: String(channel),
        feeType: "",
        applyStatus: "",
        subMerchantId
      });
      const response = await requestJson(`${SYT_OMS}/syt-online-receipt-manager/getBusinessAddresses?${params.toString()}`, {
        method: "GET",
        referrer: `${SYT_OMS}/views/ods/addressManagement.html`
      });
      assertOmsSuccess(response, "\u67E5\u8BE2\u5728\u7EBF\u6536\u6B3E\u5355\u7ECF\u8425\u5730\u5740\u8BB0\u5F55");
      const records = Array.isArray(response?.data?.page?.records) ? response.data.page.records : [];
      return records.filter((record) => {
        return String(record.merchantId) === String(merchantId) && String(record.channel) === String(channel) && String(record.subMerchantId) === String(subMerchantId);
      });
    }
    async function pollOnlineReceiptAddressRecord(merchantId, channel, subMerchantId, options = {}) {
      const intervalMs = options.onlineReceiptPollIntervalMs == null ? 1e3 : options.onlineReceiptPollIntervalMs;
      const timeoutMs = options.onlineReceiptPollTimeoutMs == null ? 15e3 : options.onlineReceiptPollTimeoutMs;
      const deadline = Date.now() + timeoutMs;
      do {
        const records = await queryOnlineReceiptAddresses(merchantId, channel, subMerchantId);
        const record = records.slice().sort((left, right) => {
          return parseLooseDateTime(right.createTime) - parseLooseDateTime(left.createTime);
        })[0];
        if (record?.id) return record;
        if (Date.now() < deadline) await sleep(intervalMs);
      } while (Date.now() < deadline);
      throw new Error(`\u672A\u67E5\u8BE2\u5230\u5B50\u5546\u6237\u53F7 ${subMerchantId} \u7684\u5728\u7EBF\u6536\u6B3E\u5355\u7ECF\u8425\u5730\u5740\u8BB0\u5F55`);
    }
    async function setOnlineReceiptBusinessAddress(id) {
      if (!/^\d+$/.test(String(id || ""))) throw new Error("\u5728\u7EBF\u6536\u6B3E\u5355\u7ECF\u8425\u5730\u5740\u8BB0\u5F55 id \u65E0\u6548");
      const response = await requestJson(`${SYT_OMS}/syt-online-receipt-manager/modifyBusinessAddress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=UTF-8"
        },
        referrer: `${SYT_OMS}/views/ods/addressManagement.html`,
        body: JSON.stringify({
          modifyReason: "1",
          entireCountry: "1",
          cityCode: "0",
          city: " ",
          provinceCode: "0",
          province: " ",
          id: String(id)
        })
      });
      return assertOmsSuccess(response, `\u8BBE\u7F6E\u7ECF\u8425\u5730\u5740\u8BB0\u5F55 ${id}`);
    }
    async function enableOnlineReceipt2(merchantId, options = {}) {
      assertMerchantId(merchantId);
      const log = (message) => {
        if (options.onLog) options.onLog(message);
      };
      log(`\u5F00\u59CB\u67E5\u8BE2\u5546\u6237 ${merchantId} \u7684\u5FAE\u4FE1/\u652F\u4ED8\u5B9D\u542F\u7528\u6620\u5C04\u8BB0\u5F55`);
      const range = getDateRange({ years: 5 });
      const [wechatRows, alipayRows] = await Promise.all([
        queryWechatMappings(merchantId, { ...range, payType: "2", status: "1" }),
        queryAlipayMappings(merchantId, { ...range, payType: "2", status: "1" })
      ]);
      const wechatGroup = pickLatestEnabledMappingGroup(wechatRows, "wechat");
      const alipayGroup = pickLatestEnabledMappingGroup(alipayRows, "alipay");
      if (!wechatGroup) throw new Error("\u672A\u67E5\u8BE2\u5230\u53EF\u7528\u7684\u5FAE\u4FE1\u542F\u7528\u6620\u5C04\u8BB0\u5F55");
      if (!alipayGroup) throw new Error("\u672A\u67E5\u8BE2\u5230\u53EF\u7528\u7684\u652F\u4ED8\u5B9D\u542F\u7528\u6620\u5C04\u8BB0\u5F55");
      log(`\u9009\u4E2D\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7 ${wechatGroup.subMchId}\uFF0C\u901A\u9053: ${wechatGroup.rows.map((row) => row.channel).join("\u3001")}`);
      log(`\u9009\u4E2D\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7 ${alipayGroup.subMchId}\uFF0C\u901A\u9053: ${alipayGroup.rows.map((row) => row.channel).join("\u3001")}`);
      log("\u5F00\u59CB\u8BBE\u7F6E\u5FAE\u4FE1\u9ED8\u8BA4\u901A\u9053\u53F7");
      const wechatDefaultResult = await setMappingTradeDefault(merchantId, wechatGroup, "wechat");
      log("\u5FAE\u4FE1\u9ED8\u8BA4\u901A\u9053\u53F7\u8BBE\u7F6E\u5B8C\u6210");
      log("\u5F00\u59CB\u8BBE\u7F6E\u652F\u4ED8\u5B9D\u9ED8\u8BA4\u901A\u9053\u53F7");
      const alipayDefaultResult = await setMappingTradeDefault(merchantId, alipayGroup, "alipay");
      log("\u652F\u4ED8\u5B9D\u9ED8\u8BA4\u901A\u9053\u53F7\u8BBE\u7F6E\u5B8C\u6210");
      log("\u5F00\u59CB\u5F00\u901A\u5728\u7EBF\u6536\u6B3E\u5355\u6743\u9650");
      const authorityResult = await openOnlineReceiptAuthority(merchantId);
      log("\u5728\u7EBF\u6536\u6B3E\u5355\u6743\u9650\u5F00\u901A\u5B8C\u6210");
      log(`\u5F00\u59CB\u589E\u52A0\u5FAE\u4FE1\u901A\u9053\u53F7 ${wechatGroup.subMchId}`);
      const wechatReportResult = await reportOnlineReceiptChannel(merchantId, wechatGroup.subMchId);
      log("\u5FAE\u4FE1\u901A\u9053\u53F7\u589E\u52A0\u5B8C\u6210");
      log(`\u5F00\u59CB\u589E\u52A0\u652F\u4ED8\u5B9D\u901A\u9053\u53F7 ${alipayGroup.subMchId}`);
      const alipayReportResult = await reportOnlineReceiptChannel(merchantId, alipayGroup.subMchId);
      log("\u652F\u4ED8\u5B9D\u901A\u9053\u53F7\u589E\u52A0\u5B8C\u6210");
      log("\u67E5\u8BE2\u5FAE\u4FE1/\u652F\u4ED8\u5B9D\u5728\u7EBF\u6536\u6B3E\u5355\u7ECF\u8425\u5730\u5740\u8BB0\u5F55");
      const [wechatAddressRecord, alipayAddressRecord] = await Promise.all([
        pollOnlineReceiptAddressRecord(merchantId, 1, wechatGroup.subMchId, options),
        pollOnlineReceiptAddressRecord(merchantId, 2, alipayGroup.subMchId, options)
      ]);
      log(`\u67E5\u8BE2\u5230\u5FAE\u4FE1\u7ECF\u8425\u5730\u5740\u8BB0\u5F55 id: ${wechatAddressRecord.id}`);
      log(`\u67E5\u8BE2\u5230\u652F\u4ED8\u5B9D\u7ECF\u8425\u5730\u5740\u8BB0\u5F55 id: ${alipayAddressRecord.id}`);
      const wechatAddressResult = await setOnlineReceiptBusinessAddress(wechatAddressRecord.id);
      log("\u5FAE\u4FE1\u7ECF\u8425\u5730\u5740\u8BBE\u7F6E\u5B8C\u6210");
      const alipayAddressResult = await setOnlineReceiptBusinessAddress(alipayAddressRecord.id);
      log("\u652F\u4ED8\u5B9D\u7ECF\u8425\u5730\u5740\u8BBE\u7F6E\u5B8C\u6210");
      log(`\u5546\u6237 ${merchantId} \u5728\u7EBF\u6536\u6B3E\u5355\u5F00\u901A\u5B8C\u6210`);
      return {
        merchantId,
        wechatGroup,
        alipayGroup,
        wechatDefaultResult,
        alipayDefaultResult,
        authorityResult,
        wechatReportResult,
        alipayReportResult,
        wechatAddressRecord,
        alipayAddressRecord,
        wechatAddressResult,
        alipayAddressResult
      };
    }
    function getOptionValue(options, key, defaultValue) {
      return Object.prototype.hasOwnProperty.call(options, key) ? String(options[key] == null ? "" : options[key]) : defaultValue;
    }
    function resolveWechatChannelOptions(options = {}) {
      const channelId = normalizeText(options.channelId);
      const channelName = normalizeText(options.channelName);
      if (Boolean(channelId) !== Boolean(channelName)) {
        throw new Error("\u5FAE\u4FE1\u6E20\u9053\u53F7\u4E0E\u6E20\u9053\u53F7\u4E3B\u4F53\u5FC5\u987B\u540C\u65F6\u586B\u5199");
      }
      return {
        channelId: channelId || DEFAULT_WECHAT_CHANNEL_ID,
        channelName: channelName || DEFAULT_WECHAT_CHANNEL_NAME
      };
    }
    function resolveAlipayChannelOptions(options = {}) {
      const sourcePid = normalizeText(options.sourcePid);
      const sourceName = normalizeText(options.sourceName);
      if (Boolean(sourcePid) !== Boolean(sourceName)) {
        throw new Error("\u652F\u4ED8\u5B9D\u6E20\u9053\u53F7\u4E0E\u6E20\u9053\u53F7\u4E3B\u4F53\u5FC5\u987B\u540C\u65F6\u586B\u5199");
      }
      return {
        sourcePid: sourcePid || DEFAULT_ALIPAY_CHANNEL_ID,
        sourceName: sourceName || DEFAULT_ALIPAY_CHANNEL_NAME
      };
    }
    function hasWechatPaymentConfigOptions(options = {}) {
      return Boolean(normalizeText(options.subAppids) || normalizeText(options.jsapiPaths));
    }
    function notifyProgress(options, type, step, status) {
      if (options.onProgress) options.onProgress(type, step, status);
    }
    function notifyReportedSubMchId(options, type, subMchId) {
      if (options.onReportedSubMchId) options.onReportedSubMchId(type, subMchId);
    }
    function parseLooseDateTime(value) {
      const text = normalizeText(value);
      if (!text) return 0;
      return new Date(text.replace(/\.0$/, "").replace(" ", "T")).getTime() || 0;
    }
    async function submitWechatReport(merchantId, options = {}) {
      assertMerchantId(merchantId);
      const channel = resolveWechatChannelOptions(options);
      const params = new URLSearchParams({
        method: "posreport",
        merchantId,
        channelId: channel.channelId,
        channelName: channel.channelName,
        notice: options.notice == null ? "1" : String(options.notice),
        mchId: options.mchId || "1502075691",
        configType: options.configType == null ? "1" : String(options.configType),
        payType: options.payType || "2"
      });
      const data = await requestJson(`${SAAS}/wxsubmch.do?${params.toString()}`, {
        method: "GET",
        headers: {
          Referer: `${SAAS}/wxsubmch.do?method=page`
        }
      });
      if (Number(data.respCode) !== 0) {
        throw new Error(`\u6536\u94F6\u901A\u5FAE\u4FE1\u4E0A\u62A5\u5931\u8D25: ${data.respMsg || JSON.stringify(data)}`);
      }
      assertReportBusinessSuccess(data, "\u6536\u94F6\u901A\u5FAE\u4FE1");
      const wxMchId = normalizeText(getReportDataObject(data).wxMchId || data.wxMchId || data.data);
      if (!/^\d+$/.test(wxMchId)) {
        throw new Error(`\u5FAE\u4FE1\u4E0A\u62A5\u63A5\u53E3\u672A\u8FD4\u56DE\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7: ${JSON.stringify(data)}`);
      }
      return {
        ...data,
        rawData: data.data,
        data: wxMchId,
        wxMchId
      };
    }
    const reportMerchant = submitWechatReport;
    const submitSytWechatReport = submitWechatReport;
    async function submitAlipayReport(merchantId, options = {}) {
      assertMerchantId(merchantId);
      const channel = resolveAlipayChannelOptions(options);
      const params = new URLSearchParams({
        method: "posreport",
        merchantId,
        sourcePid: channel.sourcePid,
        sourceName: channel.sourceName,
        report4M3Flag: options.report4M3Flag == null ? "2" : String(options.report4M3Flag),
        configType: options.configType || "",
        notice: options.notice == null ? "1" : String(options.notice)
      });
      const data = await requestJson(`${SAAS}/zfbsubmch.do?${params.toString()}`, {
        method: "GET",
        headers: {
          Referer: `${SAAS}/zfbsubmch.do?method=page`
        }
      });
      if (Number(data.respCode) !== 0) {
        throw new Error(`\u6536\u94F6\u901A\u652F\u4ED8\u5B9D\u4E0A\u62A5\u5931\u8D25: ${data.respMsg || JSON.stringify(data)}`);
      }
      assertReportBusinessSuccess(data, "\u6536\u94F6\u901A\u652F\u4ED8\u5B9D");
      const zfbSubMch = normalizeText(getReportDataObject(data).zfbSubMch || data.zfbSubMch || data.data);
      if (!/^\d+$/.test(zfbSubMch)) {
        throw new Error(`\u652F\u4ED8\u5B9D\u4E0A\u62A5\u63A5\u53E3\u672A\u8FD4\u56DE\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7: ${JSON.stringify(data)}`);
      }
      return {
        ...data,
        rawData: data.data,
        data: zfbSubMch,
        zfbSubMch
      };
    }
    const submitSytAlipayReport = submitAlipayReport;
    async function queryWechatMappings(merchantId, options = {}) {
      assertMerchantId(merchantId);
      const range = getDateRange({ days: 1 });
      const body = buildFormBody({
        createStartTime: options.createStartTime || range.createStartTime,
        createEndTime: options.createEndTime || range.createEndTime,
        payType: options.payType || "2",
        status: options.status || "",
        isDefault: options.isDefault || "",
        source: options.source || "",
        channelType: options.channelType || "",
        updateStartTime: options.updateStartTime || "",
        updateEndTime: options.updateEndTime || "",
        agentId1g: options.agentId1g || "",
        merchantId,
        wxSubMchId: options.wxSubMchId || "",
        nuccwxMchId: options.nuccwxMchId || "",
        pageSize: options.pageSize || "200"
      });
      const html = await requestText(`${SAAS}/wechatMappingInfo.do?method=page`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: ORIGIN,
          Referer: `${SAAS}/wechatMappingInfo.do?method=page`
        },
        body
      });
      return parseMappingHtml(html, "wechat");
    }
    async function queryAlipayMappings(merchantId, options = {}) {
      assertMerchantId(merchantId);
      const range = getDateRange({ days: 1 });
      const body = buildFormBody({
        createStartTime: options.createStartTime || range.createStartTime,
        createEndTime: options.createEndTime || range.createEndTime,
        payType: options.payType || "2",
        status: options.status || "",
        isDefault: options.isDefault || "",
        source: options.source || "",
        channelType: options.channelType || "",
        updateStartTime: options.updateStartTime || "",
        updateEndTime: options.updateEndTime || "",
        agentId1g: options.agentId1g || "",
        merchantId,
        zfbSubMchId: options.zfbSubMchId || "",
        nuccZfbMchId: options.nuccZfbMchId || "",
        pageSize: options.pageSize || "200"
      });
      const html = await requestText(`${SAAS}/alipayMappingInfo.do?method=page`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: ORIGIN,
          Referer: `${SAAS}/alipayMappingInfo.do?method=page`
        },
        body
      });
      return parseMappingHtml(html, "alipay");
    }
    async function queryWxSubmchConfigRows(merchantId, wxSubMchId, options = {}) {
      assertMerchantId(merchantId);
      if (!/^\d+$/.test(String(wxSubMchId || ""))) {
        throw new Error("\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u4E14\u5FC5\u987B\u4E3A\u6570\u5B57");
      }
      const range = getAroundDateRange({ beforeDays: 1, afterDays: 1 });
      const body = buildFormBody({
        fCreateTimeStart: options.fCreateTimeStart || range.createStartTime,
        fCreateTimeEnd: options.fCreateTimeEnd || range.createEndTime,
        fChannelType: "",
        fPayType: "",
        fStatus: "",
        fCanTrade: "",
        fUpdateTimeStart: "",
        fUpdateTimeEnd: "",
        fChannelId: "",
        fWxSubMchId: wxSubMchId,
        fAgentId1g: "",
        fMerchantId: merchantId,
        fAuthorizeState: "",
        fInUse: "",
        syncPlatform: "",
        page: "1",
        rows: options.rows || "15"
      });
      const data = await requestJson(`${SAAS}/wxsubmch.do?method=list`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Origin: ORIGIN,
          Referer: `${SAAS}/wxsubmch.do?method=page`
        },
        body
      });
      const rows = Array.isArray(data.rows) ? data.rows : [];
      return rows.filter((row) => {
        return normalizeText(row.fMerchantId) === String(merchantId) && normalizeText(row.fWxSubMchId) === String(wxSubMchId);
      });
    }
    function pickLatestWxSubmchConfigRow(rows) {
      return rows.slice().sort((left, right) => {
        return parseLooseDateTime(right.fCreateTime) - parseLooseDateTime(left.fCreateTime);
      })[0] || null;
    }
    async function bindWechatPaymentConfig(merchantId, wxSubMchId, options = {}) {
      const rows = await queryWxSubmchConfigRows(merchantId, wxSubMchId, options);
      const row = pickLatestWxSubmchConfigRow(rows);
      if (!row || !row.fId) {
        throw new Error(`\u672A\u67E5\u8BE2\u5230\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7 ${wxSubMchId} \u5BF9\u5E94\u7684\u914D\u7F6E\u8BB0\u5F55 id`);
      }
      const id = String(row.fId);
      if (options.onConfigRow) options.onConfigRow(row);
      const body = buildFormBody({
        subAppids: getOptionValue(options, "subAppids", ""),
        jsapiPaths: getOptionValue(options, "jsapiPaths", ""),
        id,
        isSubmitted: "1"
      });
      const html = await requestText(`${SAAS}/wxsubmch.do?method=configReport`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: ORIGIN,
          Referer: `${SAAS}/wxsubmch.do?method=getByReportConfigId&reportConfigId=0&id=${encodeURIComponent(id)}`
        },
        body
      });
      const text = summarizeHtml(html);
      if (/没有该项操作权限|失败|错误|异常/.test(text)) {
        throw new Error(`\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570\u7ED1\u5B9A\u5931\u8D25: ${text}`);
      }
      return {
        ok: true,
        id,
        row,
        message: text,
        html
      };
    }
    function parseMappingHtml(html, type = "wechat") {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const subMchHeader = type === "alipay" ? "\u652F\u4ED8\u5B9D\u5546\u6237\u53F7" : "\u5FAE\u4FE1\u5546\u6237\u53F7";
      const table = Array.from(doc.querySelectorAll("table.tablesorter")).find((item) => {
        return normalizeText(item.textContent).includes(subMchHeader) && normalizeText(item.textContent).includes("\u901A\u77E5\u72B6\u6001");
      });
      if (!table) return [];
      const headers = Array.from(table.querySelectorAll("thead th")).map((th) => normalizeText(th.textContent));
      return Array.from(table.querySelectorAll("tbody tr")).map((tr) => {
        const cells = Array.from(tr.querySelectorAll("td"));
        const row = {};
        headers.forEach((header, index) => {
          row[header] = normalizeText(cells[index] ? cells[index].textContent : "");
        });
        const statusLink = cells[0] ? cells[0].querySelector('a[onclick*="getSetTradeStatusPage"]') : null;
        const onclick = statusLink ? statusLink.getAttribute("onclick") || "" : "";
        row.merchantId = row["\u4E50\u5237\u5546\u6237\u53F7"];
        row.wxSubMchId = row["\u5FAE\u4FE1\u5546\u6237\u53F7"] || "";
        row.zfbSubMchId = row["\u652F\u4ED8\u5B9D\u5546\u6237\u53F7"] || "";
        row.subMchId = type === "alipay" ? row.zfbSubMchId : row.wxSubMchId;
        row.nuccwxMchId = row["\u7F51\u8054\u5546\u6237\u53F7"] || "";
        row.nuccZfbMchId = row["\u7F51\u8054\u5546\u6237\u53F7"] || "";
        row.channel = row["\u901A\u9053"];
        row.payTypeName = row["\u8D39\u7387\u7C7B\u578B"];
        row.noticeStatus = row["\u901A\u77E5\u72B6\u6001"];
        row.source = row["\u6765\u6E90"];
        row.createTime = row["\u521B\u5EFA\u65F6\u95F4"];
        row.updateTime = row["\u66F4\u65B0\u65F6\u95F4"];
        row.payType = extractOnclickParam(onclick, "payType") || payTypeNameToCode(row.payTypeName);
        return row;
      }).filter((row) => row.merchantId || row.subMchId);
    }
    function extractOnclickParam(onclick, key) {
      const reg = new RegExp(`${key}=\\+'([^']*)'`);
      const match = onclick.match(reg);
      return match ? match[1] : "";
    }
    function payTypeNameToCode(name) {
      const map = {
        \u7EBF\u4E0A: "1",
        \u7EBF\u4E0B: "2",
        \u516C\u7F34: "3",
        \u516C\u76CA: "4",
        \u4FDD\u9669: "5",
        \u7EFF\u6D32: "6",
        \u9AD8\u6821\u98DF\u5802: "7",
        \u79C1\u7ACB\u4E2D\u5C0F\u5E7C: "8",
        \u670D\u9970\u65E5\u5316: "9",
        \u7EBF\u4E0A\u6279\u53D1: "10"
      };
      return map[normalizeText(name)] || "2";
    }
    function getChannelStatusField(channel) {
      return CHANNEL_STATUS_FIELD[normalizeText(channel)] || "";
    }
    function getStatusName(statusValue) {
      return String(statusValue) === "1" ? STATUS.ENABLED : STATUS.DISABLED;
    }
    function shouldDisableOldSubMch(options = {}) {
      return options.disableOldSubMch !== false;
    }
    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    function normalizeCodePlateTransferValues(values = {}) {
      return {
        startCode: String(values.startCode || "").trim(),
        endCode: String(values.endCode || "").trim(),
        sourceAgent: String(values.sourceAgent || "").trim(),
        targetAgent: String(values.targetAgent || "").trim()
      };
    }
    function assertCodePlateTransferValues(values) {
      const normalized = normalizeCodePlateTransferValues(values);
      if (!normalized.startCode || !normalized.endCode || !normalized.sourceAgent || !normalized.targetAgent) {
        throw new Error("\u8BF7\u5B8C\u6574\u586B\u5199\u56DB\u9879\u5212\u8F6C\u4FE1\u606F");
      }
      if (!/^[A-Za-z0-9]+$/.test(normalized.startCode) || !/^[A-Za-z0-9]+$/.test(normalized.endCode)) {
        throw new Error("\u7801\u724C\u5F00\u59CB\u7F16\u53F7\u548C\u7ED3\u675F\u7F16\u53F7\u53EA\u80FD\u586B\u5199\u82F1\u6587\u5B57\u6BCD\u6216\u6570\u5B57");
      }
      if (normalized.startCode.length !== normalized.endCode.length) {
        throw new Error("\u7801\u724C\u5F00\u59CB\u7F16\u53F7\u548C\u7ED3\u675F\u7F16\u53F7\u957F\u5EA6\u5FC5\u987B\u4E00\u81F4");
      }
      if (/^\d+$/.test(normalized.startCode) && /^\d+$/.test(normalized.endCode) && BigInt(normalized.startCode) > BigInt(normalized.endCode)) {
        throw new Error("\u7801\u724C\u5F00\u59CB\u7F16\u53F7\u4E0D\u80FD\u5927\u4E8E\u7ED3\u675F\u7F16\u53F7");
      }
      if (!/^\d+$/.test(normalized.sourceAgent) || !/^\d+$/.test(normalized.targetAgent)) {
        throw new Error("\u539F\u4EE3\u7406\u5546\u548C\u65B0\u4EE3\u7406\u5546\u53EA\u80FD\u586B\u5199\u6570\u5B57");
      }
      if (!Number.isSafeInteger(Number(normalized.sourceAgent)) || !Number.isSafeInteger(Number(normalized.targetAgent))) {
        throw new Error("\u4EE3\u7406\u5546\u7F16\u53F7\u8D85\u51FA Excel \u53EF\u5B89\u5168\u5904\u7406\u7684\u6570\u5B57\u8303\u56F4");
      }
      if (normalized.sourceAgent === normalized.targetAgent) {
        throw new Error("\u539F\u4EE3\u7406\u5546\u548C\u65B0\u4EE3\u7406\u5546\u4E0D\u80FD\u76F8\u540C");
      }
      return normalized;
    }
    function replaceTemplateCell(sheetXml, cellRef, replacement) {
      const pattern = new RegExp(`<c\\s+[^>]*r=["']${cellRef}["'][^>]*>[\\s\\S]*?<\\/c>`);
      if (!pattern.test(sheetXml)) throw new Error(`\u5B98\u65B9\u6A21\u677F\u7F3A\u5C11\u5355\u5143\u683C ${cellRef}`);
      return sheetXml.replace(pattern, replacement);
    }
    function concatByteArrays(parts) {
      const size = parts.reduce((total, part) => total + part.length, 0);
      const output = new Uint8Array(size);
      let offset = 0;
      parts.forEach((part) => {
        output.set(part, offset);
        offset += part.length;
      });
      return output;
    }
    const CRC32_TABLE = (() => {
      const table = new Uint32Array(256);
      for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
          value = value & 1 ? 3988292384 ^ value >>> 1 : value >>> 1;
        }
        table[index] = value >>> 0;
      }
      return table;
    })();
    function calculateCrc32(bytes) {
      let crc = 4294967295;
      for (let index = 0; index < bytes.length; index += 1) {
        crc = CRC32_TABLE[(crc ^ bytes[index]) & 255] ^ crc >>> 8;
      }
      return (crc ^ 4294967295) >>> 0;
    }
    function decodeBase64Bytes(base64) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes;
    }
    function findZipEndRecord(bytes, view) {
      const lowerBound = Math.max(0, bytes.length - 65557);
      for (let offset = bytes.length - 22; offset >= lowerBound; offset -= 1) {
        if (view.getUint32(offset, true) === 101010256) return offset;
      }
      throw new Error("\u5185\u5D4C\u5B98\u65B9 Excel \u6A21\u677F\u7F3A\u5C11 ZIP \u7ED3\u675F\u8BB0\u5F55");
    }
    function parseTemplateZip(bytes) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const endOffset = findZipEndRecord(bytes, view);
      const entryCount = view.getUint16(endOffset + 10, true);
      const centralOffset = view.getUint32(endOffset + 16, true);
      const commentLength = view.getUint16(endOffset + 20, true);
      const comment = bytes.slice(endOffset + 22, endOffset + 22 + commentLength);
      const decoder = new TextDecoder("utf-8");
      const entries = [];
      let offset = centralOffset;
      for (let index = 0; index < entryCount; index += 1) {
        if (view.getUint32(offset, true) !== 33639248) throw new Error("\u5185\u5D4C\u5B98\u65B9 Excel \u6A21\u677F\u4E2D\u592E\u76EE\u5F55\u635F\u574F");
        const nameLength = view.getUint16(offset + 28, true);
        const extraLength = view.getUint16(offset + 30, true);
        const entryCommentLength = view.getUint16(offset + 32, true);
        const localOffset = view.getUint32(offset + 42, true);
        if (view.getUint32(localOffset, true) !== 67324752) throw new Error("\u5185\u5D4C\u5B98\u65B9 Excel \u6A21\u677F\u6587\u4EF6\u8BB0\u5F55\u635F\u574F");
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const compressedSize = view.getUint32(offset + 20, true);
        const nameBytes = bytes.slice(offset + 46, offset + 46 + nameLength);
        const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
        entries.push({
          name: decoder.decode(nameBytes),
          nameBytes,
          versionMade: view.getUint16(offset + 4, true),
          versionNeeded: view.getUint16(offset + 6, true),
          flags: view.getUint16(offset + 8, true) & ~8,
          method: view.getUint16(offset + 10, true),
          modTime: view.getUint16(offset + 12, true),
          modDate: view.getUint16(offset + 14, true),
          crc32: view.getUint32(offset + 16, true),
          compressedSize,
          uncompressedSize: view.getUint32(offset + 24, true),
          diskStart: view.getUint16(offset + 34, true),
          internalAttributes: view.getUint16(offset + 36, true),
          externalAttributes: view.getUint32(offset + 38, true),
          localExtra: bytes.slice(localOffset + 30 + localNameLength, dataOffset),
          centralExtra: bytes.slice(offset + 46 + nameLength, offset + 46 + nameLength + extraLength),
          comment: bytes.slice(offset + 46 + nameLength + extraLength, offset + 46 + nameLength + extraLength + entryCommentLength),
          data: bytes.slice(dataOffset, dataOffset + compressedSize)
        });
        offset += 46 + nameLength + extraLength + entryCommentLength;
      }
      return { entries, comment };
    }
    function createZipLocalRecord(entry) {
      const header = new Uint8Array(30);
      const view = new DataView(header.buffer);
      view.setUint32(0, 67324752, true);
      view.setUint16(4, entry.versionNeeded, true);
      view.setUint16(6, entry.flags, true);
      view.setUint16(8, entry.method, true);
      view.setUint16(10, entry.modTime, true);
      view.setUint16(12, entry.modDate, true);
      view.setUint32(14, entry.crc32, true);
      view.setUint32(18, entry.compressedSize, true);
      view.setUint32(22, entry.uncompressedSize, true);
      view.setUint16(26, entry.nameBytes.length, true);
      view.setUint16(28, entry.localExtra.length, true);
      return concatByteArrays([header, entry.nameBytes, entry.localExtra, entry.data]);
    }
    function createZipCentralRecord(entry) {
      const header = new Uint8Array(46);
      const view = new DataView(header.buffer);
      view.setUint32(0, 33639248, true);
      view.setUint16(4, entry.versionMade, true);
      view.setUint16(6, entry.versionNeeded, true);
      view.setUint16(8, entry.flags, true);
      view.setUint16(10, entry.method, true);
      view.setUint16(12, entry.modTime, true);
      view.setUint16(14, entry.modDate, true);
      view.setUint32(16, entry.crc32, true);
      view.setUint32(20, entry.compressedSize, true);
      view.setUint32(24, entry.uncompressedSize, true);
      view.setUint16(28, entry.nameBytes.length, true);
      view.setUint16(30, entry.centralExtra.length, true);
      view.setUint16(32, entry.comment.length, true);
      view.setUint16(34, entry.diskStart, true);
      view.setUint16(36, entry.internalAttributes, true);
      view.setUint32(38, entry.externalAttributes, true);
      view.setUint32(42, entry.outputOffset, true);
      return concatByteArrays([header, entry.nameBytes, entry.centralExtra, entry.comment]);
    }
    function rebuildTemplateZip(replacements) {
      const template = parseTemplateZip(decodeBase64Bytes(CODE_PLATE_TEMPLATE_BASE64));
      const encoder = new TextEncoder();
      template.entries.forEach((entry) => {
        if (!replacements.has(entry.name)) return;
        entry.data = encoder.encode(replacements.get(entry.name));
        entry.method = 0;
        entry.crc32 = calculateCrc32(entry.data);
        entry.compressedSize = entry.data.length;
        entry.uncompressedSize = entry.data.length;
      });
      const localRecords = [];
      let localSize = 0;
      template.entries.forEach((entry) => {
        entry.outputOffset = localSize;
        const record = createZipLocalRecord(entry);
        localRecords.push(record);
        localSize += record.length;
      });
      const centralRecords = template.entries.map(createZipCentralRecord);
      const centralSize = centralRecords.reduce((total, record) => total + record.length, 0);
      const endRecord = new Uint8Array(22);
      const endView = new DataView(endRecord.buffer);
      endView.setUint32(0, 101010256, true);
      endView.setUint16(8, template.entries.length, true);
      endView.setUint16(10, template.entries.length, true);
      endView.setUint32(12, centralSize, true);
      endView.setUint32(16, localSize, true);
      endView.setUint16(20, template.comment.length, true);
      return concatByteArrays([...localRecords, ...centralRecords, endRecord, template.comment]);
    }
    function createCodePlateTransferFile(values) {
      const normalized = assertCodePlateTransferValues(values);
      const endCodeIndex = normalized.startCode === normalized.endCode ? 4 : 5;
      const sharedStrings = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="6" uniqueCount="${endCodeIndex === 4 ? 5 : 6}">`,
        "<si><t>\u7801\u724C\u5F00\u59CB\u7F16\u53F7</t></si>",
        "<si><t>\u7801\u724C\u7ED3\u675F\u7F16\u53F7</t></si>",
        "<si><t>\u539F\u4EE3\u7406\u5546</t></si>",
        "<si><t>\u65B0\u4EE3\u7406\u5546</t></si>",
        `<si><t>${normalized.startCode}</t></si>`,
        endCodeIndex === 5 ? `<si><t>${normalized.endCode}</t></si>` : "",
        "</sst>"
      ].join("");
      let sheetXml = CODE_PLATE_SHEET_XML;
      sheetXml = replaceTemplateCell(sheetXml, "A2", '<c r="A2" s="1" t="s"><v>4</v></c>');
      sheetXml = replaceTemplateCell(sheetXml, "B2", `<c r="B2" s="1" t="s"><v>${endCodeIndex}</v></c>`);
      sheetXml = replaceTemplateCell(sheetXml, "C2", `<c r="C2"><v>${normalized.sourceAgent}</v></c>`);
      sheetXml = replaceTemplateCell(sheetXml, "D2", `<c r="D2"><v>${normalized.targetAgent}</v></c>`);
      const bytes = rebuildTemplateZip(/* @__PURE__ */ new Map([
        ["xl/sharedStrings.xml", sharedStrings],
        ["xl/worksheets/sheet1.xml", sheetXml]
      ]));
      return new File([bytes], "\u6279\u91CF\u8F6C\u79FB\u6A21\u677F.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
    }
    function parseCodePlateMessageRows(html) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const table = doc.querySelector("table.tablesorter");
      if (!table) {
        const htmlError = detectHtmlError(html);
        if (htmlError) throw new Error(htmlError);
        throw new Error(`\u65E0\u6CD5\u89E3\u6790\u6D88\u606F\u4E2D\u5FC3\u54CD\u5E94: ${summarizeHtml(html)}`);
      }
      const headers = Array.from(table.querySelectorAll("thead th")).map((cell) => normalizeText(cell.textContent));
      const getIndex = (name) => headers.indexOf(name);
      const indexes = {
        id: getIndex("\u6D88\u606FID"),
        subject: getIndex("\u4E3B\u9898"),
        body: getIndex("\u6B63\u6587"),
        source: getIndex("\u6765\u6E90"),
        sendTime: getIndex("\u53D1\u4FE1\u65F6\u95F4")
      };
      if (Object.values(indexes).some((index) => index < 0)) {
        throw new Error("\u6D88\u606F\u4E2D\u5FC3\u8868\u683C\u5B57\u6BB5\u4E0D\u5B8C\u6574\uFF0C\u65E0\u6CD5\u5339\u914D\u7801\u724C\u5212\u8F6C\u7ED3\u679C");
      }
      return Array.from(table.querySelectorAll("tbody tr")).map((row) => {
        const cells = Array.from(row.children);
        return {
          id: normalizeText(cells[indexes.id]?.textContent),
          subject: normalizeText(cells[indexes.subject]?.textContent),
          body: normalizeText(cells[indexes.body]?.textContent),
          source: normalizeText(cells[indexes.source]?.textContent),
          sendTime: normalizeText(cells[indexes.sendTime]?.textContent)
        };
      }).filter((message) => message.id);
    }
    function parseCodePlateResultMessage(message) {
      const jsonText = message.body.match(/\{[^{}]*\}/)?.[0] || "";
      if (!jsonText) return null;
      let data;
      try {
        data = JSON.parse(jsonText);
      } catch (error) {
        return null;
      }
      const resultText = normalizeText(message.body.match(/处理结果[：:]\s*([\s\S]*)$/)?.[1] || "");
      const success = Number(data.fStatus) === 1 && /转移成功/.test(resultText);
      return {
        ...message,
        data,
        resultText,
        success
      };
    }
    function isCodePlateResultForValues(result, values) {
      if (!result) return false;
      return result.subject === CODE_PLATE_RESULT_SUBJECT && result.source === CODE_PLATE_RESULT_SOURCE && String(result.data.fStartNum || "") === values.startCode && String(result.data.fEndNum || "") === values.endCode && String(result.data.fOldAgent || "") === values.sourceAgent && String(result.data.fNewAgent || "") === values.targetAgent;
    }
    function pickNewCodePlateTransferResult(messages, baselineMessageIds) {
      const baselineIds = new Set(Array.from(baselineMessageIds || []).map(String));
      return messages.find((message) => !baselineIds.has(String(message.id))) || null;
    }
    function summarizeCodePlateMessageValues(message) {
      const data = message?.data || {};
      return [
        `\u6D88\u606FID=${message?.id || "\u672A\u77E5"}`,
        `\u5F00\u59CB=${data.fStartNum || "\u7A7A"}`,
        `\u7ED3\u675F=${data.fEndNum || "\u7A7A"}`,
        `\u539F\u4EE3\u7406=${data.fOldAgent || "\u7A7A"}`,
        `\u65B0\u4EE3\u7406=${data.fNewAgent || "\u7A7A"}`
      ].join("\uFF0C");
    }
    async function queryCodePlateTransferMessages(values) {
      const normalized = values ? assertCodePlateTransferValues(values) : null;
      const queryUrl = `${USER_CENTER}/messagePush.do?method=list&_=${Date.now()}`;
      const html = await requestText(queryUrl, {
        method: "POST",
        cache: "no-store",
        timeoutMs: 12e3,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
          Pragma: "no-cache"
        },
        referrer: `${USER_CENTER}/messagePush.do?method=list`,
        body: buildFormBody({
          dateRange: "",
          msgId: "",
          subject: CODE_PLATE_RESULT_SUBJECT,
          type: "",
          status: "",
          system: "saasadmin",
          pageNumber: "1",
          pageSize: "200"
        })
      });
      const messages = parseCodePlateMessageRows(html).map(parseCodePlateResultMessage).filter(Boolean);
      return normalized ? messages.filter((message) => isCodePlateResultForValues(message, normalized)) : messages;
    }
    async function submitCodePlateTransferViaNativeForm(file, options = {}) {
      if (!(file instanceof Blob)) throw new Error("\u5F85\u4E0A\u4F20\u7684\u7801\u724C\u6A21\u677F\u6587\u4EF6\u65E0\u6548");
      const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
      const PageFile = pageWindow.File || File;
      const PageDataTransfer = pageWindow.DataTransfer || DataTransfer;
      const uploadFile = new PageFile([await file.arrayBuffer()], file.name || "\u6279\u91CF\u8F6C\u79FB\u6A21\u677F.xlsx", {
        type: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const dataTransfer = new PageDataTransfer();
      dataTransfer.items.add(uploadFile);
      return new Promise((resolve, reject) => {
        const frameName = `syt-code-plate-upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const iframe = document.createElement("iframe");
        const form = document.createElement("form");
        const fileInput = document.createElement("input");
        const submitInput = document.createElement("input");
        let settled = false;
        let responseListenerAttached = false;
        const cleanup = () => {
          form.remove();
          iframe.remove();
        };
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          cleanup();
          callback(value);
        };
        const timeoutId = setTimeout(() => {
          finish(reject, new Error("\u7801\u724C\u5212\u8F6C\u4E0A\u4F20\u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u540E\u53F0\u767B\u5F55\u72B6\u6001\u540E\u91CD\u8BD5"));
        }, options.uploadTimeoutMs == null ? 3e4 : options.uploadTimeoutMs);
        iframe.name = frameName;
        iframe.style.display = "none";
        iframe.setAttribute("aria-hidden", "true");
        iframe.setAttribute("sandbox", "allow-forms allow-same-origin");
        iframe.addEventListener("load", () => {
          if (!responseListenerAttached) {
            responseListenerAttached = true;
            try {
              pageWindow.HTMLFormElement.prototype.submit.call(form);
            } catch (error) {
              finish(reject, error);
            }
            return;
          }
          try {
            const responseDocument = iframe.contentDocument;
            const html = responseDocument?.documentElement?.outerHTML || "";
            if (!html) throw new Error("\u540E\u53F0\u4E0A\u4F20\u63A5\u53E3\u8FD4\u56DE\u4E86\u7A7A\u9875\u9762");
            finish(resolve, html);
          } catch (error) {
            finish(reject, new Error(`\u65E0\u6CD5\u8BFB\u53D6\u7801\u724C\u5212\u8F6C\u4E0A\u4F20\u54CD\u5E94: ${error.message}`));
          }
        });
        form.method = "POST";
        form.action = options.actionUrl || `${SAAS}/qrCodeState.do?method=distributeBatch`;
        form.enctype = "multipart/form-data";
        form.target = frameName;
        form.acceptCharset = "UTF-8";
        form.style.display = "none";
        fileInput.type = "file";
        fileInput.name = "distributeBatchFormFile";
        fileInput.files = dataTransfer.files;
        submitInput.type = "hidden";
        submitInput.name = "submit";
        submitInput.value = "\u786E\u8BA4\u63D0\u4EA4";
        form.append(fileInput, submitInput);
        document.body.append(iframe, form);
      });
    }
    async function submitCodePlateTransfer(values, options = {}) {
      const normalized = assertCodePlateTransferValues(values);
      const file = options.file || await createCodePlateTransferFile(normalized);
      const html = await submitCodePlateTransferViaNativeForm(file, {
        uploadTimeoutMs: options.uploadTimeoutMs
      });
      const htmlError = detectHtmlError(html);
      if (htmlError) throw new Error(htmlError);
      const message = getHtmlMessage(html);
      if (!message.includes(CODE_PLATE_ACCEPTED_MESSAGE)) {
        throw new Error(`\u65E0\u6CD5\u786E\u8BA4\u7801\u724C\u5212\u8F6C\u4EFB\u52A1\u5DF2\u53D7\u7406: ${summarizeHtml(html)}`);
      }
      return { ok: true, accepted: true, requestMode: "native-form-iframe", message, html, values: normalized };
    }
    async function pollCodePlateTransferResult(values, options = {}) {
      const normalized = assertCodePlateTransferValues(values);
      const baselineIds = new Set(Array.from(options.baselineMessageIds || []).map(String));
      const intervalMs = options.pollIntervalMs == null ? 2e3 : options.pollIntervalMs;
      const timeoutMs = options.pollTimeoutMs == null ? 6e4 : options.pollTimeoutMs;
      const deadline = Date.now() + timeoutMs;
      let successfulQueries = 0;
      let lastQueryError = null;
      const reportedUnmatchedIds = /* @__PURE__ */ new Set();
      const unmatchedMessages = /* @__PURE__ */ new Map();
      while (Date.now() < deadline) {
        await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
        try {
          const messages = await queryCodePlateTransferMessages();
          successfulQueries += 1;
          const newMessages = messages.filter((message) => !baselineIds.has(String(message.id)));
          const matchingMessages = newMessages.filter((message) => isCodePlateResultForValues(message, normalized));
          const result = pickNewCodePlateTransferResult(matchingMessages, baselineIds);
          newMessages.filter((message) => !isCodePlateResultForValues(message, normalized)).forEach((message) => {
            unmatchedMessages.set(String(message.id), message);
            if (!reportedUnmatchedIds.has(String(message.id)) && options.onLog) {
              reportedUnmatchedIds.add(String(message.id));
              options.onLog(`\u53D1\u73B0\u65B0\u7684\u7801\u724C\u5212\u8F6C\u6D88\u606F\uFF0C\u4F46\u53C2\u6570\u4E0E\u672C\u6B21\u4EFB\u52A1\u4E0D\u4E00\u81F4: ${summarizeCodePlateMessageValues(message)}`);
            }
          });
          if (!result) continue;
          if (!result.success) {
            const error = new Error(`\u7801\u724C\u5212\u8F6C\u5931\u8D25: ${result.resultText || result.body}`);
            error.code = "CODE_PLATE_TRANSFER_FAILED";
            error.result = result;
            throw error;
          }
          return { ok: true, timeout: false, result, values: normalized };
        } catch (error) {
          if (error.code === "CODE_PLATE_TRANSFER_FAILED") throw error;
          lastQueryError = error;
          if (options.onLog) options.onLog(`\u6D88\u606F\u4E2D\u5FC3\u67E5\u8BE2\u5931\u8D25\uFF0C\u5C06\u7EE7\u7EED\u91CD\u8BD5: ${error.message}`, true);
        }
      }
      if (successfulQueries === 0 && lastQueryError) {
        throw new Error(`\u6301\u7EED\u65E0\u6CD5\u67E5\u8BE2\u6D88\u606F\u4E2D\u5FC3: ${lastQueryError.message}`);
      }
      return {
        ok: false,
        timeout: true,
        result: null,
        values: normalized,
        unmatchedMessages: Array.from(unmatchedMessages.values())
      };
    }
    async function transferCodePlates2(values, options = {}) {
      const normalized = assertCodePlateTransferValues(values);
      const log = (message, isError = false) => {
        if (options.onLog) options.onLog(message, isError);
      };
      const status = (state, message) => {
        if (options.onStatus) options.onStatus(state, message);
      };
      status("generating", "\u6B63\u5728\u751F\u6210 Excel");
      log(`\u7801\u724C\u5212\u8F6C\u8FD0\u884C\u7248\u672C: ${SCRIPT_VERSION}`);
      log(`\u5F00\u59CB\u751F\u6210\u7801\u724C\u5212\u8F6C Excel: ${normalized.startCode} \u81F3 ${normalized.endCode}`);
      const file = await createCodePlateTransferFile(normalized);
      log(`Excel \u751F\u6210\u5B8C\u6210: ${file.name}\uFF08${file.size} \u5B57\u8282\uFF09`);
      status("preparing", "\u6B63\u5728\u8BFB\u53D6\u6D88\u606F\u4E2D\u5FC3\u57FA\u7EBF");
      log("\u6B63\u5728\u8BB0\u5F55\u6D88\u606F\u4E2D\u5FC3\u57FA\u7EBF");
      const baselineMessages = await queryCodePlateTransferMessages();
      const baselineMessageIds = new Set(baselineMessages.map((message) => message.id));
      status("submitting", "\u6B63\u5728\u63D0\u4EA4\u540E\u53F0");
      log(`\u5F00\u59CB\u63D0\u4EA4\u7801\u724C\u5212\u8F6C: ${normalized.sourceAgent} -> ${normalized.targetAgent}`);
      const submission = await submitCodePlateTransfer(normalized, { file });
      status("waiting", "\u540E\u53F0\u5DF2\u53D7\u7406\uFF0C\u6B63\u5728\u7B49\u5F85\u5904\u7406\u7ED3\u679C");
      log("\u7801\u724C\u5212\u8F6C\u4EFB\u52A1\u5DF2\u53D7\u7406\uFF0C\u5F00\u59CB\u7B49\u5F85\u6D88\u606F\u4E2D\u5FC3\u5904\u7406\u7ED3\u679C");
      const outcome = await pollCodePlateTransferResult(normalized, {
        baselineMessageIds,
        pollIntervalMs: options.pollIntervalMs,
        pollTimeoutMs: options.pollTimeoutMs,
        onLog: options.onLog
      });
      if (outcome.timeout) {
        const unmatchedMessage = outcome.unmatchedMessages?.[0];
        const message = unmatchedMessage ? `\u540E\u53F0\u5DF2\u53D7\u7406\u5E76\u53D1\u73B0\u65B0\u6D88\u606F\uFF0C\u4F46\u53C2\u6570\u672A\u5B8C\u5168\u5339\u914D\uFF0C\u8BF7\u5230\u6D88\u606F\u4E2D\u5FC3\u786E\u8BA4\u3002${summarizeCodePlateMessageValues(unmatchedMessage)}` : "\u540E\u53F0\u5DF2\u53D7\u7406\uFF0C\u4F46\u7B49\u5F85\u7ED3\u679C\u8D85\u65F6\uFF0C\u8BF7\u5230\u6D88\u606F\u4E2D\u5FC3\u786E\u8BA4";
        status("timeout", message);
        log(message);
        return { ...outcome, submission };
      }
      status("success", "\u7801\u724C\u5212\u8F6C\u6210\u529F");
      log(`\u7801\u724C\u5212\u8F6C\u6210\u529F\uFF0C\u6D88\u606FID: ${outcome.result.id}`);
      return { ...outcome, submission };
    }
    function groupRowsForTradeStatus(rows, targetStatusValue, subMchIdKey = "wxSubMchId") {
      const groupMap = /* @__PURE__ */ new Map();
      rows.forEach((row) => {
        const subMchId = row[subMchIdKey] || row.subMchId;
        if (!subMchId) return;
        const key = `${subMchId}__${row.payType || "2"}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            merchantId: row.merchantId,
            subMchId,
            wxSubMchId: row.wxSubMchId || "",
            zfbSubMchId: row.zfbSubMchId || "",
            payType: row.payType || "2",
            rows: [],
            statusParams: {}
          });
        }
        const group = groupMap.get(key);
        const field = getChannelStatusField(row.channel);
        if (!field) return;
        group.rows.push(row);
        group.statusParams[field] = String(targetStatusValue);
      });
      return Array.from(groupMap.values()).filter((group) => Object.keys(group.statusParams).length > 0);
    }
    function pickRowsByStatus(rows, status) {
      return rows.filter((row) => normalizeText(row.noticeStatus) === status);
    }
    function getRowChannelKey(rows) {
      return rows.map((row) => normalizeText(row.channel)).filter(Boolean).sort().join("|");
    }
    function getPollOptions(options = {}) {
      return {
        startDelayMs: options.pollStartDelayMs == null ? 1e3 : options.pollStartDelayMs,
        intervalMs: options.pollIntervalMs == null ? 2e3 : options.pollIntervalMs,
        timeoutMs: options.pollTimeoutMs == null ? 3e4 : options.pollTimeoutMs,
        settleMs: options.settleMs == null ? 2e3 : options.settleMs
      };
    }
    async function queryWechatUnnotifiedOnce(merchantId, wxSubMchId, options = {}) {
      const rows = await queryWechatMappings(merchantId, {
        ...options,
        wxSubMchId,
        ...getDateRange({ days: 1 })
      });
      return {
        rows,
        unnotifiedRows: pickRowsByStatus(rows, STATUS.UNNOTIFIED)
      };
    }
    function buildSetTradeStatusBody(merchantId, subMchParamName, subMchId, payType, statusParams) {
      const params = {
        merchantId,
        [subMchParamName]: subMchId,
        payType
      };
      Object.entries(statusParams).forEach(([key, value]) => {
        if (value !== void 0 && value !== null && value !== "") {
          params[key] = value;
        }
      });
      params.submit = "\u63D0 \u4EA4";
      return buildFormBody(params);
    }
    async function setWechatTradeStatus(merchantId, wxSubMchId, statusParams, options = {}) {
      assertMerchantId(merchantId);
      if (!/^\d+$/.test(String(wxSubMchId || ""))) {
        throw new Error("\u5FAE\u4FE1\u5546\u6237\u53F7\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u4E14\u5FC5\u987B\u4E3A\u6570\u5B57");
      }
      if (!statusParams || Object.keys(statusParams).length === 0) {
        throw new Error("\u81F3\u5C11\u9700\u8981\u4F20\u5165\u4E00\u4E2A\u901A\u9053\u72B6\u6001\u53C2\u6570");
      }
      const payType = options.payType || "2";
      const body = buildSetTradeStatusBody(merchantId, "wxSubMchId", wxSubMchId, payType, statusParams);
      const html = await requestText(`${SAAS}/wechatMappingInfo.do?method=setTradeStatus`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: ORIGIN,
          Referer: `${SAAS}/wechatMappingInfo.do?method=getSetTradeStatusPage&merchantId=${encodeURIComponent(merchantId)}&wxSubMchId=${encodeURIComponent(wxSubMchId)}&payType=${encodeURIComponent(payType)}`
        },
        body
      });
      return parseStatusResultHtml(html, statusParams);
    }
    const setTradeStatus = setWechatTradeStatus;
    async function setAlipayTradeStatus(merchantId, zfbSubMchId, statusParams, options = {}) {
      assertMerchantId(merchantId);
      if (!/^\d+$/.test(String(zfbSubMchId || ""))) {
        throw new Error("\u652F\u4ED8\u5B9D\u5546\u6237\u53F7\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u4E14\u5FC5\u987B\u4E3A\u6570\u5B57");
      }
      if (!statusParams || Object.keys(statusParams).length === 0) {
        throw new Error("\u81F3\u5C11\u9700\u8981\u4F20\u5165\u4E00\u4E2A\u901A\u9053\u72B6\u6001\u53C2\u6570");
      }
      const payType = options.payType || "2";
      const body = buildSetTradeStatusBody(merchantId, "zfbSubMchId", zfbSubMchId, payType, statusParams);
      const html = await requestText(`${SAAS}/alipayMappingInfo.do?method=setTradeStatus`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: ORIGIN,
          Referer: `${SAAS}/alipayMappingInfo.do?method=getSetTradeStatusPage&merchantId=${encodeURIComponent(merchantId)}&zfbSubMchId=${encodeURIComponent(zfbSubMchId)}&payType=${encodeURIComponent(payType)}`
        },
        body
      });
      return parseStatusResultHtml(html, statusParams);
    }
    function parseStatusResultHtml(html, statusParams) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const text = normalizeText(doc.body ? doc.body.textContent : html);
      const expectedTexts = Object.entries(statusParams || {}).map(([field, value]) => {
        return `${STATUS_FIELD_CHANNEL[field] || ""}:${getStatusName(value)}\u6210\u529F`;
      });
      return {
        ok: expectedTexts.length > 0 && expectedTexts.every((targetText) => text.includes(targetText)),
        message: text,
        html
      };
    }
    async function setWechatStatusGroups(merchantId, groups, options = {}) {
      assertMerchantId(merchantId);
      const changedGroups = [];
      for (const group of groups) {
        if (options.onGroup) options.onGroup(group);
        const result = await setWechatTradeStatus(merchantId, group.wxSubMchId || group.subMchId, group.statusParams, {
          payType: group.payType
        });
        changedGroups.push({ ...group, result });
        if (!result.ok) {
          throw new Error(`\u8BBE\u7F6E ${group.wxSubMchId} \u672A\u786E\u8BA4\u6210\u529F: ${result.message}`);
        }
      }
      return changedGroups;
    }
    async function setAlipayStatusGroups(merchantId, groups, options = {}) {
      assertMerchantId(merchantId);
      const changedGroups = [];
      for (const group of groups) {
        if (options.onGroup) options.onGroup(group);
        const result = await setAlipayTradeStatus(merchantId, group.zfbSubMchId || group.subMchId, group.statusParams, {
          payType: group.payType
        });
        changedGroups.push({ ...group, result });
        if (!result.ok) {
          throw new Error(`\u8BBE\u7F6E\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7 ${group.zfbSubMchId || group.subMchId} \u672A\u786E\u8BA4\u6210\u529F: ${result.message}`);
        }
      }
      return changedGroups;
    }
    async function pollWechatNewMappings(merchantId, wxSubMchId, options = {}) {
      assertMerchantId(merchantId);
      const firstDelayMs = options.wechatFirstQueryDelayMs == null ? 3e3 : options.wechatFirstQueryDelayMs;
      const confirmIntervalMs = options.wechatConfirmIntervalMs == null ? 1500 : options.wechatConfirmIntervalMs;
      const timeoutMs = options.pollTimeoutMs == null ? 3e4 : options.pollTimeoutMs;
      const startedAt = Date.now();
      const snapshots = [];
      await sleep(firstDelayMs);
      while (Date.now() - startedAt <= timeoutMs) {
        const snapshot = await queryWechatUnnotifiedOnce(merchantId, wxSubMchId, options);
        snapshots.push(snapshot);
        if (snapshots.length > 3) snapshots.shift();
        const channelKeys2 = snapshots.map((item) => getRowChannelKey(item.unnotifiedRows));
        if (snapshots.length === 3 && channelKeys2[0] && channelKeys2.every((channelKey) => channelKey === channelKeys2[0])) {
          const lastSnapshot = snapshots[snapshots.length - 1];
          return {
            rows: lastSnapshot.rows,
            unnotifiedRows: lastSnapshot.unnotifiedRows
          };
        }
        await sleep(confirmIntervalMs);
      }
      const channelKeys = snapshots.map((snapshot) => getRowChannelKey(snapshot.unnotifiedRows));
      throw new Error(`\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7 ${wxSubMchId} \u7684\u672A\u901A\u77E5\u901A\u9053\u672A\u5728\u8D85\u65F6\u65F6\u95F4\u5185\u7A33\u5B9A: ${channelKeys.join(" -> ") || "\u65E0"}`);
    }
    async function enableNewWechatMappings(merchantId, wxSubMchId, options = {}) {
      const { rows, unnotifiedRows } = await pollWechatNewMappings(merchantId, wxSubMchId, options);
      const groups = groupRowsForTradeStatus(unnotifiedRows, "1", "wxSubMchId");
      if (groups.length === 0) {
        throw new Error(`\u672A\u627E\u5230\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7 ${wxSubMchId} \u53EF\u542F\u7528\u7684\u901A\u9053`);
      }
      const changedGroups = await setWechatStatusGroups(merchantId, groups, options);
      return {
        rows,
        unnotifiedRows,
        groups,
        changedGroups
      };
    }
    async function pollWechatEnabledMappings(merchantId, wxSubMchId, options = {}) {
      assertMerchantId(merchantId);
      const firstDelayMs = options.wechatFirstQueryDelayMs == null ? 3e3 : options.wechatFirstQueryDelayMs;
      const intervalMs = options.wechatConfirmIntervalMs == null ? 2e3 : options.wechatConfirmIntervalMs;
      const maxRetries = options.wechatConfirmRetries == null ? 3 : options.wechatConfirmRetries;
      await sleep(firstDelayMs);
      for (let index = 0; index <= maxRetries; index += 1) {
        if (index > 0) await sleep(intervalMs);
        const rows = await queryWechatMappings(merchantId, {
          ...options,
          wxSubMchId,
          ...getDateRange({ days: 1 })
        });
        const enabledRows = pickRowsByStatus(rows, STATUS.ENABLED);
        if (enabledRows.length > 0) {
          return { rows, enabledRows };
        }
      }
      throw new Error(`\u8F6E\u8BE2\u8D85\u65F6\uFF0C\u672A\u67E5\u8BE2\u5230\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7 ${wxSubMchId} \u7684\u542F\u7528\u6620\u5C04\u8BB0\u5F55`);
    }
    async function confirmNewWechatMappings(merchantId, wxSubMchId, options = {}) {
      return pollWechatEnabledMappings(merchantId, wxSubMchId, options);
    }
    async function disableOldEnabledWechatMappings(merchantId, newWxSubMchId, options = {}) {
      const rows = await queryWechatMappings(merchantId, {
        ...options,
        wxSubMchId: "",
        ...getDateRange({ years: 5 })
      });
      const enabledRows = rows.filter((row) => {
        return row.wxSubMchId !== newWxSubMchId && normalizeText(row.noticeStatus) === STATUS.ENABLED;
      });
      const groups = groupRowsForTradeStatus(enabledRows, "0", "wxSubMchId");
      const changedGroups = await setWechatStatusGroups(merchantId, groups, options);
      return {
        rows,
        enabledRows,
        groups,
        changedGroups
      };
    }
    async function pollAlipayNewMappings(merchantId, zfbSubMchId, options = {}) {
      assertMerchantId(merchantId);
      const { startDelayMs, intervalMs, timeoutMs, settleMs } = getPollOptions(options);
      const startedAt = Date.now();
      let firstEnabledAt = 0;
      let lastChannelKey = "";
      let stableChannelCount = 0;
      let latestRows = [];
      let latestEnabledRows = [];
      await sleep(startDelayMs);
      while (Date.now() - startedAt <= timeoutMs) {
        const rows = await queryAlipayMappings(merchantId, {
          ...options,
          zfbSubMchId,
          ...getDateRange({ days: 1 })
        });
        const enabledRows = pickRowsByStatus(rows, STATUS.ENABLED);
        if (enabledRows.length > 0) {
          const channelKey = getRowChannelKey(enabledRows);
          latestRows = rows;
          latestEnabledRows = enabledRows;
          if (!firstEnabledAt) firstEnabledAt = Date.now();
          if (channelKey === lastChannelKey) {
            stableChannelCount += 1;
          } else {
            stableChannelCount = 1;
            lastChannelKey = channelKey;
          }
          if (Date.now() - firstEnabledAt >= settleMs && stableChannelCount >= 2) {
            return { rows: latestRows, enabledRows: latestEnabledRows };
          }
        }
        await sleep(intervalMs);
      }
      if (latestEnabledRows.length > 0) {
        return { rows: latestRows, enabledRows: latestEnabledRows };
      }
      throw new Error(`\u8F6E\u8BE2\u8D85\u65F6\uFF0C\u672A\u67E5\u8BE2\u5230\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7 ${zfbSubMchId} \u7684\u542F\u7528\u6620\u5C04\u8BB0\u5F55`);
    }
    async function confirmNewAlipayMappings(merchantId, zfbSubMchId, options = {}) {
      return pollAlipayNewMappings(merchantId, zfbSubMchId, options);
    }
    async function disableOldEnabledAlipayMappings(merchantId, newZfbSubMchId, options = {}) {
      const rows = await queryAlipayMappings(merchantId, {
        ...options,
        zfbSubMchId: "",
        ...getDateRange({ years: 5 })
      });
      const enabledRows = rows.filter((row) => {
        return row.zfbSubMchId !== newZfbSubMchId && normalizeText(row.noticeStatus) === STATUS.ENABLED;
      });
      const groups = groupRowsForTradeStatus(enabledRows, "0", "zfbSubMchId");
      const changedGroups = await setAlipayStatusGroups(merchantId, groups, options);
      return {
        rows,
        enabledRows,
        groups,
        changedGroups
      };
    }
    async function wechatAutoReport(merchantId, options = {}) {
      assertMerchantId(merchantId);
      const logs = [];
      const log = (message) => {
        logs.push(`[${formatDateTime(/* @__PURE__ */ new Date())}] ${message}`);
        if (options.onLog) options.onLog(message, logs.slice());
      };
      let report;
      let newWxSubMchId;
      try {
        const channel = resolveWechatChannelOptions(options);
        log(`\u5F00\u59CB\u5FAE\u4FE1\u4E0A\u62A5\u5546\u6237 ${merchantId}`);
        log("\u5FAE\u4FE1\u4E0A\u62A5\u6309\u94AE: \u6536\u94F6\u901A\u4E0A\u62A5");
        log(`\u5FAE\u4FE1\u4E0A\u62A5\u6E20\u9053: ${channel.channelId} ${channel.channelName}`);
        report = await submitWechatReport(merchantId, options);
        newWxSubMchId = String(report.data);
        log(`\u4E0A\u62A5\u4EFB\u52A1\u5DF2\u63D0\u4EA4\uFF0C\u8FD4\u56DE\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7: ${newWxSubMchId}`);
        notifyReportedSubMchId(options, "wechat", newWxSubMchId);
        notifyProgress(options, "wechat", "report", "success");
      } catch (error) {
        notifyProgress(options, "wechat", "report", "error");
        throw error;
      }
      const enableResult = null;
      let confirmResult;
      try {
        log("\u7B49\u5F85 3 \u79D2\u540E\u67E5\u8BE2\u65B0\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7\u542F\u7528\u72B6\u6001\uFF0C\u6CA1\u6709\u67E5\u5230\u5219\u6BCF\u9694 2 \u79D2\u91CD\u8BD5\uFF0C\u6700\u591A\u91CD\u8BD5 3 \u6B21");
        confirmResult = await confirmNewWechatMappings(merchantId, newWxSubMchId, options);
        log(`\u65B0\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7\u5DF2\u542F\u7528\uFF0C\u67E5\u8BE2\u5230 ${confirmResult.enabledRows.length} \u6761\u542F\u7528\u8BB0\u5F55`);
        notifyProgress(options, "wechat", "enable", "success");
      } catch (error) {
        notifyProgress(options, "wechat", "enable", "error");
        throw error;
      }
      let disableResult;
      if (shouldDisableOldSubMch(options)) {
        try {
          log("\u67E5\u8BE2 5 \u5E74\u5185\u65E7\u542F\u7528\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7\u5E76\u7981\u7528");
          disableResult = await disableOldEnabledWechatMappings(merchantId, newWxSubMchId, {
            ...options,
            onGroup: (group) => {
              const paramsText = Object.entries(group.statusParams).map(([key, value]) => `${key}=${value}`).join("&");
              log(`\u7981\u7528\u65E7\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7 ${group.wxSubMchId}: ${paramsText}`);
            }
          });
          log(`\u65E7\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7\u7981\u7528\u5B8C\u6210\uFF0C\u5904\u7406 ${disableResult.changedGroups.length} \u4E2A\u5206\u7EC4`);
          notifyProgress(options, "wechat", "disable", "success");
        } catch (error) {
          notifyProgress(options, "wechat", "disable", "error");
          throw error;
        }
      } else {
        disableResult = { skipped: true, changedGroups: [] };
        log("\u672A\u52FE\u9009\u201C\u662F\u5426\u5173\u95ED\u65E7\u5B50\u5546\u6237\u53F7\u201D\uFF0C\u5DF2\u4FDD\u7559\u65E7\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7");
        notifyProgress(options, "wechat", "disable", "skipped");
      }
      let paymentConfigResult = null;
      if (hasWechatPaymentConfigOptions(options)) {
        log("\u68C0\u6D4B\u5230\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570\uFF0C\u5F00\u59CB\u7ED1\u5B9A appid / \u652F\u4ED8\u6388\u6743\u76EE\u5F55");
        try {
          paymentConfigResult = await bindWechatPaymentConfig(merchantId, newWxSubMchId, {
            ...options,
            onConfigRow: (row) => log(`\u67E5\u8BE2\u5230\u5FAE\u4FE1\u914D\u7F6E\u8BB0\u5F55 id: ${row.fId}`)
          });
          log("\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570\u7ED1\u5B9A\u5B8C\u6210");
        } catch (error) {
          const errorMessage = `\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570\u7ED1\u5B9A\u5931\u8D25: ${error.message}`;
          paymentConfigResult = {
            ok: false,
            error: error.message
          };
          logs.push(`[${formatDateTime(/* @__PURE__ */ new Date())}] ${errorMessage}`);
          if (options.onLog) options.onLog(errorMessage, true);
        }
      }
      const result = {
        merchantId,
        report,
        newWxSubMchId,
        newReportedWxSubMchId: newWxSubMchId,
        enableResult,
        confirmResult,
        disableResult,
        paymentConfigResult,
        logs
      };
      log(`\u5B8C\u6210\u3002\u65B0\u4E0A\u62A5\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7: ${newWxSubMchId}`);
      return result;
    }
    const autoReport = wechatAutoReport;
    async function alipayAutoReport(merchantId, options = {}) {
      assertMerchantId(merchantId);
      const logs = [];
      const log = (message) => {
        logs.push(`[${formatDateTime(/* @__PURE__ */ new Date())}] ${message}`);
        if (options.onLog) options.onLog(message, logs.slice());
      };
      let report;
      let newZfbSubMchId;
      try {
        const channel = resolveAlipayChannelOptions(options);
        log(`\u5F00\u59CB\u652F\u4ED8\u5B9D\u4E0A\u62A5\u5546\u6237 ${merchantId}`);
        log("\u652F\u4ED8\u5B9D\u4E0A\u62A5\u6309\u94AE: \u6536\u94F6\u901A\u4E0A\u62A5");
        log(`\u652F\u4ED8\u5B9D\u4E0A\u62A5\u6E20\u9053: ${channel.sourcePid} ${channel.sourceName}`);
        report = await submitAlipayReport(merchantId, options);
        newZfbSubMchId = String(report.data);
        log(`\u652F\u4ED8\u5B9D\u4E0A\u62A5\u4EFB\u52A1\u5DF2\u63D0\u4EA4\uFF0C\u8FD4\u56DE\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7: ${newZfbSubMchId}`);
        notifyReportedSubMchId(options, "alipay", newZfbSubMchId);
        notifyProgress(options, "alipay", "report", "success");
      } catch (error) {
        notifyProgress(options, "alipay", "report", "error");
        throw error;
      }
      let confirmResult;
      try {
        log("\u7B49\u5F85 1 \u79D2\u540E\u8F6E\u8BE2\u65B0\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7\u6620\u5C04\u8BB0\u5F55");
        confirmResult = await confirmNewAlipayMappings(merchantId, newZfbSubMchId, options);
        log(`\u65B0\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7\u5DF2\u542F\u7528\uFF0C\u67E5\u8BE2\u5230 ${confirmResult.enabledRows.length} \u6761\u542F\u7528\u8BB0\u5F55`);
        notifyProgress(options, "alipay", "enable", "success");
      } catch (error) {
        notifyProgress(options, "alipay", "enable", "error");
        throw error;
      }
      let disableResult;
      if (shouldDisableOldSubMch(options)) {
        try {
          log("\u67E5\u8BE2 5 \u5E74\u5185\u65E7\u542F\u7528\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7\u5E76\u7981\u7528");
          disableResult = await disableOldEnabledAlipayMappings(merchantId, newZfbSubMchId, {
            ...options,
            onGroup: (group) => {
              const paramsText = Object.entries(group.statusParams).map(([key, value]) => `${key}=${value}`).join("&");
              log(`\u7981\u7528\u65E7\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7 ${group.zfbSubMchId || group.subMchId}: ${paramsText}`);
            }
          });
          log(`\u65E7\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7\u7981\u7528\u5B8C\u6210\uFF0C\u5904\u7406 ${disableResult.changedGroups.length} \u4E2A\u5206\u7EC4`);
          notifyProgress(options, "alipay", "disable", "success");
        } catch (error) {
          notifyProgress(options, "alipay", "disable", "error");
          throw error;
        }
      } else {
        disableResult = { skipped: true, changedGroups: [] };
        log("\u672A\u52FE\u9009\u201C\u662F\u5426\u5173\u95ED\u65E7\u5B50\u5546\u6237\u53F7\u201D\uFF0C\u5DF2\u4FDD\u7559\u65E7\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7");
        notifyProgress(options, "alipay", "disable", "skipped");
      }
      if (hasWechatPaymentConfigOptions(options)) {
        log("\u68C0\u6D4B\u5230\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570\uFF0C\u4F46\u672C\u6B21\u672A\u4EA7\u751F\u65B0\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7\uFF0C\u8DF3\u8FC7\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570\u7ED1\u5B9A");
      }
      const result = {
        merchantId,
        report,
        newZfbSubMchId,
        newReportedZfbSubMchId: newZfbSubMchId,
        confirmResult,
        disableResult,
        logs
      };
      log(`\u5B8C\u6210\u3002\u65B0\u4E0A\u62A5\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7: ${newZfbSubMchId}`);
      return result;
    }
    async function allAutoReport(merchantId, options = {}) {
      const logs = [];
      const onLog = (message, isError) => {
        logs.push(`[${formatDateTime(/* @__PURE__ */ new Date())}] ${message}`);
        if (options.onLog) options.onLog(message, isError === true);
      };
      const [wechatState, alipayState] = await Promise.allSettled([
        wechatAutoReport(merchantId, { ...options, onLog }),
        alipayAutoReport(merchantId, { ...options, onLog })
      ]);
      const failures = [wechatState, alipayState].filter((state) => state.status === "rejected").map((state) => state.reason?.message || String(state.reason));
      if (failures.length > 0) {
        throw new Error(`\u5168\u90E8\u91CD\u7F6E\u5B58\u5728\u5931\u8D25\u6D41\u7A0B: ${failures.join("; ")}`);
      }
      const wechatResult = wechatState.value;
      const alipayResult = alipayState.value;
      return {
        merchantId,
        wechatResult,
        alipayResult,
        newWxSubMchId: wechatResult.newWxSubMchId,
        newZfbSubMchId: alipayResult.newZfbSubMchId,
        logs
      };
    }
    function assertMerchantId(merchantId) {
      if (!/^\d{10}$/.test(String(merchantId || ""))) {
        throw new Error("\u4E50\u5237\u5546\u6237\u53F7\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u4E14\u5FC5\u987B\u4E3A 10 \u4F4D\u6570\u5B57");
      }
    }
    async function copyText2(text) {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
      }
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    function createPanel2() {
      if (document.getElementById("syt-auto-report-panel")) return;
      const style = document.createElement("style");
      style.textContent = `
      #syt-auto-report-panel {
        position: fixed;
        right: 18px;
        bottom: 82px;
        z-index: 2147483647;
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #syt-auto-report-panel * { box-sizing: border-box; }
      #syt-auto-report-panel .float-ball {
        display: none;
        width: 52px;
        height: 52px;
        border: 1px solid #9ec5fe;
        border-radius: 50%;
        color: #fff;
        background: #1f6feb;
        box-shadow: 0 10px 24px rgba(15, 23, 42, .22);
        cursor: pointer;
        font-weight: 700;
        line-height: 1.15;
      }
      #syt-auto-report-panel.collapsed .float-ball {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #syt-auto-report-panel .panel-window {
        width: 360px;
        color: #1f2937;
        background: #fff;
        border: 1px solid #d1d5db;
        box-shadow: 0 12px 32px rgba(15, 23, 42, .18);
      }
      #syt-auto-report-panel.collapsed .panel-window {
        display: none;
      }
      #syt-auto-report-panel .panel-window header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        color: #fff;
        background: #1f6feb;
        font-weight: 700;
      }
      #syt-auto-report-panel button {
        height: 30px;
        border: 1px solid #c7d2fe;
        background: #eff6ff;
        color: #1d4ed8;
        cursor: pointer;
      }
      #syt-auto-report-panel button:disabled {
        cursor: not-allowed;
        color: #6b7280;
        background: #f3f4f6;
        border-color: #d1d5db;
      }
      #syt-auto-report-panel .body { padding: 12px; }
      #syt-auto-report-panel input {
        min-width: 0;
        width: 100%;
        height: 30px;
        padding: 4px 8px;
        border: 1px solid #d1d5db;
        background: #fff;
        background-image: none;
        box-shadow: none;
        color: #111827;
        font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
        font-weight: 400;
        opacity: 1;
        text-shadow: none;
        -webkit-font-smoothing: antialiased;
        filter: none;
      }
      #syt-auto-report-panel input::placeholder {
        color: #6b7280;
        opacity: 1;
        text-shadow: none;
      }
      #syt-auto-report-panel .merchant-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
      }
      #syt-auto-report-panel .merchant-row button {
        min-width: 64px;
      }
      #syt-auto-report-panel .optional-title {
        margin-top: 10px;
        color: #374151;
        font-weight: 700;
      }
      #syt-auto-report-panel .optional-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 10px;
      }
      #syt-auto-report-panel .optional-title-row .optional-title {
        margin-top: 0;
      }
      #syt-auto-report-panel .preset-select {
        min-width: 116px;
        height: 28px;
        border: 1px solid #c7d2fe;
        background: #eff6ff;
        color: #1d4ed8;
        cursor: pointer;
        font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      }
      #syt-auto-report-panel .optional-content {
        display: none;
      }
      #syt-auto-report-panel .optional-content.open {
        display: block;
      }
      #syt-auto-report-panel .optional-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 8px;
      }
      #syt-auto-report-panel .optional-row.single {
        grid-template-columns: 1fr;
      }
      #syt-auto-report-panel .optional-field {
        display: grid;
        grid-template-columns: 86px 1fr;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
      }
      #syt-auto-report-panel .optional-field label {
        color: #374151;
        font-weight: 700;
        line-height: 30px;
      }
      #syt-auto-report-panel pre {
        height: 168px;
        margin: 10px 0 0;
        padding: 8px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
      }
      #syt-auto-report-panel .log-line.error {
        color: #dc2626;
        font-weight: 700;
      }
      #syt-auto-report-panel .actions {
        display: grid;
        grid-template-columns: 1fr;
        gap: 8px;
        margin-top: 8px;
      }
      #syt-auto-report-panel .setting-checkbox {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
        color: #374151;
        font-weight: 700;
        cursor: pointer;
      }
      #syt-auto-report-panel .setting-checkbox input {
        width: 16px;
        height: 16px;
        margin: 0;
        accent-color: #2563eb;
        cursor: pointer;
      }
      #syt-auto-report-panel .panel-header-main {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      #syt-auto-report-panel #syt-tool-view-title {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      #syt-auto-report-panel .panel-back {
        display: none;
        width: 26px;
        min-width: 26px;
        height: 26px;
        padding: 0;
        color: #fff;
        border-color: rgba(255, 255, 255, .45);
        background: transparent;
        font-size: 18px;
        line-height: 1;
      }
      #syt-auto-report-panel .panel-back.visible {
        display: block;
      }
      #syt-auto-report-panel .tool-view {
        display: none;
      }
      #syt-auto-report-panel .tool-view.active {
        display: block;
      }
      #syt-auto-report-panel .more-tools {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid #e5e7eb;
      }
      #syt-auto-report-panel .more-tools-title {
        margin-bottom: 8px;
        color: #374151;
        font-weight: 700;
      }
      #syt-auto-report-panel .more-tools-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      #syt-auto-report-panel .more-tools-actions button {
        width: 100%;
      }
      #syt-auto-report-panel .transfer-section + .transfer-section {
        margin-top: 12px;
      }
      #syt-auto-report-panel .transfer-section-title {
        margin-bottom: 6px;
        color: #374151;
        font-weight: 700;
      }
      #syt-auto-report-panel .transfer-fields {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      #syt-auto-report-panel .transfer-field label {
        display: block;
        margin-bottom: 4px;
        color: #4b5563;
        font-size: 12px;
      }
      #syt-auto-report-panel .transfer-summary {
        min-height: 42px;
        margin-top: 14px;
        padding: 9px 10px;
        color: #374151;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        line-height: 1.55;
        word-break: break-all;
      }
      #syt-auto-report-panel .transfer-summary[data-state="generating"],
      #syt-auto-report-panel .transfer-summary[data-state="preparing"],
      #syt-auto-report-panel .transfer-summary[data-state="submitting"],
      #syt-auto-report-panel .transfer-summary[data-state="waiting"] {
        color: #1d4ed8;
        background: #eff6ff;
        border-color: #93c5fd;
      }
      #syt-auto-report-panel .transfer-summary[data-state="success"] {
        color: #166534;
        background: #f0fdf4;
        border-color: #86efac;
      }
      #syt-auto-report-panel .transfer-summary[data-state="failure"] {
        color: #b91c1c;
        background: #fef2f2;
        border-color: #fca5a5;
      }
      #syt-auto-report-panel .transfer-summary[data-state="timeout"] {
        color: #92400e;
        background: #fffbeb;
        border-color: #fcd34d;
      }
      #syt-auto-report-panel .transfer-error {
        display: none;
        margin-top: 8px;
        color: #dc2626;
        font-weight: 700;
      }
      #syt-auto-report-panel .transfer-error.visible {
        display: block;
      }
      #syt-auto-report-panel .transfer-dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 14px;
      }
      #syt-auto-report-panel .transfer-dialog-actions button {
        min-width: 88px;
      }
      #syt-auto-report-panel .transfer-dialog-actions .primary {
        color: #fff;
        background: #1f6feb;
        border-color: #1d4ed8;
      }
      #syt-auto-report-panel .log-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 8px;
      }
      #syt-auto-report-panel .log-actions button {
        min-width: 96px;
      }
      #syt-auto-report-panel .result-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        align-items: stretch;
        gap: 8px;
        margin-top: 8px;
      }
      #syt-auto-report-panel .result-progress {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 2px;
        min-width: 0;
      }
      #syt-auto-report-panel .progress-step {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        padding: 3px 2px;
        color: #6b7280;
        background: #e5e7eb;
        border: 1px solid #d1d5db;
        font-size: 11px;
        line-height: 1.2;
        text-align: center;
        word-break: break-all;
      }
      #syt-auto-report-panel .progress-step.success {
        color: #fff;
        background: #16a34a;
        border-color: #15803d;
      }
      #syt-auto-report-panel .progress-step.error {
        color: #fff;
        background: #dc2626;
        border-color: #b91c1c;
      }
      #syt-auto-report-panel .progress-step.running {
        color: #78350f;
        background: #fef3c7;
        border-color: #f59e0b;
      }
      #syt-auto-report-panel .progress-step.skipped {
        color: #1e40af;
        background: #dbeafe;
        border-color: #93c5fd;
      }
      #syt-auto-report-panel .progress-step.retryable {
        cursor: pointer;
      }
      #syt-auto-report-panel .progress-step.retryable:hover {
        filter: brightness(1.08);
        box-shadow: 0 0 0 1px rgba(185, 28, 28, .28);
      }
      #syt-auto-report-panel .copy-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
      }
      #syt-auto-report-panel .copy-actions button {
        min-width: 96px;
      }
      #syt-auto-report-panel .log-section {
        display: block;
      }
      #syt-auto-report-panel .log-section:not(.open) pre {
        height: 34px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      #syt-auto-report-panel .log-section:not(.open) .log-line {
        display: none;
      }
      #syt-auto-report-panel .log-section:not(.open) .log-line:last-child {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #syt-auto-report-panel .log-section:not(.open) .log-actions {
        display: none;
      }
      #syt-auto-report-panel .result-label {
        margin-top: 10px;
        color: #374151;
        font-weight: 700;
      }
      #syt-auto-report-panel #om-auto-report-result {
        background: #fff;
        color: #111827;
      }
      #syt-auto-report-panel .close {
        width: 24px;
        height: 24px;
        padding: 0;
        color: #fff;
        border: 1px solid rgba(255,255,255,.4);
        background: transparent;
      }
    `;
      document.head.appendChild(style);
      const panel = document.createElement("div");
      panel.id = "syt-auto-report-panel";
      panel.className = "collapsed";
      panel.innerHTML = `
      <button class="float-ball" type="button" title="\u6253\u5F00\u6536\u94F6\u901A\u91CD\u7F6E\u5B50\u5546\u6237\u53F7\u5DE5\u5177">\u91CD\u7F6E</button>
      <div class="panel-window">
        <header>
          <div class="panel-header-main">
            <button id="syt-tool-view-back" class="panel-back" type="button" title="\u8FD4\u56DE">\u2190</button>
            <span id="syt-tool-view-title">\u6536\u94F6\u901A\u91CD\u7F6E\u5B50\u5546\u6237\u53F7\u5DE5\u5177 v${SCRIPT_VERSION}</span>
          </div>
          <button class="close" type="button" title="\u6536\u8D77">x</button>
        </header>
        <div id="syt-main-tool-view" class="body tool-view active">
          <div class="merchant-row">
            <input id="om-auto-report-merchant" type="text" inputmode="numeric" placeholder="\u4E50\u5237\u5546\u6237\u53F7">
            <button id="om-auto-report-merchant-clear" type="button">\u6E05\u7A7A</button>
          </div>
          <div class="optional-title-row">
            <div class="optional-title">\u53EF\u9009\u53C2\u6570</div>
            <select id="syt-preset-select" class="preset-select" title="\u9009\u62E9\u9884\u8BBE\u914D\u7F6E">
              <option value="none">\u65E0</option>
              <option value="custom">\u81EA\u5B9A\u4E49</option>
              ${WECHAT_PAYMENT_PRESETS.map((preset, index) => `
                <option value="preset-${index}">${preset.name}</option>
              `).join("")}
            </select>
          </div>
          <div id="syt-optional-content" class="optional-content">
            <div class="optional-title">\u5FAE\u4FE1\u4E0A\u62A5\u6E20\u9053\u53F7</div>
            <div class="optional-row">
              <input id="syt-wx-channel-id" type="text" placeholder="\u6E20\u9053\u53F7">
              <input id="syt-wx-channel-name" type="text" placeholder="\u6E20\u9053\u53F7\u4E3B\u4F53">
            </div>
            <div class="optional-title">\u652F\u4ED8\u5B9D\u4E0A\u62A5\u6E20\u9053\u53F7</div>
            <div class="optional-row">
              <input id="syt-alipay-channel-id" type="text" placeholder="\u6E20\u9053\u53F7">
              <input id="syt-alipay-channel-name" type="text" placeholder="\u6E20\u9053\u53F7\u4E3B\u4F53">
            </div>
            <div class="optional-title">\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570</div>
            <div class="optional-field">
              <label for="syt-appid">appid</label>
              <input id="syt-appid" type="text" placeholder="appid">
            </div>
            <div class="optional-field">
              <label for="syt-pay-auth-dir">\u652F\u4ED8\u6388\u6743\u76EE\u5F55</label>
              <input id="syt-pay-auth-dir" type="text" placeholder="\u652F\u4ED8\u6388\u6743\u76EE\u5F55">
            </div>
          </div>
          <label class="setting-checkbox" for="syt-disable-old-submch">
            <input id="syt-disable-old-submch" type="checkbox" checked>
            <span>\u662F\u5426\u5173\u95ED\u65E7\u5B50\u5546\u6237\u53F7</span>
          </label>
          <div class="actions">
            <button id="om-auto-report-wechat" type="button">\u5FAE\u4FE1\u91CD\u7F6E\u5B50\u5546\u6237\u53F7</button>
            <button id="om-auto-report-alipay" type="button">\u652F\u4ED8\u5B9D\u91CD\u7F6E\u5B50\u5546\u6237\u53F7</button>
            <button id="om-auto-report-all" type="button">\u5168\u90E8\u91CD\u7F6E\u5B50\u5546\u6237\u53F7</button>
            <button id="syt-configure-merchant-key" type="button">\u914D\u7F6E\u5546\u6237 key</button>
            <button id="syt-enable-online-receipt" type="button">\u5F00\u901A\u5728\u7EBF\u6536\u6B3E\u5355</button>
          </div>
          <div class="result-label">\u65B0\u4E0A\u62A5\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7</div>
          <div class="result-row">
            <input id="om-auto-report-result" type="text" readonly placeholder="\u6267\u884C\u6210\u529F\u540E\u663E\u793A">
            <div id="om-auto-report-wechat-progress" class="result-progress" aria-label="\u5FAE\u4FE1\u91CD\u7F6E\u8FDB\u5EA6">
              <span class="progress-step" data-step="report">\u4E0A\u62A5</span>
              <span class="progress-step" data-step="enable">\u542F\u7528\u5B50\u5546\u6237\u53F7</span>
              <span class="progress-step" data-step="disable">\u7981\u7528\u65E7\u5B50\u5546\u6237\u53F7</span>
            </div>
          </div>
          <div class="result-label">\u65B0\u4E0A\u62A5\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7</div>
          <div class="result-row">
            <input id="om-auto-report-alipay-result" type="text" readonly placeholder="\u6267\u884C\u6210\u529F\u540E\u663E\u793A">
            <div id="om-auto-report-alipay-progress" class="result-progress" aria-label="\u652F\u4ED8\u5B9D\u91CD\u7F6E\u8FDB\u5EA6">
              <span class="progress-step" data-step="report">\u4E0A\u62A5</span>
              <span class="progress-step" data-step="enable">\u542F\u7528\u5B50\u5546\u6237\u53F7</span>
              <span class="progress-step" data-step="disable">\u7981\u7528\u65E7\u5B50\u5546\u6237\u53F7</span>
            </div>
          </div>
          <div class="copy-actions">
            <button id="om-auto-report-log-toggle" type="button">\u5C55\u5F00\u65E5\u5FD7</button>
            <button id="om-auto-report-copy" type="button" disabled>\u590D\u5236</button>
          </div>
          <div id="om-auto-report-log-section" class="log-section">
            <pre id="om-auto-report-log"></pre>
            <div class="log-actions">
              <button id="om-auto-report-clear" type="button">\u6E05\u7A7A\u65E5\u5FD7</button>
            </div>
          </div>
          <div class="more-tools">
            <div class="more-tools-title">\u66F4\u591A\u5DE5\u5177</div>
            <div class="more-tools-actions">
              <button id="syt-open-code-plate-transfer" type="button">\u7801\u724C\u5212\u8F6C</button>
              <button id="syt-open-change-whitelist" type="button">\u9632\u5207\u6237\u767D\u540D\u5355</button>
            </div>
          </div>
        </div>
        <div id="syt-code-plate-transfer-view" class="body tool-view" aria-labelledby="syt-tool-view-title">
          <div class="transfer-section">
            <div class="transfer-section-title">\u7801\u724C\u8303\u56F4</div>
            <div class="transfer-fields">
              <div class="transfer-field">
                <label for="syt-code-plate-start">\u7801\u724C\u5F00\u59CB\u7F16\u53F7</label>
                <input id="syt-code-plate-start" type="text" autocomplete="off" placeholder="\u8BF7\u8F93\u5165\u5F00\u59CB\u7F16\u53F7">
              </div>
              <div class="transfer-field">
                <label for="syt-code-plate-end">\u7801\u724C\u7ED3\u675F\u7F16\u53F7</label>
                <input id="syt-code-plate-end" type="text" autocomplete="off" placeholder="\u8BF7\u8F93\u5165\u7ED3\u675F\u7F16\u53F7">
              </div>
            </div>
          </div>
          <div class="transfer-section">
            <div class="transfer-section-title">\u4EE3\u7406\u5546</div>
            <div class="transfer-fields">
              <div class="transfer-field">
                <label for="syt-code-plate-source-agent">\u539F\u4EE3\u7406\u5546</label>
                <input id="syt-code-plate-source-agent" type="text" inputmode="numeric" autocomplete="off" placeholder="\u8BF7\u8F93\u5165\u539F\u4EE3\u7406\u5546\u7F16\u53F7">
              </div>
              <div class="transfer-field">
                <label for="syt-code-plate-target-agent">\u65B0\u4EE3\u7406\u5546</label>
                <input id="syt-code-plate-target-agent" type="text" inputmode="numeric" autocomplete="off" placeholder="\u8BF7\u8F93\u5165\u65B0\u4EE3\u7406\u5546\u7F16\u53F7">
              </div>
            </div>
          </div>
          <div id="syt-code-plate-transfer-summary" class="transfer-summary">\u586B\u5199\u5B8C\u6574\u540E\u663E\u793A\u672C\u6B21\u5212\u8F6C\u4FE1\u606F</div>
          <div id="syt-code-plate-transfer-error" class="transfer-error" role="alert"></div>
          <div class="transfer-dialog-actions">
            <button id="syt-cancel-code-plate-transfer" type="button">\u8FD4\u56DE</button>
            <button id="syt-confirm-code-plate-transfer" class="primary" type="button">\u786E\u8BA4\u5212\u8F6C</button>
          </div>
        </div>
        <div id="syt-change-whitelist-view" class="body tool-view" aria-labelledby="syt-tool-view-title">
          <div class="transfer-section">
            <div class="transfer-section-title">\u9632\u5207\u6237\u767D\u540D\u5355</div>
            <div class="transfer-fields">
              <div class="transfer-field">
                <label for="syt-whitelist-mobile">\u624B\u673A\u53F7</label>
                <input id="syt-whitelist-mobile" type="text" inputmode="tel" autocomplete="off" placeholder="\u9009\u586B">
              </div>
              <div class="transfer-field">
                <label for="syt-whitelist-id-card">\u8EAB\u4EFD\u8BC1\u53F7</label>
                <input id="syt-whitelist-id-card" type="text" autocomplete="off" placeholder="\u9009\u586B">
              </div>
              <div class="transfer-field">
                <label for="syt-whitelist-business-license">\u8425\u4E1A\u6267\u7167\u53F7</label>
                <input id="syt-whitelist-business-license" type="text" autocomplete="off" placeholder="\u9009\u586B">
              </div>
              <div class="transfer-field">
                <label for="syt-whitelist-settlement-account">\u7ED3\u7B97\u8D26\u53F7</label>
                <input id="syt-whitelist-settlement-account" type="text" autocomplete="off" placeholder="\u9009\u586B">
              </div>
            </div>
          </div>
          <div id="syt-change-whitelist-summary" class="transfer-summary">\u81F3\u5C11\u586B\u5199\u4E00\u9879\uFF0C\u591A\u9879\u5C06\u5E76\u53D1\u63D0\u4EA4</div>
          <div id="syt-change-whitelist-error" class="transfer-error" role="alert"></div>
          <div class="transfer-dialog-actions">
            <button id="syt-cancel-change-whitelist" type="button">\u8FD4\u56DE</button>
            <button id="syt-confirm-change-whitelist" class="primary" type="button">\u786E\u8BA4\u6DFB\u52A0</button>
          </div>
        </div>
      </div>
    `;
      document.body.appendChild(panel);
      const floatBall = panel.querySelector(".float-ball");
      const input = panel.querySelector("#om-auto-report-merchant");
      const merchantClearButton = panel.querySelector("#om-auto-report-merchant-clear");
      const wxChannelIdInput = panel.querySelector("#syt-wx-channel-id");
      const wxChannelNameInput = panel.querySelector("#syt-wx-channel-name");
      const alipayChannelIdInput = panel.querySelector("#syt-alipay-channel-id");
      const alipayChannelNameInput = panel.querySelector("#syt-alipay-channel-name");
      const appidInput = panel.querySelector("#syt-appid");
      const payAuthDirInput = panel.querySelector("#syt-pay-auth-dir");
      const disableOldSubMchCheckbox = panel.querySelector("#syt-disable-old-submch");
      const logBox = panel.querySelector("#om-auto-report-log");
      const wechatButton = panel.querySelector("#om-auto-report-wechat");
      const alipayButton = panel.querySelector("#om-auto-report-alipay");
      const allButton = panel.querySelector("#om-auto-report-all");
      const configureMerchantKeyButton = panel.querySelector("#syt-configure-merchant-key");
      const enableOnlineReceiptButton = panel.querySelector("#syt-enable-online-receipt");
      const openCodePlateTransferButton = panel.querySelector("#syt-open-code-plate-transfer");
      const openChangeWhitelistButton = panel.querySelector("#syt-open-change-whitelist");
      const mainToolView = panel.querySelector("#syt-main-tool-view");
      const codePlateTransferView = panel.querySelector("#syt-code-plate-transfer-view");
      const changeWhitelistView = panel.querySelector("#syt-change-whitelist-view");
      const toolViewTitle = panel.querySelector("#syt-tool-view-title");
      const toolViewBackButton = panel.querySelector("#syt-tool-view-back");
      const cancelCodePlateTransferButton = panel.querySelector("#syt-cancel-code-plate-transfer");
      const confirmCodePlateTransferButton = panel.querySelector("#syt-confirm-code-plate-transfer");
      const codePlateStartInput = panel.querySelector("#syt-code-plate-start");
      const codePlateEndInput = panel.querySelector("#syt-code-plate-end");
      const sourceAgentInput = panel.querySelector("#syt-code-plate-source-agent");
      const targetAgentInput = panel.querySelector("#syt-code-plate-target-agent");
      const codePlateTransferSummary = panel.querySelector("#syt-code-plate-transfer-summary");
      const codePlateTransferError = panel.querySelector("#syt-code-plate-transfer-error");
      const cancelChangeWhitelistButton = panel.querySelector("#syt-cancel-change-whitelist");
      const confirmChangeWhitelistButton = panel.querySelector("#syt-confirm-change-whitelist");
      const whitelistMobileInput = panel.querySelector("#syt-whitelist-mobile");
      const whitelistIdCardInput = panel.querySelector("#syt-whitelist-id-card");
      const whitelistBusinessLicenseInput = panel.querySelector("#syt-whitelist-business-license");
      const whitelistSettlementAccountInput = panel.querySelector("#syt-whitelist-settlement-account");
      const changeWhitelistSummary = panel.querySelector("#syt-change-whitelist-summary");
      const changeWhitelistError = panel.querySelector("#syt-change-whitelist-error");
      const clearButton = panel.querySelector("#om-auto-report-clear");
      const resultInput = panel.querySelector("#om-auto-report-result");
      const copyButton = panel.querySelector("#om-auto-report-copy");
      const alipayResultInput = panel.querySelector("#om-auto-report-alipay-result");
      const closeButton = panel.querySelector(".close");
      const presetSelect = panel.querySelector("#syt-preset-select");
      const optionalContent = panel.querySelector("#syt-optional-content");
      const logToggleButton = panel.querySelector("#om-auto-report-log-toggle");
      const logSection = panel.querySelector("#om-auto-report-log-section");
      const wechatProgress = panel.querySelector("#om-auto-report-wechat-progress");
      const alipayProgress = panel.querySelector("#om-auto-report-alipay-progress");
      const pageMerchantInput = document.querySelector('input[name="merchantId"], #merchantId');
      if (pageMerchantInput && pageMerchantInput.value) input.value = pageMerchantInput.value.trim();
      const retryContexts = {
        wechat: null,
        alipay: null
      };
      let busy = false;
      let codePlateTransferBusy = false;
      let changeWhitelistBusy = false;
      const appendLog = (line, isError = false) => {
        const time = formatDateTime(/* @__PURE__ */ new Date());
        const row = document.createElement("div");
        row.className = isError === true ? "log-line error" : "log-line";
        row.textContent = `[${time}] ${line}`;
        row.title = row.textContent;
        logBox.appendChild(row);
        logBox.scrollTop = logBox.scrollHeight;
      };
      const setBusy = (nextBusy) => {
        busy = Boolean(nextBusy);
        wechatButton.disabled = busy;
        alipayButton.disabled = busy;
        allButton.disabled = busy;
        configureMerchantKeyButton.disabled = busy;
        enableOnlineReceiptButton.disabled = busy;
        openCodePlateTransferButton.disabled = busy;
        openChangeWhitelistButton.disabled = busy;
        merchantClearButton.disabled = busy;
        disableOldSubMchCheckbox.disabled = busy;
        refreshProgressRetryability("wechat");
        refreshProgressRetryability("alipay");
      };
      const getCodePlateTransferValues = () => ({
        startCode: codePlateStartInput.value.trim(),
        endCode: codePlateEndInput.value.trim(),
        sourceAgent: sourceAgentInput.value.trim(),
        targetAgent: targetAgentInput.value.trim()
      });
      const validateCodePlateTransferValues = (values) => {
        try {
          assertCodePlateTransferValues(values);
          return "";
        } catch (error) {
          return error.message;
        }
      };
      const setCodePlateTransferError = (message = "") => {
        codePlateTransferError.textContent = message;
        codePlateTransferError.classList.toggle("visible", Boolean(message));
      };
      const setCodePlateTransferStatus = (state, message) => {
        if (state) {
          codePlateTransferSummary.dataset.state = state;
        } else {
          delete codePlateTransferSummary.dataset.state;
        }
        codePlateTransferSummary.textContent = message;
      };
      const setCodePlateTransferBusy = (nextBusy) => {
        codePlateTransferBusy = Boolean(nextBusy);
        [codePlateStartInput, codePlateEndInput, sourceAgentInput, targetAgentInput].forEach((field) => {
          field.disabled = codePlateTransferBusy;
        });
        confirmCodePlateTransferButton.disabled = codePlateTransferBusy;
        confirmCodePlateTransferButton.textContent = codePlateTransferBusy ? "\u5904\u7406\u4E2D..." : "\u786E\u8BA4\u5212\u8F6C";
        setBusy(codePlateTransferBusy);
      };
      const refreshCodePlateTransferSummary = () => {
        if (codePlateTransferBusy) return;
        delete codePlateTransferSummary.dataset.state;
        const values = getCodePlateTransferValues();
        if (!values.startCode && !values.endCode && !values.sourceAgent && !values.targetAgent) {
          codePlateTransferSummary.textContent = "\u586B\u5199\u5B8C\u6574\u540E\u663E\u793A\u672C\u6B21\u5212\u8F6C\u4FE1\u606F";
          return;
        }
        const range = values.startCode || values.endCode ? `${values.startCode || "\u672A\u586B\u5199"} \u81F3 ${values.endCode || "\u672A\u586B\u5199"}` : "\u672A\u586B\u5199";
        codePlateTransferSummary.textContent = `\u7801\u724C ${range}\uFF0C\u4ECE\u4EE3\u7406\u5546 ${values.sourceAgent || "\u672A\u586B\u5199"} \u5212\u8F6C\u81F3 ${values.targetAgent || "\u672A\u586B\u5199"}`;
      };
      const getChangeWhitelistValues = () => ({
        mobile: whitelistMobileInput.value.trim(),
        idCard: whitelistIdCardInput.value.trim(),
        businessLicense: whitelistBusinessLicenseInput.value.trim(),
        settlementAccount: whitelistSettlementAccountInput.value.trim()
      });
      const setChangeWhitelistError = (message = "") => {
        changeWhitelistError.textContent = message;
        changeWhitelistError.classList.toggle("visible", Boolean(message));
      };
      const setChangeWhitelistStatus = (state, message) => {
        if (state) {
          changeWhitelistSummary.dataset.state = state;
        } else {
          delete changeWhitelistSummary.dataset.state;
        }
        changeWhitelistSummary.textContent = message;
      };
      const setChangeWhitelistBusy = (nextBusy) => {
        changeWhitelistBusy = Boolean(nextBusy);
        [
          whitelistMobileInput,
          whitelistIdCardInput,
          whitelistBusinessLicenseInput,
          whitelistSettlementAccountInput
        ].forEach((field) => {
          field.disabled = changeWhitelistBusy;
        });
        confirmChangeWhitelistButton.disabled = changeWhitelistBusy;
        confirmChangeWhitelistButton.textContent = changeWhitelistBusy ? "\u63D0\u4EA4\u4E2D..." : "\u786E\u8BA4\u6DFB\u52A0";
        setBusy(changeWhitelistBusy);
      };
      const refreshChangeWhitelistSummary = () => {
        if (changeWhitelistBusy) return;
        const items = getMerchantChangeWhitelistItems(getChangeWhitelistValues());
        delete changeWhitelistSummary.dataset.state;
        changeWhitelistSummary.textContent = items.length > 0 ? `\u5DF2\u586B\u5199 ${items.length} \u9879\uFF1A${items.map((item) => item.label).join("\u3001")}` : "\u81F3\u5C11\u586B\u5199\u4E00\u9879\uFF0C\u591A\u9879\u5C06\u5E76\u53D1\u63D0\u4EA4";
      };
      const showMainToolView = () => {
        mainToolView.classList.add("active");
        codePlateTransferView.classList.remove("active");
        changeWhitelistView.classList.remove("active");
        toolViewBackButton.classList.remove("visible");
        toolViewTitle.textContent = `\u6536\u94F6\u901A\u91CD\u7F6E\u5B50\u5546\u6237\u53F7\u5DE5\u5177 v${SCRIPT_VERSION}`;
        setCodePlateTransferError("");
        setChangeWhitelistError("");
      };
      const showCodePlateTransferView = () => {
        setCodePlateTransferError("");
        if (!codePlateTransferSummary.dataset.state) refreshCodePlateTransferSummary();
        mainToolView.classList.remove("active");
        changeWhitelistView.classList.remove("active");
        codePlateTransferView.classList.add("active");
        toolViewBackButton.classList.add("visible");
        toolViewTitle.textContent = `\u7801\u724C\u5212\u8F6C v${SCRIPT_VERSION}`;
        codePlateStartInput.focus();
      };
      const showChangeWhitelistView = () => {
        setChangeWhitelistError("");
        if (!changeWhitelistSummary.dataset.state) refreshChangeWhitelistSummary();
        mainToolView.classList.remove("active");
        codePlateTransferView.classList.remove("active");
        changeWhitelistView.classList.add("active");
        toolViewBackButton.classList.add("visible");
        toolViewTitle.textContent = `\u9632\u5207\u6237\u767D\u540D\u5355 v${SCRIPT_VERSION}`;
        whitelistMobileInput.focus();
      };
      const getReportOptions = () => {
        return {
          channelId: wxChannelIdInput.value.trim(),
          channelName: wxChannelNameInput.value.trim(),
          sourcePid: alipayChannelIdInput.value.trim(),
          sourceName: alipayChannelNameInput.value.trim(),
          subAppids: appidInput.value.trim(),
          jsapiPaths: payAuthDirInput.value.trim(),
          disableOldSubMch: disableOldSubMchCheckbox.checked
        };
      };
      const getCopyText = () => {
        const wechatValue = resultInput.value.trim();
        const alipayValue = alipayResultInput.value.trim();
        if (!wechatValue && !alipayValue) return "";
        return [
          `\u4E50\u5237\u5546\u6237\u53F7\uFF1A${input.value.trim()}`,
          wechatValue ? `\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7\uFF1A${wechatValue}` : "",
          alipayValue ? `\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7\uFF1A${alipayValue}` : "",
          "\u6E29\u99A8\u63D0\u793A\uFF1A\u91CD\u7F6E\u5B50\u5546\u6237\u53F7\uFF0C\u4EE3\u7406\u8BB0\u5F97\u81EA\u884C\u68C0\u67E5\u5546\u6237\u8D39\u7387\uFF0C2\u4E2A\u5DE5\u4F5C\u65E5\u5185\u53CD\u9988\uFF0C\u8BF7\u77E5\u6089\uFF01"
        ].filter(Boolean).join("\n");
      };
      const refreshCopyButton = () => {
        copyButton.disabled = !getCopyText();
      };
      const resetResultOutputs = () => {
        resultInput.value = "";
        alipayResultInput.value = "";
        refreshCopyButton();
      };
      const getProgressContainer = (type) => type === "alipay" ? alipayProgress : wechatProgress;
      const getTypeName = (type) => type === "alipay" ? "\u652F\u4ED8\u5B9D" : "\u5FAE\u4FE1";
      const getResultInput = (type) => type === "alipay" ? alipayResultInput : resultInput;
      const createRetryContext = (type, merchantId, newSubMchId, reportOptions) => {
        retryContexts[type] = {
          type,
          merchantId,
          newSubMchId,
          reportOptions: { ...reportOptions },
          completedSteps: {
            report: true,
            enable: false,
            disable: false
          },
          failedStep: null
        };
        refreshProgressRetryability(type);
      };
      const updateRetryContext = (type, step, status) => {
        const context = retryContexts[type];
        if (!context) return;
        if (status === "success" || status === "skipped") {
          context.completedSteps[step] = true;
          if (context.failedStep === step) context.failedStep = null;
        } else if (status === "error") {
          context.completedSteps[step] = false;
          context.failedStep = step;
        }
      };
      const canRetryProgressStep = (type, step) => {
        const context = retryContexts[type];
        if (busy || !context || step !== "enable" && step !== "disable") return false;
        if (step === "enable") return context.completedSteps.report && context.failedStep === "enable";
        return shouldDisableOldSubMch(context.reportOptions) && context.completedSteps.enable && context.failedStep === "disable";
      };
      const refreshProgressRetryability = (type) => {
        getProgressContainer(type).querySelectorAll(".progress-step").forEach((stepElement) => {
          const step = stepElement.dataset.step;
          const retryable = stepElement.classList.contains("error") && canRetryProgressStep(type, step);
          stepElement.classList.toggle("retryable", retryable);
          if (retryable) {
            stepElement.title = "\u70B9\u51FB\u91CD\u8BD5\u6B64\u6B65\u9AA4";
          } else if (step === "report" && stepElement.classList.contains("error")) {
            stepElement.title = "\u4E0A\u62A5\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u6267\u884C\u5B8C\u6574\u91CD\u7F6E";
          } else if (stepElement.classList.contains("skipped")) {
            stepElement.title = "\u5DF2\u6839\u636E\u8BBE\u7F6E\u4FDD\u7559\u65E7\u5B50\u5546\u6237\u53F7";
          } else {
            stepElement.removeAttribute("title");
          }
        });
      };
      const setProgressStep = (type, step, status) => {
        const target = getProgressContainer(type).querySelector(`[data-step="${step}"]`);
        if (!target) return;
        target.classList.remove("success", "error", "running", "skipped", "retryable");
        if (status === "success" || status === "error" || status === "running" || status === "skipped") {
          target.classList.add(status);
        }
        updateRetryContext(type, step, status);
        refreshProgressRetryability(type);
      };
      const resetProgress = (type) => {
        getProgressContainer(type).querySelectorAll(".progress-step").forEach((step) => {
          step.classList.remove("success", "error", "running", "skipped", "retryable");
          step.removeAttribute("title");
        });
      };
      const resetTaskState = () => {
        retryContexts.wechat = null;
        retryContexts.alipay = null;
        resetResultOutputs();
        resetProgress("wechat");
        resetProgress("alipay");
      };
      const markFirstPendingProgressError = (type) => {
        const target = Array.from(getProgressContainer(type).querySelectorAll(".progress-step")).find((step) => {
          return !step.classList.contains("success") && !step.classList.contains("error");
        });
        if (target) setProgressStep(type, target.dataset.step, "error");
      };
      const setReportedSubMchId = (type, merchantId, subMchId, reportOptions) => {
        const targetInput = getResultInput(type);
        targetInput.value = subMchId;
        refreshCopyButton();
        createRetryContext(type, merchantId, subMchId, reportOptions);
        appendLog(`\u65B0\u4E0A\u62A5${getTypeName(type)}\u5B50\u5546\u6237\u53F7\u5DF2\u5199\u5165\u8F93\u51FA\u6846: ${subMchId}`);
      };
      const clearOptionalInputs = () => {
        wxChannelIdInput.value = "";
        wxChannelNameInput.value = "";
        alipayChannelIdInput.value = "";
        alipayChannelNameInput.value = "";
        appidInput.value = "";
        payAuthDirInput.value = "";
      };
      const setOptionalContentOpen = (open) => {
        optionalContent.classList.toggle("open", open);
      };
      const setLogSectionOpen = (open) => {
        logSection.classList.toggle("open", open);
        logToggleButton.textContent = open ? "\u6536\u8D77\u65E5\u5FD7" : "\u5C55\u5F00\u65E5\u5FD7";
      };
      const applyWechatPaymentPreset = (preset) => {
        wxChannelIdInput.value = preset.channelId;
        wxChannelNameInput.value = preset.channelName;
        appidInput.value = preset.subAppids;
        payAuthDirInput.value = preset.jsapiPaths;
        appendLog(`\u5DF2\u9009\u62E9\u9884\u8BBE\u914D\u7F6E: ${preset.name}`);
      };
      const buildFlowOptions = (type, merchantId, reportOptions) => {
        return {
          ...reportOptions,
          onLog: appendLog,
          onProgress: setProgressStep,
          onReportedSubMchId: (reportedType, subMchId) => {
            setReportedSubMchId(reportedType, merchantId, subMchId, reportOptions);
          }
        };
      };
      const retryDisableOldMappings = async (context) => {
        const typeName = getTypeName(context.type);
        if (!shouldDisableOldSubMch(context.reportOptions)) {
          setProgressStep(context.type, "disable", "skipped");
          appendLog(`\u5DF2\u4FDD\u7559\u65E7${typeName}\u5B50\u5546\u6237\u53F7\uFF0C\u8DF3\u8FC7\u7981\u7528\u6B65\u9AA4`);
          return;
        }
        setProgressStep(context.type, "disable", "running");
        appendLog(`\u5F00\u59CB\u91CD\u8BD5\u7981\u7528\u65E7${typeName}\u5B50\u5546\u6237\u53F7`);
        try {
          if (context.type === "wechat") {
            const result = await disableOldEnabledWechatMappings(context.merchantId, context.newSubMchId, {
              ...context.reportOptions,
              onGroup: (group) => {
                const paramsText = Object.entries(group.statusParams).map(([key, value]) => `${key}=${value}`).join("&");
                appendLog(`\u91CD\u8BD5\u7981\u7528\u65E7\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7 ${group.wxSubMchId}: ${paramsText}`);
              }
            });
            appendLog(`\u7981\u7528\u65E7\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7\u91CD\u8BD5\u6210\u529F\uFF0C\u5904\u7406 ${result.changedGroups.length} \u4E2A\u5206\u7EC4`);
          } else {
            const result = await disableOldEnabledAlipayMappings(context.merchantId, context.newSubMchId, {
              ...context.reportOptions,
              onGroup: (group) => {
                const paramsText = Object.entries(group.statusParams).map(([key, value]) => `${key}=${value}`).join("&");
                appendLog(`\u91CD\u8BD5\u7981\u7528\u65E7\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7 ${group.zfbSubMchId || group.subMchId}: ${paramsText}`);
              }
            });
            appendLog(`\u7981\u7528\u65E7\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7\u91CD\u8BD5\u6210\u529F\uFF0C\u5904\u7406 ${result.changedGroups.length} \u4E2A\u5206\u7EC4`);
          }
          setProgressStep(context.type, "disable", "success");
        } catch (error) {
          setProgressStep(context.type, "disable", "error");
          throw new Error(`\u7981\u7528\u65E7${typeName}\u5B50\u5546\u6237\u53F7\u91CD\u8BD5\u5931\u8D25: ${error.message}`);
        }
      };
      const retryEnableAndContinue = async (context) => {
        const typeName = getTypeName(context.type);
        setProgressStep(context.type, "enable", "running");
        appendLog(`\u5F00\u59CB\u91CD\u8BD5\u542F\u7528${typeName}\u5B50\u5546\u6237\u53F7 ${context.newSubMchId}`);
        try {
          if (context.type === "wechat") {
            await confirmNewWechatMappings(context.merchantId, context.newSubMchId, context.reportOptions);
            appendLog("\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7\u542F\u7528\u72B6\u6001\u786E\u8BA4\u91CD\u8BD5\u6210\u529F");
          } else {
            await confirmNewAlipayMappings(context.merchantId, context.newSubMchId, context.reportOptions);
            appendLog("\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7\u542F\u7528\u72B6\u6001\u786E\u8BA4\u91CD\u8BD5\u6210\u529F");
          }
          setProgressStep(context.type, "enable", "success");
        } catch (error) {
          setProgressStep(context.type, "enable", "error");
          throw new Error(`\u542F\u7528${typeName}\u5B50\u5546\u6237\u53F7\u91CD\u8BD5\u5931\u8D25: ${error.message}`);
        }
        if (shouldDisableOldSubMch(context.reportOptions)) {
          appendLog(`\u7EE7\u7EED\u67E5\u8BE2\u5E76\u7981\u7528\u65E7${typeName}\u5B50\u5546\u6237\u53F7`);
          await retryDisableOldMappings(context);
        } else {
          setProgressStep(context.type, "disable", "skipped");
          appendLog(`\u5DF2\u4FDD\u7559\u65E7${typeName}\u5B50\u5546\u6237\u53F7\uFF0C\u8DF3\u8FC7\u7981\u7528\u6B65\u9AA4`);
        }
        appendLog("\u91CD\u8BD5\u6D41\u7A0B\u5DF2\u5B8C\u6210\uFF0C\u672C\u6B21\u672A\u6267\u884C appid / \u652F\u4ED8\u6388\u6743\u76EE\u5F55\u7ED1\u5B9A");
      };
      const retryProgressStep = async (type, step) => {
        const context = retryContexts[type];
        if (!context || !canRetryProgressStep(type, step)) return;
        const typeName = getTypeName(type);
        const message = step === "enable" ? `\u786E\u8BA4\u91CD\u8BD5\u542F\u7528${typeName}\u5B50\u5546\u6237\u53F7\u5E76\u7EE7\u7EED\u7981\u7528\u65E7\u53F7\uFF1F` : `\u786E\u8BA4\u91CD\u8BD5\u7981\u7528\u65E7${typeName}\u5B50\u5546\u6237\u53F7\uFF1F`;
        if (!window.confirm(message)) return;
        setBusy(true);
        try {
          if (step === "enable") {
            await retryEnableAndContinue(context);
          } else {
            await retryDisableOldMappings(context);
          }
        } catch (error) {
          appendLog(error.message, true);
          console.error(error);
        } finally {
          setBusy(false);
        }
      };
      wechatButton.addEventListener("click", async () => {
        setBusy(true);
        logBox.innerHTML = "";
        resetTaskState();
        try {
          const merchantId = input.value.trim();
          const reportOptions = getReportOptions();
          const result = await autoReport(merchantId, buildFlowOptions("wechat", merchantId, reportOptions));
          console.log("omAutoReport result:", result);
        } catch (error) {
          if (!wechatProgress.querySelector(".progress-step.error")) markFirstPendingProgressError("wechat");
          appendLog(`\u5931\u8D25: ${error.message}`, true);
          console.error(error);
        } finally {
          setBusy(false);
        }
      });
      alipayButton.addEventListener("click", async () => {
        setBusy(true);
        logBox.innerHTML = "";
        resetTaskState();
        try {
          const merchantId = input.value.trim();
          const reportOptions = getReportOptions();
          const result = await alipayAutoReport(merchantId, buildFlowOptions("alipay", merchantId, reportOptions));
          console.log("omAutoReport alipay result:", result);
        } catch (error) {
          if (!alipayProgress.querySelector(".progress-step.error")) markFirstPendingProgressError("alipay");
          appendLog(`\u5931\u8D25: ${error.message}`, true);
          console.error(error);
        } finally {
          setBusy(false);
        }
      });
      allButton.addEventListener("click", async () => {
        setBusy(true);
        logBox.innerHTML = "";
        resetTaskState();
        try {
          const merchantId = input.value.trim();
          const reportOptions = getReportOptions();
          const runFlow = async (type, runner) => {
            try {
              return await runner(merchantId, buildFlowOptions(type, merchantId, reportOptions));
            } catch (error) {
              const progress = getProgressContainer(type);
              if (!progress.querySelector(".progress-step.error")) markFirstPendingProgressError(type);
              appendLog(`${getTypeName(type)}\u91CD\u7F6E\u5931\u8D25: ${error.message}`, true);
              throw error;
            }
          };
          const results = await Promise.allSettled([
            runFlow("wechat", wechatAutoReport),
            runFlow("alipay", alipayAutoReport)
          ]);
          console.log("omAutoReport all result:", results);
        } finally {
          setBusy(false);
        }
      });
      configureMerchantKeyButton.addEventListener("click", async () => {
        setBusy(true);
        try {
          const merchantId = input.value.trim();
          appendLog(`\u5F00\u59CB\u4E3A\u5546\u6237 ${merchantId || "(\u672A\u586B\u5199)"} \u914D\u7F6E\u5546\u6237 key`);
          const result = await configureMerchantKey2(merchantId);
          appendLog(`\u5546\u6237 ${merchantId} \u914D\u7F6E\u5546\u6237 key \u6210\u529F`);
          console.log("sytAutoReport configureMerchantKey result:", result);
        } catch (error) {
          appendLog(`\u914D\u7F6E\u5546\u6237 key \u5931\u8D25: ${error.message}`, true);
          console.error(error);
        } finally {
          setBusy(false);
        }
      });
      enableOnlineReceiptButton.addEventListener("click", async () => {
        setBusy(true);
        try {
          const merchantId = input.value.trim();
          const result = await enableOnlineReceipt2(merchantId, { onLog: appendLog });
          console.log("sytAutoReport enableOnlineReceipt result:", result);
        } catch (error) {
          appendLog(`\u5F00\u901A\u5728\u7EBF\u6536\u6B3E\u5355\u5931\u8D25: ${error.message}`, true);
          console.error(error);
        } finally {
          setBusy(false);
        }
      });
      openCodePlateTransferButton.addEventListener("click", showCodePlateTransferView);
      openChangeWhitelistButton.addEventListener("click", showChangeWhitelistView);
      toolViewBackButton.addEventListener("click", showMainToolView);
      cancelCodePlateTransferButton.addEventListener("click", showMainToolView);
      cancelChangeWhitelistButton.addEventListener("click", showMainToolView);
      [codePlateStartInput, codePlateEndInput, sourceAgentInput, targetAgentInput].forEach((field) => {
        field.addEventListener("input", () => {
          setCodePlateTransferError("");
          refreshCodePlateTransferSummary();
        });
      });
      confirmCodePlateTransferButton.addEventListener("click", async () => {
        if (codePlateTransferBusy) return;
        const values = getCodePlateTransferValues();
        const errorMessage = validateCodePlateTransferValues(values);
        if (errorMessage) {
          setCodePlateTransferError(errorMessage);
          return;
        }
        setCodePlateTransferError("");
        setCodePlateTransferBusy(true);
        try {
          const result = await transferCodePlates2(values, {
            onLog: appendLog,
            onStatus: setCodePlateTransferStatus
          });
          console.log("sytAutoReport codePlateTransfer result:", result);
        } catch (error) {
          const message = error.message || String(error);
          setCodePlateTransferError("");
          setCodePlateTransferStatus("failure", message);
          appendLog(message, true);
          console.error(error);
        } finally {
          setCodePlateTransferBusy(false);
        }
      });
      [
        whitelistMobileInput,
        whitelistIdCardInput,
        whitelistBusinessLicenseInput,
        whitelistSettlementAccountInput
      ].forEach((field) => {
        field.addEventListener("input", () => {
          setChangeWhitelistError("");
          refreshChangeWhitelistSummary();
        });
      });
      confirmChangeWhitelistButton.addEventListener("click", async () => {
        if (changeWhitelistBusy) return;
        const values = getChangeWhitelistValues();
        const items = getMerchantChangeWhitelistItems(values);
        if (items.length === 0) {
          setChangeWhitelistError("\u8BF7\u81F3\u5C11\u586B\u5199\u624B\u673A\u53F7\u3001\u8EAB\u4EFD\u8BC1\u53F7\u3001\u8425\u4E1A\u6267\u7167\u53F7\u6216\u7ED3\u7B97\u8D26\u53F7\u4E2D\u7684\u4E00\u9879");
          return;
        }
        setChangeWhitelistError("");
        setChangeWhitelistBusy(true);
        try {
          const result = await addMerchantChangeWhitelist(values, {
            onLog: appendLog,
            onStatus: setChangeWhitelistStatus
          });
          console.log("sytAutoReport merchantChangeWhitelist result:", result);
        } catch (error) {
          const message = error.message || String(error);
          setChangeWhitelistStatus("failure", message);
          appendLog(message, true);
          console.error(error);
        } finally {
          setChangeWhitelistBusy(false);
        }
      });
      clearButton.addEventListener("click", () => {
        logBox.innerHTML = "";
      });
      merchantClearButton.addEventListener("click", () => {
        input.value = "";
        logBox.innerHTML = "";
        resetTaskState();
        input.focus();
      });
      copyButton.addEventListener("click", async () => {
        const text = getCopyText();
        if (!text) return;
        try {
          await copyText2(text);
          appendLog("\u5DF2\u590D\u5236\u65B0\u4E0A\u62A5\u5B50\u5546\u6237\u53F7");
        } catch (error) {
          appendLog(`\u590D\u5236\u5931\u8D25: ${error.message}`, true);
        }
      });
      floatBall.addEventListener("click", () => {
        panel.classList.remove("collapsed");
        input.focus();
      });
      closeButton.addEventListener("click", () => {
        showMainToolView();
        panel.classList.add("collapsed");
      });
      presetSelect.addEventListener("change", () => {
        if (presetSelect.value === "none") {
          clearOptionalInputs();
          setOptionalContentOpen(false);
          appendLog("\u5DF2\u9009\u62E9\u9884\u8BBE\u914D\u7F6E: \u65E0");
          return;
        }
        setOptionalContentOpen(true);
        if (presetSelect.value === "custom") {
          appendLog("\u5DF2\u9009\u62E9\u9884\u8BBE\u914D\u7F6E: \u81EA\u5B9A\u4E49");
          return;
        }
        const presetIndex = Number(presetSelect.value.replace("preset-", ""));
        const preset = WECHAT_PAYMENT_PRESETS[presetIndex];
        if (preset) applyWechatPaymentPreset(preset);
      });
      logToggleButton.addEventListener("click", () => {
        setLogSectionOpen(!logSection.classList.contains("open"));
      });
      wechatProgress.addEventListener("click", (event) => {
        const stepElement = event.target.closest(".progress-step.retryable");
        if (stepElement) retryProgressStep("wechat", stepElement.dataset.step);
      });
      alipayProgress.addEventListener("click", (event) => {
        const stepElement = event.target.closest(".progress-step.retryable");
        if (stepElement) retryProgressStep("alipay", stepElement.dataset.step);
      });
      document.addEventListener("click", (event) => {
        if (!panel.classList.contains("collapsed") && !panel.contains(event.target)) {
          showMainToolView();
          panel.classList.add("collapsed");
        }
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && (codePlateTransferView.classList.contains("active") || changeWhitelistView.classList.contains("active"))) {
          showMainToolView();
        }
      });
    }
    function shouldCreatePanel() {
      const url = new URL(window.location.href);
      const method = url.searchParams.get("method") || "";
      const blockedMethods = /* @__PURE__ */ new Set([
        "getSetTradeStatusPage",
        "setTradeStatus",
        "getSetTradeDefaultPage",
        "setTradeDefault"
      ]);
      if (blockedMethods.has(method)) return false;
      if (window.top === window.self) return true;
      return method === "page";
    }
    const api = {
      version: SCRIPT_VERSION,
      wechatAutoReport,
      alipayAutoReport,
      allAutoReport,
      submitWechatReport,
      submitAlipayReport,
      submitSytWechatReport,
      submitSytAlipayReport,
      resolveWechatChannelOptions,
      resolveAlipayChannelOptions,
      bindWechatPaymentConfig,
      configureMerchantKey: configureMerchantKey2,
      enableOnlineReceipt: enableOnlineReceipt2,
      addMerchantChangeWhitelistItem,
      addMerchantChangeWhitelist,
      createCodePlateTransferFile,
      queryCodePlateTransferMessages,
      submitCodePlateTransfer,
      submitCodePlateTransferViaNativeForm,
      pollCodePlateTransferResult,
      transferCodePlates: transferCodePlates2,
      parseCodePlateMessageRows,
      parseCodePlateResultMessage,
      pickNewCodePlateTransferResult,
      pickLatestEnabledMappingGroup,
      setMappingTradeDefault,
      openOnlineReceiptAuthority,
      reportOnlineReceiptChannel,
      queryOnlineReceiptAddresses,
      pollOnlineReceiptAddressRecord,
      setOnlineReceiptBusinessAddress,
      reportMerchant,
      queryWechatMappings,
      queryAlipayMappings,
      queryWxSubmchConfigRows,
      parseMappingHtml,
      pollWechatNewMappings,
      pollWechatEnabledMappings,
      pollAlipayNewMappings,
      enableNewWechatMappings,
      confirmNewWechatMappings,
      confirmNewAlipayMappings,
      disableOldEnabledWechatMappings,
      disableOldEnabledAlipayMappings,
      groupRowsForTradeStatus,
      setWechatTradeStatus,
      setAlipayTradeStatus,
      setWechatStatusGroups,
      setAlipayStatusGroups,
      setTradeStatus,
      parseStatusResultHtml,
      autoReport,
      getDateRange,
      getDefaultRange
    };
    window.sytAutoReport = api;
    window.omAutoReport = api;
    if (typeof unsafeWindow !== "undefined") {
      unsafeWindow.sytAutoReport = api;
      unsafeWindow.omAutoReport = api;
    }
    if (shouldCreatePanel()) {
      createPanel2();
    }
  })();

  // src/content/index.ts
  var VERSION = "1.0.0";
  var FLOAT_TOP_STORAGE_KEY = "syt-extension-float-top";
  var FLOAT_SIZE = 54;
  var FLOAT_VIEWPORT_GAP = 8;
  var PRESETS = [
    { name: "\u65E0", channelId: "", channelName: "", subAppids: "", jsapiPaths: "" },
    { name: "\u81EA\u5B9A\u4E49", channelId: "", channelName: "", subAppids: "", jsapiPaths: "" },
    {
      name: "\u7F8E\u56E2",
      channelId: "755607656",
      channelName: "\u5929\u6D25\u4E09\u5FEB\u98DE\u8DC3\u79D1\u6280\u6709\u9650\u516C\u53F8",
      subAppids: "wx1fde2c33280d64b6;wx0e8672034309be8f",
      jsapiPaths: "https://openpay.meituan.com/;https://openpay-zc.st.meituan.com/"
    },
    {
      name: "\u4E50\u5E97\u5B9D",
      channelId: "835134506",
      channelName: "\u6DF1\u5733\u5BCC\u4E91\u6570\u79D1\u4FE1\u606F\u6280\u672F\u6709\u9650\u516C\u53F8",
      subAppids: "wx76a4c0a8a9ef465b",
      jsapiPaths: ""
    }
  ];
  function byId(root, id) {
    const element = root.querySelector(`#${id}`);
    if (!element) throw new Error(`\u63D2\u4EF6\u9875\u9762\u7F3A\u5C11\u5143\u7D20: ${id}`);
    return element;
  }
  function copyResultText(results) {
    return results.map((result) => [
      `\u4E50\u5237\u5546\u6237\u53F7${result.merchantId}`,
      `\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7:${channelText(result.wechat)} \u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7:${channelText(result.alipay)}`
    ].join("\n")).join("\n");
  }
  function createPanel(api) {
    document.getElementById("syt-auto-report-panel")?.remove();
    document.getElementById("syt-extension-root")?.remove();
    const root = document.createElement("div");
    root.id = "syt-extension-root";
    root.className = "collapsed";
    root.innerHTML = `
    <button id="syt-extension-float" class="float-ball" type="button" title="\u6253\u5F00\u6536\u94F6\u901A\u8FD0\u8425\u5DE5\u5177">\u6536\u94F6\u901A</button>
    <section class="panel" aria-label="\u6536\u94F6\u901A\u8FD0\u8425\u5DE5\u5177">
      <header><div><button id="syt-back" class="icon-button" type="button" title="\u8FD4\u56DE">\u2190</button><span id="syt-title">\u6536\u94F6\u901A\u8FD0\u8425\u5DE5\u5177 v${VERSION}</span></div><button id="syt-close" class="icon-button" type="button" title="\u6536\u8D77">\xD7</button></header>
      <main>
        <section id="syt-view-reset" class="view active">
          <label>\u4E50\u5237\u5546\u6237\u53F7<input id="syt-merchant-ids" placeholder="\u6700\u591A 5 \u4E2A\uFF0C\u4EE5 ; \u5206\u9694" autocomplete="off"></label>
          <div class="form-row"><label>\u91CD\u7F6E\u901A\u9053<select id="syt-report-type"><option value="ALL">\u5168\u90E8\u91CD\u7F6E</option><option value="WECHAT">\u5FAE\u4FE1\u91CD\u7F6E</option><option value="ALIPAY">\u652F\u4ED8\u5B9D\u91CD\u7F6E</option></select></label><label>\u4E0A\u62A5\u9884\u8BBE<select id="syt-preset">${PRESETS.map((preset2, index) => `<option value="${index}">${preset2.name}</option>`).join("")}</select></label></div>
          <div id="syt-channel-options" class="optional-options"><div class="section-title">\u53EF\u9009\u4E0A\u62A5\u6E20\u9053</div><div class="form-row"><label>\u5FAE\u4FE1\u6E20\u9053\u53F7<input id="syt-wx-channel-id" autocomplete="off"></label><label>\u5FAE\u4FE1\u6E20\u9053\u4E3B\u4F53<input id="syt-wx-channel-name" autocomplete="off"></label></div><div class="form-row"><label>\u652F\u4ED8\u5B9D\u6E20\u9053\u53F7<input id="syt-alipay-channel-id" autocomplete="off"></label><label>\u652F\u4ED8\u5B9D\u6E20\u9053\u4E3B\u4F53<input id="syt-alipay-channel-name" autocomplete="off"></label></div></div>
          <div class="section-title">\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570\uFF08\u53EF\u9009\uFF09</div><label>appid<input id="syt-appid" autocomplete="off"></label><label>\u652F\u4ED8\u6388\u6743\u76EE\u5F55<input id="syt-jsapi-paths" autocomplete="off"></label>
          <button id="syt-run-reset" class="primary" type="button">\u6267\u884C\u91CD\u7F6E</button>
          <div class="shared-tool-actions"><button id="syt-run-key" type="button">\u914D\u7F6E\u5546\u6237 key</button><button id="syt-run-receipt" type="button">\u5F00\u901A\u5728\u7EBF\u6536\u6B3E\u5355</button></div>
          <div id="syt-reset-status" class="status"></div>
          <div class="section-title">\u672C\u6B21\u91CD\u7F6E\u7ED3\u679C</div><div class="result-table-wrap"><table><thead><tr><th>\u4E50\u5237\u5546\u6237\u53F7</th><th>\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7</th><th>\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7</th><th>\u65B9\u5F0F</th></tr></thead><tbody id="syt-results"><tr><td colspan="4" class="empty">\u6267\u884C\u540E\u663E\u793A\u7ED3\u679C</td></tr></tbody></table></div>
          <div class="actions"><button id="syt-copy" type="button" disabled>\u590D\u5236\u7ED3\u679C</button><button class="nav-tool" data-view="code" type="button">\u7801\u724C\u5212\u8F6C</button><button class="nav-tool" data-view="whitelist" type="button">\u9632\u5207\u6237\u767D\u540D\u5355</button></div>
        </section>
        <section id="syt-view-code" class="view"><div class="form-row"><label>\u7801\u724C\u5F00\u59CB\u7F16\u53F7<input id="syt-code-start" autocomplete="off"></label><label>\u7801\u724C\u7ED3\u675F\u7F16\u53F7<input id="syt-code-end" autocomplete="off"></label></div><div class="form-row"><label>\u539F\u4EE3\u7406\u5546<input id="syt-code-source" autocomplete="off"></label><label>\u65B0\u4EE3\u7406\u5546<input id="syt-code-target" autocomplete="off"></label></div><button id="syt-run-code" class="primary" type="button">\u786E\u8BA4\u5212\u8F6C</button><div id="syt-code-status" class="status"></div></section>
        <section id="syt-view-whitelist" class="view"><div class="form-row"><label>\u624B\u673A\u53F7<input id="syt-white-mobile" autocomplete="off"></label><label>\u8EAB\u4EFD\u8BC1\u53F7<input id="syt-white-id" autocomplete="off"></label></div><div class="form-row"><label>\u8425\u4E1A\u6267\u7167\u53F7<input id="syt-white-license" autocomplete="off"></label><label>\u7ED3\u7B97\u8D26\u53F7<input id="syt-white-account" autocomplete="off"></label></div><button id="syt-run-whitelist" class="primary" type="button">\u6DFB\u52A0\u9632\u5207\u6237\u767D\u540D\u5355</button><div id="syt-white-status" class="status"></div></section>
        <section class="log"><div class="log-actions"><button id="syt-log-toggle" type="button">\u5C55\u5F00\u65E5\u5FD7</button><button id="syt-log-clear" type="button">\u6E05\u7A7A\u65E5\u5FD7</button></div><div id="syt-log-preview">\u7B49\u5F85\u6267\u884C</div><pre id="syt-log-full"></pre></section>
      </main>
    </section>`;
    document.body.append(root);
    const floatBall = byId(root, "syt-extension-float");
    const closeButton = byId(root, "syt-close");
    const backButton = byId(root, "syt-back");
    const title = byId(root, "syt-title");
    const resetInput = byId(root, "syt-merchant-ids");
    const reportType = byId(root, "syt-report-type");
    const preset = byId(root, "syt-preset");
    const channelOptions = byId(root, "syt-channel-options");
    const wxChannelId = byId(root, "syt-wx-channel-id");
    const wxChannelName = byId(root, "syt-wx-channel-name");
    const alipayChannelId = byId(root, "syt-alipay-channel-id");
    const alipayChannelName = byId(root, "syt-alipay-channel-name");
    const appids = byId(root, "syt-appid");
    const jsapiPaths = byId(root, "syt-jsapi-paths");
    const runReset = byId(root, "syt-run-reset");
    const runKey = byId(root, "syt-run-key");
    const runReceipt = byId(root, "syt-run-receipt");
    const resetStatus = byId(root, "syt-reset-status");
    const resultBody = byId(root, "syt-results");
    const copyButton = byId(root, "syt-copy");
    const logPreview = byId(root, "syt-log-preview");
    const logFull = byId(root, "syt-log-full");
    const logToggle = byId(root, "syt-log-toggle");
    const logClear = byId(root, "syt-log-clear");
    let latestResults = [];
    let busy = false;
    const clampFloatTop = (top) => Math.min(
      Math.max(FLOAT_VIEWPORT_GAP, top),
      Math.max(FLOAT_VIEWPORT_GAP, window.innerHeight - FLOAT_SIZE - FLOAT_VIEWPORT_GAP)
    );
    const setFloatTop = (top) => {
      root.style.top = `${clampFloatTop(top)}px`;
    };
    const restoreFloatTop = async () => {
      const { [FLOAT_TOP_STORAGE_KEY]: storedTop } = await chrome.storage.local.get(FLOAT_TOP_STORAGE_KEY);
      setFloatTop(typeof storedTop === "number" ? storedTop : window.innerHeight - FLOAT_SIZE - 18);
    };
    void restoreFloatTop();
    const log = (message, isError = false) => {
      const line = `[${(/* @__PURE__ */ new Date()).toLocaleString("zh-CN", { hour12: false })}] ${message}`;
      const row = document.createElement("div");
      row.textContent = line;
      row.className = isError ? "error" : "";
      logFull.append(row);
      logPreview.textContent = line;
      logPreview.className = isError ? "error" : "";
      logFull.scrollTop = logFull.scrollHeight;
    };
    const setStatus = (element, message = "", isError = false) => {
      element.textContent = message;
      element.className = `status${isError ? " error" : ""}`;
    };
    const setBusy = (next) => {
      busy = next;
      runReset.disabled = next;
      runKey.disabled = next;
      runReceipt.disabled = next;
      runReset.textContent = next ? "\u5904\u7406\u4E2D..." : "\u6267\u884C\u91CD\u7F6E";
    };
    const reportOptions = () => ({
      channelId: wxChannelId.value.trim(),
      channelName: wxChannelName.value.trim(),
      sourcePid: alipayChannelId.value.trim(),
      sourceName: alipayChannelName.value.trim(),
      subAppids: appids.value.trim(),
      jsapiPaths: jsapiPaths.value.trim(),
      disableOldSubMch: true,
      onLog: log
    });
    const renderResults = (results) => {
      latestResults = results;
      resultBody.replaceChildren();
      if (!results.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 4;
        cell.className = "empty";
        cell.textContent = "\u6267\u884C\u540E\u663E\u793A\u7ED3\u679C";
        row.append(cell);
        resultBody.append(row);
        copyButton.disabled = true;
        return;
      }
      results.forEach((result) => {
        const row = document.createElement("tr");
        [result.merchantId, channelText(result.wechat), channelText(result.alipay), result.route === "batch" ? "\u6279\u91CF\u63A5\u53E3" : "\u81EA\u5B9A\u4E49\u6E20\u9053"].forEach((value) => {
          const cell = document.createElement("td");
          cell.textContent = value;
          if (value.startsWith("\u5931\u8D25")) cell.className = "error";
          row.append(cell);
        });
        resultBody.append(row);
      });
      copyButton.disabled = false;
    };
    const showView = (name) => {
      root.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `syt-view-${name}`));
      backButton.classList.toggle("visible", name !== "reset");
      title.textContent = `${name === "reset" ? "\u6536\u94F6\u901A\u8FD0\u8425\u5DE5\u5177" : { code: "\u7801\u724C\u5212\u8F6C", whitelist: "\u9632\u5207\u6237\u767D\u540D\u5355" }[name]} v${VERSION}`;
    };
    const applyPreset = () => {
      const option = PRESETS[Number(preset.value)] || PRESETS[0];
      wxChannelId.value = option.channelId;
      wxChannelName.value = option.channelName;
      appids.value = option.subAppids;
      jsapiPaths.value = option.jsapiPaths;
      channelOptions.classList.toggle("hidden", option.name === "\u65E0");
    };
    let dragStartY = 0;
    let dragStartTop = 0;
    let isDragging = false;
    let didDrag = false;
    floatBall.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      isDragging = true;
      didDrag = false;
      dragStartY = event.clientY;
      dragStartTop = root.getBoundingClientRect().top;
      floatBall.setPointerCapture(event.pointerId);
      floatBall.classList.add("dragging");
      event.preventDefault();
    });
    floatBall.addEventListener("pointermove", (event) => {
      if (!isDragging) return;
      const distance = event.clientY - dragStartY;
      if (Math.abs(distance) > 3) didDrag = true;
      setFloatTop(dragStartTop + distance);
    });
    const finishDrag = async (event) => {
      if (!isDragging) return;
      isDragging = false;
      floatBall.classList.remove("dragging");
      if (floatBall.hasPointerCapture(event.pointerId)) floatBall.releasePointerCapture(event.pointerId);
      await chrome.storage.local.set({ [FLOAT_TOP_STORAGE_KEY]: root.getBoundingClientRect().top });
    };
    floatBall.addEventListener("pointerup", (event) => {
      void finishDrag(event);
    });
    floatBall.addEventListener("pointercancel", (event) => {
      void finishDrag(event);
    });
    floatBall.addEventListener("click", () => {
      if (didDrag) {
        didDrag = false;
        return;
      }
      root.classList.remove("collapsed");
    });
    window.addEventListener("resize", () => setFloatTop(root.getBoundingClientRect().top));
    closeButton.addEventListener("click", () => root.classList.add("collapsed"));
    backButton.addEventListener("click", () => showView("reset"));
    preset.addEventListener("change", applyPreset);
    root.querySelectorAll(".nav-tool").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view || "reset")));
    logToggle.addEventListener("click", () => {
      const isOpen = root.classList.toggle("log-open");
      logToggle.textContent = isOpen ? "\u6536\u8D77\u65E5\u5FD7" : "\u5C55\u5F00\u65E5\u5FD7";
    });
    logClear.addEventListener("click", () => {
      logFull.replaceChildren();
      logPreview.textContent = "\u7B49\u5F85\u6267\u884C";
      logPreview.className = "";
    });
    copyButton.addEventListener("click", async () => {
      try {
        await copyText(copyResultText(latestResults));
        log("\u5DF2\u590D\u5236\u672C\u6279\u91CD\u7F6E\u7ED3\u679C");
      } catch (error) {
        log(`\u590D\u5236\u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`, true);
      }
    });
    runReset.addEventListener("click", async () => {
      if (busy) return;
      try {
        const merchantIds = parseMerchantIds(resetInput.value);
        const type = reportType.value;
        const options = reportOptions();
        validateChannels(options);
        if (type === "ALIPAY" && (options.subAppids || options.jsapiPaths)) {
          throw new Error("\u652F\u4ED8\u5B9D\u5355\u72EC\u91CD\u7F6E\u4E0D\u80FD\u7ED1\u5B9A\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570\uFF0C\u8BF7\u9009\u62E9\u5FAE\u4FE1\u6216\u5168\u90E8\u91CD\u7F6E");
        }
        setBusy(true);
        renderResults([]);
        const useLegacy = hasCustomChannel(options);
        setStatus(resetStatus, useLegacy ? "\u4F7F\u7528\u81EA\u5B9A\u4E49\u6E20\u9053\u65E7\u6D41\u7A0B\u5904\u7406\u4E2D" : "\u6B63\u5728\u8C03\u7528\u6279\u91CF\u91CD\u7F6E\u63A5\u53E3");
        log(`\u5F00\u59CB${useLegacy ? "\u81EA\u5B9A\u4E49\u6E20\u9053" : "\u6279\u91CF"}\u91CD\u7F6E: ${merchantIds.join("\uFF1B")}`);
        const results = useLegacy ? await runLegacyReset(api, merchantIds, type, options, log) : await runBatchReset(api, merchantIds, type, options, log);
        renderResults(results);
        const failed = results.filter((item) => item.wechat.state === "failure" || item.alipay.state === "failure").length;
        setStatus(resetStatus, failed ? `\u5904\u7406\u5B8C\u6210\uFF0C${failed} \u4E2A\u5546\u6237\u5B58\u5728\u5931\u8D25\u9879` : "\u5904\u7406\u5B8C\u6210", failed > 0);
        log(failed ? `\u6279\u6B21\u5B8C\u6210\uFF0C${failed} \u4E2A\u5546\u6237\u5B58\u5728\u5931\u8D25\u9879` : "\u6279\u6B21\u91CD\u7F6E\u5B8C\u6210", failed > 0);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(resetStatus, message, true);
        log(`\u91CD\u7F6E\u5931\u8D25: ${message}`, true);
      } finally {
        setBusy(false);
      }
    });
    const runSharedMerchantTool = (button, label, runner) => {
      button.addEventListener("click", async () => {
        if (busy) return;
        try {
          const merchantIds = parseMerchantIds(resetInput.value);
          if (merchantIds.length !== 1) throw new Error(`${label} \u4E00\u6B21\u53EA\u80FD\u5904\u7406\u4E00\u4E2A\u4E50\u5237\u5546\u6237\u53F7`);
          setBusy(true);
          setStatus(resetStatus, `${label}\u5904\u7406\u4E2D...`);
          await runner(merchantIds[0]);
          setStatus(resetStatus, `${label}\u5904\u7406\u5B8C\u6210`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setStatus(resetStatus, message, true);
          log(`${label}\u5931\u8D25: ${message}`, true);
        } finally {
          setBusy(false);
        }
      });
    };
    runSharedMerchantTool(runKey, "\u914D\u7F6E\u5546\u6237 key", async (merchantId) => configureMerchantKey(api, merchantId, log));
    runSharedMerchantTool(runReceipt, "\u5F00\u901A\u5728\u7EBF\u6536\u6B3E\u5355", async (merchantId) => enableOnlineReceipt(api, merchantId, log));
    byId(root, "syt-run-code").addEventListener("click", async () => {
      const status = byId(root, "syt-code-status");
      const values = { startCode: byId(root, "syt-code-start").value.trim(), endCode: byId(root, "syt-code-end").value.trim(), sourceAgent: byId(root, "syt-code-source").value.trim(), targetAgent: byId(root, "syt-code-target").value.trim() };
      try {
        setStatus(status, "\u5904\u7406\u4E2D...");
        await transferCodePlates(api, values, log, (_state, message) => setStatus(status, message));
        setStatus(status, "\u7801\u724C\u5212\u8F6C\u5B8C\u6210");
      } catch (error) {
        setStatus(status, error instanceof Error ? error.message : String(error), true);
      }
    });
    byId(root, "syt-run-whitelist").addEventListener("click", async () => {
      const status = byId(root, "syt-white-status");
      const values = { mobile: byId(root, "syt-white-mobile").value.trim(), idCard: byId(root, "syt-white-id").value.trim(), businessLicense: byId(root, "syt-white-license").value.trim(), settlementAccount: byId(root, "syt-white-account").value.trim() };
      try {
        setStatus(status, "\u5904\u7406\u4E2D...");
        await addChangeWhitelist(api, values, log, (_state, message) => setStatus(status, message));
        setStatus(status, "\u9632\u5207\u6237\u767D\u540D\u5355\u6DFB\u52A0\u5B8C\u6210");
      } catch (error) {
        setStatus(status, error instanceof Error ? error.message : String(error), true);
      }
    });
    document.addEventListener("click", (event) => {
      if (!root.classList.contains("collapsed") && !root.contains(event.target)) root.classList.add("collapsed");
    });
    applyPreset();
  }
  function bootstrap() {
    if (window.top !== window.self) return;
    const api = window.sytAutoReport;
    if (!api) return;
    createPanel(api);
  }
  bootstrap();
})();
