"use strict";
(() => {
  // src/api/quick-report.ts
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
  function isRequested(type, channel) {
    return type === "ALL" || type === "WECHAT" && channel === "wechat" || type === "ALIPAY" && channel === "alipay";
  }
  function skippedChannel() {
    return { state: "skipped" };
  }
  function failure(error) {
    return { state: "failure", error };
  }
  function readChannelResult(channel, response) {
    if (!response) return failure(`\u63A5\u53E3\u672A\u8FD4\u56DE${channel === "wechat" ? "\u5FAE\u4FE1" : "\u652F\u4ED8\u5B9D"}\u5904\u7406\u7ED3\u679C`);
    const data = response.data;
    const structuredData = typeof data === "object" && data !== null ? data : null;
    const success = String(response.respCode) === "0" && (structuredData ? Number(structuredData.result) === 0 : Boolean(data));
    const id = structuredData ? channel === "wechat" ? structuredData.wxMchId : structuredData.zfbSubMch : data;
    if (!success) return failure(String(response.respMsg || structuredData?.msg || "\u4E0A\u62A5\u5931\u8D25"));
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
      const wechat = isRequested(reportType, "wechat") ? row ? readChannelResult("wechat", results.find((item) => isChannel(item, "wechat"))) : failure(noRowError) : skippedChannel();
      const alipay = isRequested(reportType, "alipay") ? row ? readChannelResult("alipay", results.find((item) => isChannel(item, "alipay"))) : failure(noRowError) : skippedChannel();
      return {
        merchantId,
        route: "batch",
        wechat,
        alipay
      };
    });
  }
  async function submitQuickReport(merchantIds, reportType, reportMode = "SYT", fetchImpl = fetch) {
    const body = new URLSearchParams({
      merchantIds: merchantIds.join(";"),
      reportType,
      reportMode
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
    if (result.state === "pending") return "\u5904\u7406\u4E2D";
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
  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
      }
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

  // src/api/http.ts
  var ORIGIN = "https://om.leshuazf.com";
  var SAAS = `${ORIGIN}/saasadmin`;
  var SYT_OMS = `${ORIGIN}/syt_oms`;
  var USER_CENTER = `${ORIGIN}/lsuser_center`;
  function normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }
  function assertMerchantId(merchantId) {
    if (!/^\d{10}$/.test(merchantId)) throw new Error("\u4E50\u5237\u5546\u6237\u53F7\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u4E14\u5FC5\u987B\u4E3A 10 \u4F4D\u6570\u5B57");
  }
  function buildFormBody(values) {
    const body = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => body.set(key, value == null ? "" : String(value)));
    return body;
  }
  function pad(value) {
    return String(value).padStart(2, "0");
  }
  function formatDateTime(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }
  function getDateRange(options = {}) {
    const end = /* @__PURE__ */ new Date();
    const start = new Date(end);
    if (options.years) start.setFullYear(start.getFullYear() - options.years);
    else start.setDate(start.getDate() - (options.days ?? 1));
    return { createStartTime: formatDateTime(start), createEndTime: formatDateTime(end) };
  }
  function getHtmlMessage(html) {
    const document2 = new DOMParser().parseFromString(html, "text/html");
    return normalizeText(document2.body?.textContent || html);
  }
  function summarizeHtml(html) {
    const document2 = new DOMParser().parseFromString(html, "text/html");
    const title = normalizeText(document2.querySelector("title")?.textContent);
    const body = normalizeText(document2.body?.textContent || html);
    return [title ? `\u6807\u9898: ${title}` : "", body ? `\u6B63\u6587: ${body.slice(0, 260)}` : ""].filter(Boolean).join("\uFF1B") || html.slice(0, 260);
  }
  function detectHtmlError(html) {
    const message = getHtmlMessage(html);
    if (message.includes("\u6CA1\u6709\u8BE5\u9879\u64CD\u4F5C\u6743\u9650")) return "\u6CA1\u6709\u8BE5\u9879\u64CD\u4F5C\u6743\u9650\uFF0C\u8BF7\u786E\u8BA4\u5F53\u524D\u8D26\u53F7\u5DF2\u5F00\u901A\u8BE5\u540E\u53F0\u64CD\u4F5C\u6743\u9650";
    if (/登录|login|验证码/.test(message)) return "\u5F53\u524D\u767B\u5F55\u6001\u53EF\u80FD\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55\u8FD0\u8425\u540E\u53F0\u540E\u518D\u8BD5";
    return "";
  }
  function looksLikeHtml(text) {
    return /^\s*<!doctype html/i.test(text) || /^\s*<html[\s>]/i.test(text);
  }
  async function requestText(url, options = {}) {
    const { accept, timeoutMs, headers, ...requestOptions } = options;
    const controller = timeoutMs ? new AbortController() : void 0;
    const timeout = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : void 0;
    try {
      const response = await fetch(url, {
        credentials: "include",
        redirect: "follow",
        ...requestOptions,
        signal: controller?.signal ?? requestOptions.signal,
        headers: {
          Accept: accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "X-Requested-With": "XMLHttpRequest",
          ...headers
        }
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`\u8BF7\u6C42\u5931\u8D25 ${response.status}: ${text.slice(0, 200)}`);
      return text;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new Error(`\u8BF7\u6C42\u8D85\u65F6\uFF08${timeoutMs}ms\uFF09`);
      throw error;
    } finally {
      if (timeout !== void 0) window.clearTimeout(timeout);
    }
  }
  async function requestJson(url, options = {}) {
    const text = await requestText(url, {
      ...options,
      accept: "application/json, text/javascript, */*; q=0.01",
      headers: { "Content-Type": "text/json,charset=utf-8", ...options.headers }
    });
    try {
      return JSON.parse(text);
    } catch {
      const htmlError = looksLikeHtml(text) ? detectHtmlError(text) : "";
      if (htmlError) throw new Error(htmlError);
      throw new Error(`\u63A5\u53E3\u8FD4\u56DE\u975E JSON \u5185\u5BB9: ${looksLikeHtml(text) ? summarizeHtml(text) : text.slice(0, 260)}`);
    }
  }
  function sleep(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  // src/api/payment-config.ts
  function createdAt(value) {
    return new Date(String(value || "").replace(/\.0$/, "").replace(" ", "T")).getTime() || 0;
  }
  async function queryConfigRows(merchantId, wxSubMchId) {
    assertMerchantId(merchantId);
    if (!/^\d+$/.test(wxSubMchId)) throw new Error("\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u4E14\u5FC5\u987B\u4E3A\u6570\u5B57");
    const range = getDateRange({ years: 5 });
    const response = await requestJson(`${SAAS}/wxsubmch.do?method=list`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Origin: ORIGIN },
      referrer: `${SAAS}/wxsubmch.do?method=page`,
      body: buildFormBody({
        fCreateTimeStart: range.createStartTime,
        fCreateTimeEnd: range.createEndTime,
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
        rows: "15"
      })
    });
    return (Array.isArray(response.rows) ? response.rows : []).filter(
      (row) => normalizeText(row.fMerchantId) === merchantId && normalizeText(row.fWxSubMchId) === wxSubMchId
    );
  }
  async function bindWechatPaymentConfig(merchantId, wxSubMchId, values) {
    const row = (await queryConfigRows(merchantId, wxSubMchId)).sort((left, right) => createdAt(right.fCreateTime) - createdAt(left.fCreateTime))[0];
    if (!row?.fId) throw new Error(`\u672A\u67E5\u8BE2\u5230\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7 ${wxSubMchId} \u5BF9\u5E94\u7684\u914D\u7F6E\u8BB0\u5F55 id`);
    const id = String(row.fId);
    const html = await requestText(`${SAAS}/wxsubmch.do?method=configReport`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN },
      referrer: `${SAAS}/wxsubmch.do?method=getByReportConfigId&reportConfigId=0&id=${encodeURIComponent(id)}`,
      body: buildFormBody({ subAppids: values.subAppids, jsapiPaths: values.jsapiPaths, id, isSubmitted: "1" })
    });
    const summary = summarizeHtml(html);
    if (/没有该项操作权限|失败|错误|异常/.test(summary)) throw new Error(`\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570\u7ED1\u5B9A\u5931\u8D25: ${summary}`);
    return { id, wxSubMchId: normalizeText(row.fWxSubMchId) };
  }

  // src/tools/batch-reset.ts
  async function bindWechatPaymentConfigs(results, options, log) {
    if (!options.subAppids && !options.jsapiPaths) return;
    for (const result of results) {
      if (result.wechat.state !== "success" || !result.wechat.subMchId) continue;
      try {
        log(`\u5F00\u59CB\u7ED1\u5B9A\u5546\u6237 ${result.merchantId} \u7684\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570`);
        await bindWechatPaymentConfig(result.merchantId, result.wechat.subMchId, options);
        log(`\u5546\u6237 ${result.merchantId} \u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570\u7ED1\u5B9A\u5B8C\u6210`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.wechat.note = `\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570\u7ED1\u5B9A\u5931\u8D25\uFF1A${message}`;
        log(`\u5546\u6237 ${result.merchantId} ${result.wechat.note}`, true);
      }
    }
  }
  async function runBatchReset(merchantIds, reportType, options, log, reportMode = "SYT") {
    const results = await submitQuickReport(merchantIds, reportType, reportMode);
    results.forEach((result) => {
      result.businessLine = reportMode === "COMMON" ? "lhsd" : "syt";
    });
    if (isRequested(reportType, "wechat")) {
      await bindWechatPaymentConfigs(results, options, log);
    }
    return results;
  }

  // src/api/report.ts
  var DEFAULT_WECHAT_CHANNEL_ID = "209096974";
  var DEFAULT_WECHAT_CHANNEL_NAME = "\u6DF1\u5733\u5E02\u524D\u6D77\u626B\u626B\u79D1\u6280\u6709\u9650\u516C\u53F8";
  var DEFAULT_ALIPAY_CHANNEL_ID = "2088621549599695";
  var DEFAULT_ALIPAY_CHANNEL_NAME = "\u4E50\u5237\u652F\u4ED8\u79D1\u6280\u6709\u9650\u516C\u53F8";
  function readReportData(response) {
    return typeof response.data === "object" && response.data !== null ? response.data : {};
  }
  function assertReportSuccess(response, label) {
    if (Number(response.respCode) !== 0) throw new Error(`${label}\u5931\u8D25: ${response.respMsg || JSON.stringify(response)}`);
    const data = readReportData(response);
    if (data.result != null && Number(data.result) !== 0) throw new Error(`${label}\u5931\u8D25: ${data.msg || response.respMsg || JSON.stringify(response)}`);
  }
  function resolveWechatChannel(options) {
    return { id: options.channelId || DEFAULT_WECHAT_CHANNEL_ID, name: options.channelName || DEFAULT_WECHAT_CHANNEL_NAME };
  }
  function resolveAlipayChannel(options) {
    return { id: options.sourcePid || DEFAULT_ALIPAY_CHANNEL_ID, name: options.sourceName || DEFAULT_ALIPAY_CHANNEL_NAME };
  }
  async function submitCustomWechatReport(merchantId, options) {
    assertMerchantId(merchantId);
    const channel = resolveWechatChannel(options);
    const params = new URLSearchParams({
      method: "posreport",
      merchantId,
      channelId: channel.id,
      channelName: channel.name,
      notice: "1",
      mchId: "1502075691",
      configType: "1",
      payType: "2"
    });
    const response = await requestJson(`${SAAS}/wxsubmch.do?${params}`, {
      method: "GET",
      referrer: `${SAAS}/wxsubmch.do?method=page`
    });
    assertReportSuccess(response, "\u5FAE\u4FE1\u81EA\u5B9A\u4E49\u6E20\u9053\u4E0A\u62A5");
    const data = readReportData(response);
    const subMchId = normalizeText(data.wxMchId || response.wxMchId || response.data);
    if (!/^\d+$/.test(subMchId)) throw new Error(`\u5FAE\u4FE1\u4E0A\u62A5\u6210\u529F\u4F46\u672A\u8FD4\u56DE\u5B50\u5546\u6237\u53F7: ${JSON.stringify(response)}`);
    return subMchId;
  }
  async function submitCustomAlipayReport(merchantId, options) {
    assertMerchantId(merchantId);
    const channel = resolveAlipayChannel(options);
    const params = new URLSearchParams({
      method: "posreport",
      merchantId,
      sourcePid: channel.id,
      sourceName: channel.name,
      report4M3Flag: "2",
      configType: "",
      notice: "1"
    });
    const response = await requestJson(`${SAAS}/zfbsubmch.do?${params}`, {
      method: "GET",
      referrer: `${SAAS}/zfbsubmch.do?method=page`
    });
    assertReportSuccess(response, "\u652F\u4ED8\u5B9D\u81EA\u5B9A\u4E49\u6E20\u9053\u4E0A\u62A5");
    const data = readReportData(response);
    const subMchId = normalizeText(data.zfbSubMch || response.zfbSubMch || response.data);
    if (!/^\d+$/.test(subMchId)) throw new Error(`\u652F\u4ED8\u5B9D\u4E0A\u62A5\u6210\u529F\u4F46\u672A\u8FD4\u56DE\u5B50\u5546\u6237\u53F7: ${JSON.stringify(response)}`);
    return subMchId;
  }

  // src/api/mapping.ts
  var PAY_TYPE_CODES = {
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
  function extractPayType(onclick) {
    return onclick.match(/payType=\+'([^']*)'/)?.[1] || "";
  }
  function parseMappingHtml(html, type) {
    const document2 = new DOMParser().parseFromString(html, "text/html");
    const subMchHeader = type === "alipay" ? "\u652F\u4ED8\u5B9D\u5546\u6237\u53F7" : "\u5FAE\u4FE1\u5546\u6237\u53F7";
    const table = Array.from(document2.querySelectorAll("table.tablesorter")).find((item) => normalizeText(item.textContent).includes(subMchHeader) && normalizeText(item.textContent).includes("\u901A\u77E5\u72B6\u6001"));
    if (!table) return [];
    const headers = Array.from(table.querySelectorAll("thead th")).map((item) => normalizeText(item.textContent));
    return Array.from(table.querySelectorAll("tbody tr")).map((tableRow) => {
      const cells = Array.from(tableRow.querySelectorAll("td"));
      const values = {};
      headers.forEach((header, index) => {
        values[header] = normalizeText(cells[index]?.textContent);
      });
      const onclick = cells[0]?.querySelector('a[onclick*="getSetTradeStatusPage"]')?.getAttribute("onclick") || "";
      const wxSubMchId = values["\u5FAE\u4FE1\u5546\u6237\u53F7"] || "";
      const zfbSubMchId = values["\u652F\u4ED8\u5B9D\u5546\u6237\u53F7"] || "";
      return {
        ...values,
        merchantId: values["\u4E50\u5237\u5546\u6237\u53F7"] || "",
        wxSubMchId,
        zfbSubMchId,
        subMchId: type === "alipay" ? zfbSubMchId : wxSubMchId,
        channel: values["\u901A\u9053"] || "",
        noticeStatus: values["\u901A\u77E5\u72B6\u6001"] || "",
        createTime: values["\u521B\u5EFA\u65F6\u95F4"] || "",
        payType: extractPayType(onclick) || PAY_TYPE_CODES[normalizeText(values["\u8D39\u7387\u7C7B\u578B"])] || "2"
      };
    }).filter((row) => row.merchantId || row.subMchId);
  }
  async function queryMappings(type, merchantId, options = {}) {
    assertMerchantId(merchantId);
    const range = getDateRange({ days: 1 });
    const isAlipay = type === "alipay";
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
      [isAlipay ? "zfbSubMchId" : "wxSubMchId"]: isAlipay ? options.zfbSubMchId || "" : options.wxSubMchId || "",
      [isAlipay ? "nuccZfbMchId" : "nuccwxMchId"]: isAlipay ? options.nuccZfbMchId || "" : options.nuccwxMchId || "",
      pageSize: options.pageSize || "200"
    });
    const endpoint = isAlipay ? "alipayMappingInfo.do" : "wechatMappingInfo.do";
    const html = await requestText(`${SAAS}/${endpoint}?method=page`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN },
      referrer: `${SAAS}/${endpoint}?method=page`,
      body
    });
    return parseMappingHtml(html, type);
  }
  var queryWechatMappings = (merchantId, options) => queryMappings("wechat", merchantId, options);
  var queryAlipayMappings = (merchantId, options) => queryMappings("alipay", merchantId, options);

  // src/api/notification-status.ts
  var CHANNEL_STATUS_FIELD = {
    \u94F6\u8054: "unionStatus",
    \u7F51\u8054: "nuccStatus",
    \u7F51\u8054\u4E92\u8054\u4E92\u901A: "interconnectionStatus"
  };
  var FIELD_CHANNEL = {
    unionStatus: "\u94F6\u8054",
    nuccStatus: "\u7F51\u8054",
    interconnectionStatus: "\u7F51\u8054\u4E92\u8054\u4E92\u901A"
  };
  function groupRows(rows, target, key) {
    const groups = /* @__PURE__ */ new Map();
    rows.forEach((row) => {
      const subMchId = row[key] || row.subMchId;
      const field = CHANNEL_STATUS_FIELD[normalizeText(row.channel)];
      if (!subMchId || !field) return;
      const groupKey = `${subMchId}__${row.payType || "2"}`;
      const group = groups.get(groupKey) || {
        merchantId: row.merchantId,
        subMchId,
        wxSubMchId: row.wxSubMchId,
        zfbSubMchId: row.zfbSubMchId,
        payType: row.payType || "2",
        rows: [],
        statusParams: {}
      };
      group.rows.push(row);
      group.statusParams[field] = target;
      groups.set(groupKey, group);
    });
    return Array.from(groups.values()).filter((group) => Object.keys(group.statusParams).length > 0);
  }
  function parseStatusResult(html, statusParams) {
    const message = getHtmlMessage(html);
    const targets = Object.entries(statusParams).map(([field, status]) => `${FIELD_CHANNEL[field]}:${status === "1" ? "\u542F\u7528" : "\u7981\u7528"}\u6210\u529F`);
    return { ok: targets.length > 0 && targets.every((target) => message.includes(target)), message, html };
  }
  async function setTradeStatus(type, merchantId, subMchId, payType, statusParams) {
    assertMerchantId(merchantId);
    if (!/^\d+$/.test(subMchId)) throw new Error(`${type === "wechat" ? "\u5FAE\u4FE1" : "\u652F\u4ED8\u5B9D"}\u5546\u6237\u53F7\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u4E14\u5FC5\u987B\u4E3A\u6570\u5B57`);
    if (!Object.keys(statusParams).length) throw new Error("\u81F3\u5C11\u9700\u8981\u4F20\u5165\u4E00\u4E2A\u901A\u9053\u72B6\u6001\u53C2\u6570");
    const endpoint = type === "wechat" ? "wechatMappingInfo.do" : "alipayMappingInfo.do";
    const parameter = type === "wechat" ? "wxSubMchId" : "zfbSubMchId";
    const body = buildFormBody({ merchantId, [parameter]: subMchId, payType, ...statusParams, submit: "\u63D0 \u4EA4" });
    const html = await requestText(`${SAAS}/${endpoint}?method=setTradeStatus`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN },
      referrer: `${SAAS}/${endpoint}?method=getSetTradeStatusPage&merchantId=${encodeURIComponent(merchantId)}&${parameter}=${encodeURIComponent(subMchId)}&payType=${encodeURIComponent(payType)}`,
      body
    });
    return parseStatusResult(html, statusParams);
  }
  async function setGroups(type, merchantId, groups) {
    const changed = [];
    for (const group of groups) {
      const result = await setTradeStatus(type, merchantId, group.subMchId, group.payType, group.statusParams);
      if (!result.ok) throw new Error(`\u8BBE\u7F6E${type === "wechat" ? "\u5FAE\u4FE1" : "\u652F\u4ED8\u5B9D"}\u5B50\u5546\u6237\u53F7 ${group.subMchId} \u672A\u786E\u8BA4\u6210\u529F: ${result.message}`);
      changed.push(group);
    }
    return changed;
  }
  async function confirmWechatEnabled(merchantId, wxSubMchId) {
    await sleep(3e3);
    for (let attempt = 0; attempt <= 3; attempt += 1) {
      if (attempt) await sleep(2e3);
      const rows = await queryWechatMappings(merchantId, { ...getDateRange({ days: 1 }), wxSubMchId });
      const enabled = rows.filter((row) => normalizeText(row.noticeStatus) === "\u542F\u7528");
      if (enabled.length) return enabled;
    }
    throw new Error(`\u8F6E\u8BE2\u8D85\u65F6\uFF0C\u672A\u67E5\u8BE2\u5230\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7 ${wxSubMchId} \u7684\u542F\u7528\u6620\u5C04\u8BB0\u5F55`);
  }
  async function confirmAlipayEnabled(merchantId, zfbSubMchId) {
    const startedAt = Date.now();
    let firstEnabledAt = 0;
    let previousChannels = "";
    let stableCount = 0;
    let latest = [];
    await sleep(1e3);
    while (Date.now() - startedAt <= 3e4) {
      const rows = await queryAlipayMappings(merchantId, { ...getDateRange({ days: 1 }), zfbSubMchId });
      latest = rows.filter((row) => normalizeText(row.noticeStatus) === "\u542F\u7528");
      if (latest.length) {
        const channels = latest.map((row) => normalizeText(row.channel)).filter(Boolean).sort().join("|");
        if (!firstEnabledAt) firstEnabledAt = Date.now();
        stableCount = channels === previousChannels ? stableCount + 1 : 1;
        previousChannels = channels;
        if (Date.now() - firstEnabledAt >= 2e3 && stableCount >= 2) return latest;
      }
      await sleep(2e3);
    }
    if (latest.length) return latest;
    throw new Error(`\u8F6E\u8BE2\u8D85\u65F6\uFF0C\u672A\u67E5\u8BE2\u5230\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7 ${zfbSubMchId} \u7684\u542F\u7528\u6620\u5C04\u8BB0\u5F55`);
  }
  async function disableOldWechatMappings(merchantId, newSubMchId) {
    const rows = await queryWechatMappings(merchantId, { ...getDateRange({ years: 5 }), wxSubMchId: "" });
    const enabled = rows.filter((row) => row.wxSubMchId !== newSubMchId && normalizeText(row.noticeStatus) === "\u542F\u7528");
    return (await setGroups("wechat", merchantId, groupRows(enabled, "0", "wxSubMchId"))).length;
  }
  async function disableOldAlipayMappings(merchantId, newSubMchId) {
    const rows = await queryAlipayMappings(merchantId, { ...getDateRange({ years: 5 }), zfbSubMchId: "" });
    const enabled = rows.filter((row) => row.zfbSubMchId !== newSubMchId && normalizeText(row.noticeStatus) === "\u542F\u7528");
    return (await setGroups("alipay", merchantId, groupRows(enabled, "0", "zfbSubMchId"))).length;
  }

  // src/tools/custom-channel-reset.ts
  function pendingChannel() {
    return { state: "pending" };
  }
  function completeChannel(result, channel, subMchId, update) {
    result[channel] = { state: "success", subMchId };
    update();
  }
  function failChannel(result, channel, error, update) {
    const message = error instanceof Error ? error.message : String(error);
    const current = result[channel];
    result[channel] = current.state === "success" && current.subMchId ? { ...current, error: message, note: `\u540E\u7EED\u6D41\u7A0B\u5931\u8D25\uFF1A${message}` } : { state: "failure", error: message };
    update();
  }
  async function resetWechat(merchantId, options, result, update, log) {
    try {
      const channel = resolveWechatChannel(options);
      log(`\u5F00\u59CB\u5FAE\u4FE1\u81EA\u5B9A\u4E49\u6E20\u9053\u4E0A\u62A5: ${channel.id} ${channel.name}`);
      const subMchId = await submitCustomWechatReport(merchantId, options);
      completeChannel(result, "wechat", subMchId, update);
      log(`\u5FAE\u4FE1\u4E0A\u62A5\u6210\u529F\uFF0C\u65B0\u5B50\u5546\u6237\u53F7: ${subMchId}`);
      await confirmWechatEnabled(merchantId, subMchId);
      log(`\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7 ${subMchId} \u5DF2\u786E\u8BA4\u542F\u7528`);
      if (options.disableOldSubMch !== false) {
        const changed = await disableOldWechatMappings(merchantId, subMchId);
        log(`\u65E7\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7\u5173\u95ED\u5B8C\u6210\uFF0C\u5904\u7406 ${changed} \u4E2A\u5206\u7EC4`);
      }
      if (options.subAppids || options.jsapiPaths) {
        await bindWechatPaymentConfig(merchantId, subMchId, options);
        log(`\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7 ${subMchId} \u652F\u4ED8\u53C2\u6570\u7ED1\u5B9A\u5B8C\u6210`);
      }
    } catch (error) {
      failChannel(result, "wechat", error, update);
    }
  }
  async function resetAlipay(merchantId, options, result, update, log) {
    try {
      const channel = resolveAlipayChannel(options);
      log(`\u5F00\u59CB\u652F\u4ED8\u5B9D\u81EA\u5B9A\u4E49\u6E20\u9053\u4E0A\u62A5: ${channel.id} ${channel.name}`);
      const subMchId = await submitCustomAlipayReport(merchantId, options);
      completeChannel(result, "alipay", subMchId, update);
      log(`\u652F\u4ED8\u5B9D\u4E0A\u62A5\u6210\u529F\uFF0C\u65B0\u5B50\u5546\u6237\u53F7: ${subMchId}`);
      await confirmAlipayEnabled(merchantId, subMchId);
      log(`\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7 ${subMchId} \u5DF2\u786E\u8BA4\u542F\u7528`);
      if (options.disableOldSubMch !== false) {
        const changed = await disableOldAlipayMappings(merchantId, subMchId);
        log(`\u65E7\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7\u5173\u95ED\u5B8C\u6210\uFF0C\u5904\u7406 ${changed} \u4E2A\u5206\u7EC4`);
      }
    } catch (error) {
      failChannel(result, "alipay", error, update);
    }
  }
  async function runCustomChannelReset(merchantIds, reportType, options, log, onResultUpdate, businessLine) {
    const output = [];
    for (const merchantId of merchantIds) {
      const result = {
        merchantId,
        route: "custom",
        businessLine,
        wechat: isRequested(reportType, "wechat") ? pendingChannel() : skippedChannel(),
        alipay: isRequested(reportType, "alipay") ? pendingChannel() : skippedChannel()
      };
      output.push(result);
      const update = () => onResultUpdate([...output]);
      update();
      const tasks = [];
      if (isRequested(reportType, "wechat")) tasks.push(resetWechat(merchantId, options, result, update, log));
      if (isRequested(reportType, "alipay")) tasks.push(resetAlipay(merchantId, options, result, update, log));
      await Promise.all(tasks);
    }
    return output;
  }

  // src/api/merchant-key.ts
  async function configureMerchantKey(merchantId) {
    assertMerchantId(merchantId);
    const html = await requestText(`${SAAS}/merchant-key-info.do?method=add`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      referrer: `${SAAS}/merchant-key-info.do?method=addPage`,
      body: buildFormBody({ merchants: merchantId, submit: "\u786E\u8BA4\u63D0\u4EA4" })
    });
    const htmlError = detectHtmlError(html);
    if (htmlError) throw new Error(htmlError);
    const message = getHtmlMessage(html);
    const successMatch = message.match(/新增成功\s*[：:]\s*(\d+)\s*个/);
    const failureMatch = message.match(/新增失败\s*[：:]\s*(\d+)\s*个/);
    if (!successMatch || !failureMatch) throw new Error(`\u65E0\u6CD5\u786E\u8BA4\u5546\u6237 key \u914D\u7F6E\u7ED3\u679C: ${summarizeHtml(html)}`);
    const successCount = Number(successMatch[1]);
    const failureCount = Number(failureMatch[1]);
    if (successCount < 1 || failureCount > 0) throw new Error(`\u5546\u6237 key \u914D\u7F6E\u5931\u8D25\uFF0C\u65B0\u589E\u6210\u529F ${successCount} \u4E2A\uFF0C\u65B0\u589E\u5931\u8D25 ${failureCount} \u4E2A`);
  }

  // src/tools/merchant-key.ts
  var CONCURRENCY = 5;
  function parseMerchantKeyIds(raw) {
    const merchantIds = raw.split(";").map((item) => item.trim()).filter(Boolean);
    if (!merchantIds.length) throw new Error("\u8BF7\u81F3\u5C11\u8F93\u5165\u4E00\u4E2A\u4E50\u5237\u5546\u6237\u53F7");
    const duplicates = merchantIds.filter((item, index) => merchantIds.indexOf(item) !== index);
    if (duplicates.length) throw new Error(`\u4E50\u5237\u5546\u6237\u53F7\u91CD\u590D: ${duplicates[0]}`);
    const invalid = merchantIds.find((item) => !/^\d{10}$/.test(item));
    if (invalid) throw new Error(`\u4E50\u5237\u5546\u6237\u53F7\u5FC5\u987B\u662F 10 \u4F4D\u6570\u5B57: ${invalid}`);
    return merchantIds;
  }
  async function configureMerchantKeys(merchantIds, log) {
    log(`\u5F00\u59CB\u6279\u91CF\u914D\u7F6E ${merchantIds.length} \u4E2A\u5546\u6237\u7684 key`);
    const results = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < merchantIds.length) {
        const index = cursor;
        cursor += 1;
        const merchantId = merchantIds[index];
        try {
          await configureMerchantKey(merchantId);
          results[index] = { merchantId, ok: true };
          log(`\u5546\u6237 ${merchantId} key \u914D\u7F6E\u6210\u529F`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results[index] = { merchantId, ok: false, error: message };
          log(`\u5546\u6237 ${merchantId} key \u914D\u7F6E\u5931\u8D25: ${message}`, true);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, merchantIds.length) }, () => worker()));
    const failures = results.filter((result) => !result.ok);
    if (failures.length) {
      const details = failures.map((result) => `${result.merchantId}: ${result.error}`).join("\uFF1B");
      throw new Error(`\u5546\u6237 key \u6279\u91CF\u914D\u7F6E\u5B8C\u6210\uFF0C\u6210\u529F ${results.length - failures.length} \u4E2A\uFF0C\u5931\u8D25 ${failures.length} \u4E2A\u3002${details}`);
    }
    log(`\u5546\u6237 key \u6279\u91CF\u914D\u7F6E\u5B8C\u6210\uFF0C\u5171\u6210\u529F ${results.length} \u4E2A`);
    return results;
  }

  // src/api/code-plate.ts
  var CODE_PLATE_RESULT_SUBJECT = "\u7801\u724C\u6279\u91CF\u8F6C\u79FB\u5904\u7406\u7ED3\u679C";
  var CODE_PLATE_RESULT_SOURCE = "\u7801\u724C\u7BA1\u7406-\u7801\u724C\u8F6C\u79FB";
  var CODE_PLATE_ACCEPTED_MESSAGE = "\u540E\u53F0\u6279\u91CF\u5904\u7406\u4E2D\uFF0C\u7ED3\u679C\u4EE5\u7CFB\u7EDF\u5185\u6D88\u606F\u901A\u77E5";
  var CODE_PLATE_TEMPLATE_BASE64 = "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";
  var CODE_PLATE_SHEET_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:etc="http://www.wps.cn/officeDocument/2017/etCustomData"><sheetPr/><dimension ref="A1:D2"/><sheetViews><sheetView tabSelected="1" workbookViewId="0"><selection activeCell="D9" sqref="D9"/></sheetView></sheetViews><sheetFormatPr defaultColWidth="9" defaultRowHeight="16.8" outlineLevelRow="1" outlineLevelCol="3"/><cols><col min="1" max="2" width="11.7692307692308"/></cols><sheetData><row r="1" spans="1:4"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row><row r="2" spans="1:4"><c r="A2" s="1" t="s"><v>4</v></c><c r="B2" s="1" t="s"><v>4</v></c><c r="C2"><v>5267151</v></c><c r="D2"><v>3287859</v></c></row></sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><headerFooter/></worksheet>';
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
  var CRC32_TABLE = (() => {
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
  async function queryCodePlateTransferMessages(values = null) {
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

  // src/tools/code-plate-transfer.ts
  async function transferCodePlates(values, log, onStatus) {
    onStatus("generating", "\u6B63\u5728\u751F\u6210 Excel");
    log(`\u5F00\u59CB\u751F\u6210\u7801\u724C\u5212\u8F6C Excel: ${values.startCode} \u81F3 ${values.endCode}`);
    const file = await createCodePlateTransferFile(values);
    log(`Excel \u751F\u6210\u5B8C\u6210: ${file.name}\uFF08${file.size} \u5B57\u8282\uFF09`);
    onStatus("preparing", "\u6B63\u5728\u8BFB\u53D6\u6D88\u606F\u4E2D\u5FC3\u57FA\u7EBF");
    log("\u6B63\u5728\u8BB0\u5F55\u6D88\u606F\u4E2D\u5FC3\u57FA\u7EBF");
    const baselineMessages = await queryCodePlateTransferMessages();
    const baselineMessageIds = new Set(baselineMessages.map((message) => String(message.id)));
    onStatus("submitting", "\u6B63\u5728\u63D0\u4EA4\u540E\u53F0");
    log(`\u5F00\u59CB\u63D0\u4EA4\u7801\u724C\u5212\u8F6C: ${values.sourceAgent} -> ${values.targetAgent}`);
    await submitCodePlateTransfer(values, { file });
    onStatus("waiting", "\u540E\u53F0\u5DF2\u53D7\u7406\uFF0C\u6B63\u5728\u7B49\u5F85\u5904\u7406\u7ED3\u679C");
    log("\u7801\u724C\u5212\u8F6C\u4EFB\u52A1\u5DF2\u53D7\u7406\uFF0C\u5F00\u59CB\u7B49\u5F85\u6D88\u606F\u4E2D\u5FC3\u5904\u7406\u7ED3\u679C");
    const outcome = await pollCodePlateTransferResult(values, {
      baselineMessageIds,
      pollIntervalMs: 2e3,
      pollTimeoutMs: 6e4,
      onLog: log
    });
    if (outcome.timeout) {
      const unmatchedMessage = outcome.unmatchedMessages?.[0];
      const message = unmatchedMessage ? `\u540E\u53F0\u5DF2\u53D7\u7406\u5E76\u53D1\u73B0\u65B0\u6D88\u606F\uFF0C\u4F46\u53C2\u6570\u672A\u5B8C\u5168\u5339\u914D\uFF0C\u8BF7\u5230\u6D88\u606F\u4E2D\u5FC3\u786E\u8BA4\u3002${summarizeCodePlateMessageValues(unmatchedMessage)}` : "\u540E\u53F0\u5DF2\u53D7\u7406\uFF0C\u4F46\u7B49\u5F85\u7ED3\u679C\u8D85\u65F6\uFF0C\u8BF7\u5230\u6D88\u606F\u4E2D\u5FC3\u786E\u8BA4";
      onStatus("timeout", message);
      log(message);
      return;
    }
    onStatus("success", "\u7801\u724C\u5212\u8F6C\u6210\u529F");
    log(`\u7801\u724C\u5212\u8F6C\u6210\u529F\uFF0C\u6D88\u606FID: ${outcome.result.id}`);
  }

  // src/api/whitelist.ts
  async function addMerchantChangeWhitelist(dataType, dataValue) {
    const response = await requestJson(`${SYT_OMS}/merchantChange/addMerchantChangeWhitelist`, {
      method: "POST",
      timeoutMs: 15e3,
      headers: { "Content-Type": "application/json;charset=UTF-8" },
      body: JSON.stringify({ dataType, dataValue })
    });
    if (String(response.error_code) !== "0") throw new Error(response.error_msg || "\u9632\u5207\u6237\u767D\u540D\u5355\u6DFB\u52A0\u5931\u8D25");
  }

  // src/tools/change-whitelist.ts
  var FIELDS = [
    { key: "mobile", type: "1", label: "\u624B\u673A\u53F7" },
    { key: "idCard", type: "2", label: "\u8EAB\u4EFD\u8BC1\u53F7" },
    { key: "businessLicense", type: "3", label: "\u8425\u4E1A\u6267\u7167\u53F7" },
    { key: "settlementAccount", type: "4", label: "\u7ED3\u7B97\u8D26\u53F7" }
  ];
  async function addChangeWhitelist(values, log, onStatus) {
    const items = FIELDS.map((field) => ({ ...field, value: values[field.key].trim() })).filter((field) => field.value);
    if (!items.length) throw new Error("\u8BF7\u81F3\u5C11\u586B\u5199\u624B\u673A\u53F7\u3001\u8EAB\u4EFD\u8BC1\u53F7\u3001\u8425\u4E1A\u6267\u7167\u53F7\u6216\u7ED3\u7B97\u8D26\u53F7\u4E2D\u7684\u4E00\u9879");
    onStatus("submitting", `\u6B63\u5728\u5E76\u53D1\u63D0\u4EA4 ${items.length} \u9879\u767D\u540D\u5355`);
    log(`\u5F00\u59CB\u6DFB\u52A0\u9632\u5207\u6237\u767D\u540D\u5355\uFF0C\u5171 ${items.length} \u9879`);
    const results = await Promise.all(items.map(async (item) => {
      try {
        await addMerchantChangeWhitelist(item.type, item.value);
        return { label: item.label, ok: true, error: "" };
      } catch (error) {
        return { label: item.label, ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }));
    results.forEach((result) => log(`${result.label}\u9632\u5207\u6237\u767D\u540D\u5355\u6DFB\u52A0${result.ok ? "\u6210\u529F" : `\u5931\u8D25: ${result.error}`}`, !result.ok));
    const failures = results.filter((result) => !result.ok);
    if (failures.length) {
      const message = failures.map((item) => `${item.label}: ${item.error}`).join("\uFF1B");
      onStatus("failure", message);
      throw new Error(`\u9632\u5207\u6237\u767D\u540D\u5355\u6DFB\u52A0\u5B58\u5728\u5931\u8D25\u9879\uFF1A${message}`);
    }
    onStatus("success", "\u9632\u5207\u6237\u767D\u540D\u5355\u6DFB\u52A0\u5B8C\u6210");
  }

  // src/tools/payment-config.ts
  function createdAt2(value) {
    return new Date(String(value || "").replace(" ", "T")).getTime() || 0;
  }
  async function bindLatestWechatPaymentConfig(merchantId, options) {
    const rows = await queryWechatMappings(merchantId, getDateRange({ years: 5 }));
    const row = rows.filter((item) => String(item.merchantId || "") === merchantId && item.wxSubMchId).sort((left, right) => createdAt2(right.createTime) - createdAt2(left.createTime))[0];
    if (!row?.wxSubMchId) throw new Error("\u672A\u67E5\u8BE2\u5230\u53EF\u7ED1\u5B9A\u7684\u6700\u65B0\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7");
    return bindWechatPaymentConfig(merchantId, row.wxSubMchId, options);
  }

  // src/api/device-transfer.ts
  var ENDPOINT = "/base-business/pinpad/newTerminal.do";
  function trim(value) {
    return value.trim();
  }
  function assertSuccess(payload) {
    if (Number(payload?.code) === 0 && payload?.success === true) return payload.data;
    throw new Error(payload?.msg || "\u540E\u53F0\u672A\u8FD4\u56DE\u6210\u529F\u7ED3\u679C");
  }
  async function request(method, values, fetchImpl = fetch) {
    const body = new URLSearchParams(values);
    const response = await fetchImpl(`${ENDPOINT}?method=${encodeURIComponent(method)}`, {
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
    if (!response.ok) throw new Error(`\u8BF7\u6C42\u5931\u8D25 ${response.status}: ${text.slice(0, 200)}`);
    try {
      return assertSuccess(JSON.parse(text));
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`\u63A5\u53E3\u8FD4\u56DE\u975E JSON \u5185\u5BB9: ${text.slice(0, 200)}`);
      throw error;
    }
  }
  function toAgent(data, id) {
    const name = trim(String(data?.agentName || ""));
    const type = trim(String(data?.agentClassName || ""));
    if (!name || !type) throw new Error("\u63A5\u53E3\u672A\u8FD4\u56DE\u5B8C\u6574\u4EE3\u7406\u5546\u4FE1\u606F");
    return { id, name, type };
  }
  function validateDeviceTransfer(values) {
    if (!trim(values.sn)) throw new Error("\u8BF7\u8F93\u5165\u4E50\u5237 SN \u59CB");
    if (values.quantity !== "1") throw new Error("\u673A\u5177\u5212\u62E8\u6570\u91CF\u56FA\u5B9A\u4E3A 1");
    if (!trim(values.oldAgentId) || !trim(values.newAgentId)) throw new Error("\u8BF7\u5148\u67E5\u8BE2\u65E7\u4EE3\u7406\u5546\u548C\u65B0\u4EE3\u7406\u5546\u4FE1\u606F");
    if (trim(values.oldAgentId) === trim(values.newAgentId)) throw new Error("\u65B0\u65E7\u4EE3\u7406\u5546\u7F16\u53F7\u4E0D\u80FD\u76F8\u540C");
  }
  async function queryOldDeviceAgent(sn, fetchImpl = fetch) {
    const deviceSn = trim(sn);
    if (!deviceSn) throw new Error("\u8BF7\u8F93\u5165\u4E50\u5237 SN \u59CB");
    const data = await request("changeAgentCheckSn", {
      pinpadUuidStart: deviceSn,
      pinpadUuidTotal: "1"
    }, fetchImpl);
    const id = trim(String(data?.oldAgentId || ""));
    if (!id) throw new Error("\u63A5\u53E3\u672A\u8FD4\u56DE\u65E7\u4EE3\u7406\u5546\u7F16\u53F7");
    return toAgent(data, id);
  }
  async function queryNewDeviceAgent(sn, oldAgentId, newAgentId, fetchImpl = fetch) {
    const deviceSn = trim(sn);
    const oldId = trim(oldAgentId);
    const newId = trim(newAgentId);
    if (!deviceSn || !oldId || !newId) throw new Error("\u8BF7\u5148\u586B\u5199 SN\u3001\u65B0\u4EE3\u7406\u5546\u7F16\u53F7\u5E76\u67E5\u8BE2\u65E7\u4EE3\u7406\u5546");
    const data = await request("changeAgentCheckAgent", {
      pinpadUuid: deviceSn,
      oldAgentId: oldId,
      newAgentId: newId
    }, fetchImpl);
    return toAgent(data, newId);
  }
  var wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  async function submitDeviceTransfer(values, onStep, fetchImpl = fetch) {
    validateDeviceTransfer(values);
    const requestValues = {
      pinpadUuidStart: trim(values.sn),
      pinpadUuidTotal: "1",
      oldAgentId: trim(values.oldAgentId),
      newAgentId: trim(values.newAgentId)
    };
    await request("changeAgentBeforeSubmit", requestValues, fetchImpl);
    onStep?.("\u6821\u9A8C\u901A\u8FC7\uFF0C0.5 \u79D2\u540E\u53D1\u8D77\u6B63\u5F0F\u5212\u62E8");
    await wait(500);
    await request("changeAgent", requestValues, fetchImpl);
  }

  // src/tools/device-transfer.ts
  var queryOldDeviceAgent2 = (sn) => queryOldDeviceAgent(sn);
  var queryNewDeviceAgent2 = (sn, oldAgentId, newAgentId) => queryNewDeviceAgent(sn, oldAgentId, newAgentId);
  var submitDeviceTransfer2 = (values, onStep) => submitDeviceTransfer(values, onStep);

  // src/content/index.ts
  var VERSION = "1.0.2";
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
    return results.map((result) => {
      const channels = [
        result.wechat.state !== "skipped" ? `\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7:${channelText(result.wechat)}` : "",
        result.alipay.state !== "skipped" ? `\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7:${channelText(result.alipay)}` : ""
      ].filter(Boolean);
      return [`\u4E50\u5237\u5546\u6237\u53F7${result.merchantId}`, channels.join(" ")].join("\n");
    }).join("\n");
  }
  function businessLineName(businessLine) {
    return businessLine === "lhsd" ? "\u8054\u5408\u6536\u5355" : "\u6536\u94F6\u901A";
  }
  function createPanel() {
    document.getElementById("syt-extension-root")?.remove();
    const root = document.createElement("div");
    root.id = "syt-extension-root";
    root.className = "collapsed";
    root.innerHTML = `
    <button id="syt-extension-float" class="float-ball" type="button" title="\u6253\u5F00\u8FD0\u8425\u5DE5\u5177">\u8FD0\u8425\u5DE5\u5177</button>
    <section class="panel" aria-label="\u8FD0\u8425\u5DE5\u5177">
      <header><div><button id="syt-back" class="icon-button" type="button" title="\u8FD4\u56DE">\u2190</button><span id="syt-title">\u8FD0\u8425\u5DE5\u5177 v${VERSION}</span></div><button id="syt-close" class="icon-button" type="button" title="\u6536\u8D77">\xD7</button></header>
      <main>
        <section id="syt-view-reset" class="view active">
          <label>\u4E50\u5237\u5546\u6237\u53F7<input id="syt-merchant-ids" placeholder="\u91CD\u7F6E\u6700\u591A 5 \u4E2A\uFF1B\u914D\u7F6E key \u4E0D\u9650\uFF0C\u4EE5 ; \u5206\u9694" autocomplete="off"></label>
          <fieldset class="business-line"><legend>\u91CD\u7F6E\u4E1A\u52A1\u7EBF</legend><label><input type="radio" name="syt-business-line" value="syt" checked>\u6536\u94F6\u901A</label><label><input type="radio" name="syt-business-line" value="lhsd">\u8054\u5408\u6536\u5355</label></fieldset>
          <div class="form-row"><label>\u91CD\u7F6E\u901A\u9053<select id="syt-report-type"><option value="ALL">\u5168\u90E8\u91CD\u7F6E</option><option value="WECHAT">\u5FAE\u4FE1\u91CD\u7F6E</option><option value="ALIPAY">\u652F\u4ED8\u5B9D\u91CD\u7F6E</option></select></label><label>\u4E0A\u62A5\u9884\u8BBE<select id="syt-preset">${PRESETS.map((preset2, index) => `<option value="${index}">${preset2.name}</option>`).join("")}</select></label></div>
          <div id="syt-channel-options" class="optional-options"><div class="section-title">\u53EF\u9009\u4E0A\u62A5\u6E20\u9053</div><div class="form-row"><label>\u5FAE\u4FE1\u6E20\u9053\u53F7<input id="syt-wx-channel-id" autocomplete="off"></label><label>\u5FAE\u4FE1\u6E20\u9053\u4E3B\u4F53<input id="syt-wx-channel-name" autocomplete="off"></label></div><div class="form-row"><label>\u652F\u4ED8\u5B9D\u6E20\u9053\u53F7<input id="syt-alipay-channel-id" autocomplete="off"></label><label>\u652F\u4ED8\u5B9D\u6E20\u9053\u4E3B\u4F53<input id="syt-alipay-channel-name" autocomplete="off"></label></div></div>
          <div class="section-title">\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570\uFF08\u53EF\u9009\uFF09</div><label>appid<input id="syt-appid" autocomplete="off"></label><label>\u652F\u4ED8\u6388\u6743\u76EE\u5F55<input id="syt-jsapi-paths" autocomplete="off"></label>
          <div class="reset-actions"><button id="syt-run-reset" class="primary" type="button">\u6267\u884C\u91CD\u7F6E</button><button id="syt-run-payment-config" type="button">\u914D\u7F6E\u7ED1\u5B9A</button></div>
          <div class="shared-tool-actions"><button id="syt-run-key" type="button">\u914D\u7F6E\u5546\u6237 key</button></div>
          <div id="syt-reset-status" class="status"></div>
          <div class="section-title">\u672C\u6B21\u91CD\u7F6E\u7ED3\u679C</div><div class="result-table-wrap"><table><thead><tr><th>\u4E50\u5237\u5546\u6237\u53F7</th><th>\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7</th><th>\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7</th><th>\u65B9\u5F0F</th></tr></thead><tbody id="syt-results"><tr><td colspan="4" class="empty">\u6267\u884C\u540E\u663E\u793A\u7ED3\u679C</td></tr></tbody></table></div>
          <div class="actions"><button id="syt-copy" type="button" disabled>\u590D\u5236\u7ED3\u679C</button><button class="nav-tool" data-view="code" type="button">\u7801\u724C\u5212\u8F6C</button><button class="nav-tool" data-view="device" type="button">\u6536\u94F6\u901A\u673A\u5177\u5212\u62E8</button><button class="nav-tool" data-view="whitelist" type="button">\u9632\u5207\u6237\u767D\u540D\u5355</button></div>
        </section>
        <section id="syt-view-code" class="view"><div class="form-row"><label>\u7801\u724C\u5F00\u59CB\u7F16\u53F7<input id="syt-code-start" autocomplete="off"></label><label>\u7801\u724C\u7ED3\u675F\u7F16\u53F7<input id="syt-code-end" autocomplete="off"></label></div><div class="form-row"><label>\u539F\u4EE3\u7406\u5546<input id="syt-code-source" autocomplete="off"></label><label>\u65B0\u4EE3\u7406\u5546<input id="syt-code-target" autocomplete="off"></label></div><button id="syt-run-code" class="primary" type="button">\u786E\u8BA4\u5212\u8F6C</button><div id="syt-code-status" class="status"></div></section>
        <section id="syt-view-device" class="view"><div class="section-title">\u673A\u5177\u4FE1\u606F</div><div class="form-row"><label>\u4E50\u5237 SN \u59CB<input id="syt-device-sn" autocomplete="off"></label><label>\u6570\u91CF<input id="syt-device-quantity" value="1" readonly></label></div><button id="syt-device-query-old" type="button">\u67E5\u8BE2\u65E7\u4EE3\u7406\u5546</button><div class="section-title">\u65E7\u4EE3\u7406\u5546</div><label>\u65E7\u4EE3\u7406\u5546\u7F16\u53F7<input id="syt-device-old-id" readonly></label><label>\u65E7\u4EE3\u7406\u5546\u540D\u79F0<input id="syt-device-old-name" readonly></label><label>\u65E7\u4EE3\u7406\u5546\u7C7B\u578B<input id="syt-device-old-type" readonly></label><div class="section-title">\u65B0\u4EE3\u7406\u5546</div><label>\u65B0\u4EE3\u7406\u5546\u7F16\u53F7<input id="syt-device-new-id" autocomplete="off"></label><label>\u65B0\u4EE3\u7406\u5546\u540D\u79F0<input id="syt-device-new-name" readonly></label><label>\u65B0\u4EE3\u7406\u5546\u7C7B\u578B<input id="syt-device-new-type" readonly></label><button id="syt-run-device" class="primary" type="button">\u786E\u8BA4\u5212\u62E8</button><div id="syt-device-status" class="status"></div></section>
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
    const businessLineInputs = Array.from(root.querySelectorAll('input[name="syt-business-line"]'));
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
    const runPaymentConfig = byId(root, "syt-run-payment-config");
    const runKey = byId(root, "syt-run-key");
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
      runPaymentConfig.disabled = next;
      runKey.disabled = next;
      runReset.textContent = next ? "\u5904\u7406\u4E2D..." : "\u6267\u884C\u91CD\u7F6E";
    };
    const reportOptions = () => ({
      channelId: wxChannelId.value.trim(),
      channelName: wxChannelName.value.trim(),
      sourcePid: alipayChannelId.value.trim(),
      sourceName: alipayChannelName.value.trim(),
      subAppids: appids.value.trim(),
      jsapiPaths: jsapiPaths.value.trim(),
      disableOldSubMch: true
    });
    const selectedBusinessLine = () => businessLineInputs.find((input) => input.checked)?.value === "lhsd" ? "lhsd" : "syt";
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
        copyButton.classList.remove("copied");
        copyButton.textContent = "\u590D\u5236\u7ED3\u679C";
        return;
      }
      results.forEach((result) => {
        const row = document.createElement("tr");
        const lineName = businessLineName(result.businessLine || "syt");
        const routeText = result.route === "batch" ? `${lineName}\u6279\u91CF` : `${lineName}\u81EA\u5B9A\u4E49\u6E20\u9053`;
        [result.merchantId, channelText(result.wechat), channelText(result.alipay), routeText].forEach((value) => {
          const cell = document.createElement("td");
          cell.textContent = value;
          if (value.startsWith("\u5931\u8D25")) cell.className = "error";
          row.append(cell);
        });
        resultBody.append(row);
      });
      copyButton.disabled = false;
      copyButton.classList.remove("copied");
      copyButton.textContent = "\u590D\u5236\u7ED3\u679C";
    };
    const copyCurrentResults = async (automatic = false) => {
      if (!latestResults.length) return;
      try {
        await copyText(copyResultText(latestResults));
        copyButton.classList.add("copied");
        copyButton.textContent = "\u2713 \u5DF2\u590D\u5236";
        log(automatic ? "\u5DF2\u81EA\u52A8\u590D\u5236\u672C\u6279\u91CD\u7F6E\u7ED3\u679C" : "\u5DF2\u590D\u5236\u672C\u6279\u91CD\u7F6E\u7ED3\u679C");
      } catch (error) {
        copyButton.classList.remove("copied");
        copyButton.textContent = "\u590D\u5236\u7ED3\u679C";
        log(`\u590D\u5236\u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`, true);
      }
    };
    const showView = (name) => {
      root.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `syt-view-${name}`));
      backButton.classList.toggle("visible", name !== "reset");
      title.textContent = `${name === "reset" ? "\u8FD0\u8425\u5DE5\u5177" : { code: "\u7801\u724C\u5212\u8F6C", device: "\u673A\u5177\u5212\u62E8", whitelist: "\u9632\u5207\u6237\u767D\u540D\u5355" }[name]} v${VERSION}`;
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
    resetInput.addEventListener("dblclick", () => {
      resetInput.value = "";
      resetInput.focus();
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
      await copyCurrentResults();
    });
    runReset.addEventListener("click", async () => {
      if (busy) return;
      try {
        const merchantIds = parseMerchantIds(resetInput.value);
        const type = reportType.value;
        const businessLine = selectedBusinessLine();
        const reportMode = businessLine === "lhsd" ? "COMMON" : "SYT";
        const options = reportOptions();
        validateChannels(options);
        if (type === "ALIPAY" && (options.subAppids || options.jsapiPaths)) {
          throw new Error("\u652F\u4ED8\u5B9D\u5355\u72EC\u91CD\u7F6E\u4E0D\u80FD\u7ED1\u5B9A\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570\uFF0C\u8BF7\u9009\u62E9\u5FAE\u4FE1\u6216\u5168\u90E8\u91CD\u7F6E");
        }
        setBusy(true);
        renderResults([]);
        const useCustomChannel = hasCustomChannel(options);
        setStatus(resetStatus, useCustomChannel ? `\u6B63\u5728\u5904\u7406${businessLineName(businessLine)}\u81EA\u5B9A\u4E49\u6E20\u9053\u91CD\u7F6E` : `\u6B63\u5728\u8C03\u7528${businessLineName(businessLine)}\u6279\u91CF\u91CD\u7F6E\u63A5\u53E3`);
        log(`\u5F00\u59CB${businessLineName(businessLine)}${useCustomChannel ? "\u81EA\u5B9A\u4E49\u6E20\u9053" : "\u6279\u91CF"}\u91CD\u7F6E: ${merchantIds.join("\uFF1B")}`);
        const results = useCustomChannel ? await runCustomChannelReset(merchantIds, type, options, log, renderResults, businessLine) : await runBatchReset(merchantIds, type, options, log, reportMode);
        renderResults(results);
        await copyCurrentResults(true);
        const failed = results.filter((item) => item.wechat.state === "failure" || item.alipay.state === "failure" || item.wechat.error || item.alipay.error).length;
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
    runPaymentConfig.addEventListener("click", async () => {
      if (busy) return;
      try {
        const merchantIds = parseMerchantIds(resetInput.value);
        if (merchantIds.length !== 1) throw new Error("\u914D\u7F6E\u7ED1\u5B9A\u4E00\u6B21\u53EA\u80FD\u5904\u7406\u4E00\u4E2A\u4E50\u5237\u5546\u6237\u53F7");
        const options = reportOptions();
        if (!options.subAppids && !options.jsapiPaths) {
          throw new Error("\u8BF7\u81F3\u5C11\u586B\u5199 appid \u6216\u652F\u4ED8\u6388\u6743\u76EE\u5F55");
        }
        setBusy(true);
        setStatus(resetStatus, "\u6B63\u5728\u67E5\u8BE2\u6700\u65B0\u5FAE\u4FE1\u6620\u5C04\u8BB0\u5F55\u5E76\u914D\u7F6E\u7ED1\u5B9A...");
        log(`\u5F00\u59CB\u4E3A\u5546\u6237 ${merchantIds[0]} \u914D\u7F6E\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570`);
        const result = await bindLatestWechatPaymentConfig(merchantIds[0], options);
        const id = result.id || "-";
        setStatus(resetStatus, "\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570\u7ED1\u5B9A\u5B8C\u6210");
        log(`\u67E5\u8BE2\u5230\u6700\u65B0\u5FAE\u4FE1\u6620\u5C04\u8BB0\u5F55\uFF1A\u5B50\u5546\u6237\u53F7 ${result.wxSubMchId || "-"}\uFF0Cid ${id}`);
        log(`\u5546\u6237 ${merchantIds[0]} \u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570\u7ED1\u5B9A\u5B8C\u6210\uFF0C\u914D\u7F6E\u8BB0\u5F55 id: ${id}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(resetStatus, message, true);
        log(`\u914D\u7F6E\u7ED1\u5B9A\u5931\u8D25: ${message}`, true);
      } finally {
        setBusy(false);
      }
    });
    runKey.addEventListener("click", async () => {
      if (busy) return;
      try {
        const merchantIds = parseMerchantKeyIds(resetInput.value);
        setBusy(true);
        setStatus(resetStatus, `\u6B63\u5728\u6279\u91CF\u914D\u7F6E ${merchantIds.length} \u4E2A\u5546\u6237\u7684 key...`);
        await configureMerchantKeys(merchantIds, log);
        setStatus(resetStatus, `\u5546\u6237 key \u914D\u7F6E\u5B8C\u6210\uFF0C\u5171\u6210\u529F ${merchantIds.length} \u4E2A`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(resetStatus, message, true);
        log(`\u914D\u7F6E\u5546\u6237 key \u5931\u8D25: ${message}`, true);
      } finally {
        setBusy(false);
      }
    });
    byId(root, "syt-run-code").addEventListener("click", async () => {
      const status = byId(root, "syt-code-status");
      const values = { startCode: byId(root, "syt-code-start").value.trim(), endCode: byId(root, "syt-code-end").value.trim(), sourceAgent: byId(root, "syt-code-source").value.trim(), targetAgent: byId(root, "syt-code-target").value.trim() };
      try {
        setStatus(status, "\u5904\u7406\u4E2D...");
        await transferCodePlates(values, log, (_state, message) => setStatus(status, message));
        setStatus(status, "\u7801\u724C\u5212\u8F6C\u5B8C\u6210");
      } catch (error) {
        setStatus(status, error instanceof Error ? error.message : String(error), true);
      }
    });
    const deviceSn = byId(root, "syt-device-sn");
    const deviceOldId = byId(root, "syt-device-old-id");
    const deviceOldName = byId(root, "syt-device-old-name");
    const deviceOldType = byId(root, "syt-device-old-type");
    const deviceNewId = byId(root, "syt-device-new-id");
    const deviceNewName = byId(root, "syt-device-new-name");
    const deviceNewType = byId(root, "syt-device-new-type");
    const deviceQueryOld = byId(root, "syt-device-query-old");
    const deviceSubmit = byId(root, "syt-run-device");
    const deviceStatus = byId(root, "syt-device-status");
    let deviceBusy = false;
    let oldAgentLookupKey = "";
    let newAgentLookupKey = "";
    const deviceValues = () => ({
      sn: deviceSn.value.trim(),
      quantity: "1",
      oldAgentId: deviceOldId.value.trim(),
      oldAgentName: deviceOldName.value.trim(),
      oldAgentType: deviceOldType.value.trim(),
      newAgentId: deviceNewId.value.trim(),
      newAgentName: deviceNewName.value.trim(),
      newAgentType: deviceNewType.value.trim()
    });
    const setDeviceBusy = (next) => {
      deviceBusy = next;
      deviceQueryOld.disabled = next;
      deviceSubmit.disabled = next;
      deviceSn.disabled = next;
      deviceNewId.disabled = next;
    };
    const clearNewAgent = () => {
      deviceNewName.value = "";
      deviceNewType.value = "";
      newAgentLookupKey = "";
    };
    const clearOldAgent = () => {
      deviceOldId.value = "";
      deviceOldName.value = "";
      deviceOldType.value = "";
      oldAgentLookupKey = "";
      clearNewAgent();
    };
    const loadOldAgent = async () => {
      const sn = deviceSn.value.trim();
      clearOldAgent();
      const agent = await queryOldDeviceAgent2(sn);
      deviceOldId.value = agent.id;
      deviceOldName.value = agent.name;
      deviceOldType.value = agent.type;
      oldAgentLookupKey = sn;
      log(`\u673A\u5177 ${sn} \u7684\u65E7\u4EE3\u7406\u5546: ${agent.id} ${agent.name}`);
    };
    const loadNewAgent = async () => {
      const sn = deviceSn.value.trim();
      if (oldAgentLookupKey !== sn) await loadOldAgent();
      const newAgentId = deviceNewId.value.trim();
      clearNewAgent();
      const agent = await queryNewDeviceAgent2(sn, deviceOldId.value, newAgentId);
      deviceNewName.value = agent.name;
      deviceNewType.value = agent.type;
      newAgentLookupKey = `${sn}|${deviceOldId.value}|${newAgentId}`;
      log(`\u673A\u5177 ${sn} \u7684\u65B0\u4EE3\u7406\u5546: ${agent.id} ${agent.name}`);
    };
    const runDeviceLookup = (label, runner) => async () => {
      if (deviceBusy) return;
      setDeviceBusy(true);
      try {
        setStatus(deviceStatus, `${label}\u4E2D...`);
        await runner();
        setStatus(deviceStatus, `${label}\u5B8C\u6210`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(deviceStatus, message, true);
        log(`${label}\u5931\u8D25: ${message}`, true);
      } finally {
        setDeviceBusy(false);
      }
    };
    deviceQueryOld.addEventListener("click", runDeviceLookup("\u67E5\u8BE2\u65E7\u4EE3\u7406\u5546", loadOldAgent));
    deviceSn.addEventListener("change", runDeviceLookup("\u67E5\u8BE2\u65E7\u4EE3\u7406\u5546", loadOldAgent));
    deviceNewId.addEventListener("change", runDeviceLookup("\u67E5\u8BE2\u65B0\u4EE3\u7406\u5546", loadNewAgent));
    deviceSubmit.addEventListener("click", async () => {
      if (deviceBusy) return;
      setDeviceBusy(true);
      try {
        const sn = deviceSn.value.trim();
        if (oldAgentLookupKey !== sn) await loadOldAgent();
        const newKey = `${sn}|${deviceOldId.value}|${deviceNewId.value.trim()}`;
        if (newAgentLookupKey !== newKey) await loadNewAgent();
        setStatus(deviceStatus, "\u6B63\u5728\u6821\u9A8C\u5212\u62E8\u6761\u4EF6...");
        await submitDeviceTransfer2(deviceValues(), (message) => {
          setStatus(deviceStatus, message);
          log(message);
        });
        setStatus(deviceStatus, "\u673A\u5177\u5212\u62E8\u6210\u529F");
        log(`\u673A\u5177 ${sn} \u5212\u62E8\u6210\u529F`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(deviceStatus, `\u673A\u5177\u5212\u62E8\u5931\u8D25: ${message}`, true);
        log(`\u673A\u5177\u5212\u62E8\u5931\u8D25: ${message}`, true);
      } finally {
        setDeviceBusy(false);
      }
    });
    byId(root, "syt-run-whitelist").addEventListener("click", async () => {
      const status = byId(root, "syt-white-status");
      const values = { mobile: byId(root, "syt-white-mobile").value.trim(), idCard: byId(root, "syt-white-id").value.trim(), businessLicense: byId(root, "syt-white-license").value.trim(), settlementAccount: byId(root, "syt-white-account").value.trim() };
      try {
        setStatus(status, "\u5904\u7406\u4E2D...");
        await addChangeWhitelist(values, log, (_state, message) => setStatus(status, message));
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
    createPanel();
  }
  bootstrap();
})();
