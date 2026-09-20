"use strict";
(() => {
  // src/api/http.ts
  var ORIGIN = "https://om.leshuazf.com";
  var SAAS = `${ORIGIN}/saasadmin`;
  var SYT_OMS = `${ORIGIN}/syt_oms`;
  var USER_CENTER = `${ORIGIN}/lsuser_center`;
  function isOperationsBackendPage() {
    return window.location.origin === ORIGIN;
  }
  function assertBackendUrl(url) {
    const resolved = new URL(url, ORIGIN);
    if (resolved.origin !== ORIGIN) throw new Error(`\u7981\u6B62\u8BF7\u6C42\u975E\u8FD0\u8425\u540E\u53F0\u5730\u5740: ${resolved.origin}`);
    return resolved.href;
  }
  async function sendBackendRequest(request2) {
    const message = { type: "operations:backend-request", request: request2 };
    try {
      const response = await chrome.runtime.sendMessage(message);
      if (!response) throw new Error("\u6269\u5C55\u540E\u53F0\u6CA1\u6709\u8FD4\u56DE\u8BF7\u6C42\u7ED3\u679C");
      if (!response.ok) throw new Error(response.error || `\u8BF7\u6C42\u5931\u8D25 ${response.status}: ${response.text.slice(0, 200)}`);
      return response;
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      throw new Error(`\u65E0\u6CD5\u8FDE\u63A5\u8FD0\u8425\u540E\u53F0: ${messageText}`);
    }
  }
  function serializeBody(body) {
    if (body == null) return void 0;
    if (typeof body === "string") return body;
    if (body instanceof URLSearchParams) return body.toString();
    throw new Error("\u5F53\u524D\u8DE8\u57DF\u8BF7\u6C42\u53EA\u652F\u6301\u6587\u672C\u6216\u8868\u5355\u53C2\u6570");
  }
  function headersToRecord(headers) {
    const output = {};
    new Headers(headers).forEach((value, key) => {
      output[key] = value;
    });
    return output;
  }
  function bytesToBase64(bytes) {
    const chunkSize = 32768;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }
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
    const resolvedUrl = assertBackendUrl(url);
    const requestHeaders = {
      Accept: accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "X-Requested-With": "XMLHttpRequest",
      ...headersToRecord(headers)
    };
    if (!isOperationsBackendPage()) {
      const response = await sendBackendRequest({
        kind: "text",
        url: resolvedUrl,
        method: requestOptions.method || "GET",
        headers: requestHeaders,
        body: serializeBody(requestOptions.body),
        cache: requestOptions.cache,
        timeoutMs
      });
      return response.text;
    }
    const controller = timeoutMs ? new AbortController() : void 0;
    const timeout = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : void 0;
    try {
      const response = await fetch(resolvedUrl, {
        credentials: "include",
        redirect: "follow",
        ...requestOptions,
        signal: controller?.signal ?? requestOptions.signal,
        headers: requestHeaders
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
  async function requestMultipartText(url, fields, fileField, file, timeoutMs = 3e4, headers) {
    const response = await sendBackendRequest({
      kind: "multipart",
      url: assertBackendUrl(url),
      fields,
      fileField,
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileBase64: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
      headers,
      timeoutMs
    });
    return response.text;
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
  async function submitQuickReport(merchantIds, reportType, reportMode = "SYT", fetchImpl) {
    const body = new URLSearchParams({
      merchantIds: merchantIds.join(";"),
      reportType,
      reportMode
    });
    const url = `${ORIGIN}/lspos/atBatchTask.do?method=quickManualReport`;
    let text;
    if (fetchImpl) {
      const response = await fetchImpl(url, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest"
        },
        body
      });
      text = await response.text();
      if (!response.ok) throw new Error(`\u6279\u91CF\u91CD\u7F6E\u8BF7\u6C42\u5931\u8D25 ${response.status}: ${text.slice(0, 200)}`);
    } else {
      text = await requestText(url, {
        method: "POST",
        accept: "application/json, text/javascript, */*; q=0.01",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body
      });
    }
    try {
      return parseQuickReportResponse(JSON.parse(text), merchantIds, reportType);
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`\u6279\u91CF\u91CD\u7F6E\u63A5\u53E3\u8FD4\u56DE\u975E JSON \u5185\u5BB9: ${text.slice(0, 200)}`);
      throw error;
    }
  }

  // src/sidepanel/helpers.ts
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

  // node_modules/lucide/dist/esm/defaultAttributes.mjs
  var defaultAttributes = {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  };

  // node_modules/lucide/dist/esm/createElement.mjs
  var createSVGElement = ([tag, attrs, children]) => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs).forEach((name) => {
      element.setAttribute(name, String(attrs[name]));
    });
    if (children?.length) {
      children.forEach((child) => {
        const childElement = createSVGElement(child);
        element.appendChild(childElement);
      });
    }
    return element;
  };
  var createElement = (iconNode, customAttrs = {}) => {
    const tag = "svg";
    const attrs = {
      ...defaultAttributes,
      ...customAttrs
    };
    return createSVGElement([tag, attrs, iconNode]);
  };

  // node_modules/lucide/dist/esm/icons/arrow-left.mjs
  var ArrowLeft = [
    ["path", { d: "m12 19-7-7 7-7" }],
    ["path", { d: "M19 12H5" }]
  ];

  // node_modules/lucide/dist/esm/icons/check.mjs
  var Check = [["path", { d: "M20 6 9 17l-5-5" }]];

  // node_modules/lucide/dist/esm/icons/chevron-right.mjs
  var ChevronRight = [["path", { d: "m9 18 6-6-6-6" }]];

  // node_modules/lucide/dist/esm/icons/copy.mjs
  var Copy = [
    ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" }],
    ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }]
  ];

  // node_modules/lucide/dist/esm/icons/trash.mjs
  var Trash = [
    ["path", { d: "M10 11v6" }],
    ["path", { d: "M14 11v6" }],
    ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" }],
    ["path", { d: "M3 6h18" }],
    ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }]
  ];

  // node_modules/lucide/dist/esm/icons/wrench.mjs
  var Wrench = [
    [
      "path",
      {
        d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"
      }
    ]
  ];

  // node_modules/lucide/dist/esm/icons/x.mjs
  var X = [
    ["path", { d: "M18 6 6 18" }],
    ["path", { d: "m6 6 12 12" }]
  ];

  // src/sidepanel/icons.ts
  var icons = { back: ArrowLeft, check: Check, chevron: ChevronRight, copy: Copy, trash: Trash, wrench: Wrench, close: X };
  function icon(name) {
    return createElement(icons[name], { width: 18, height: 18, "stroke-width": 1.8, "aria-hidden": "true", focusable: "false" }).outerHTML;
  }
  function setButtonLabel(button, name, label) {
    button.innerHTML = icon(name);
    if (label) button.append(document.createTextNode(label));
  }

  // src/sidepanel/results.ts
  function copyResultText(results) {
    return results.map((result) => {
      const channels = [
        result.wechat.state !== "skipped" ? `\u5FAE\u4FE1\u5B50\u5546\u6237\u53F7:${channelText(result.wechat)}` : "",
        result.alipay.state !== "skipped" ? `\u652F\u4ED8\u5B9D\u5B50\u5546\u6237\u53F7:${channelText(result.alipay)}` : ""
      ].filter(Boolean);
      return [`\u4E50\u5237\u5546\u6237\u53F7${result.merchantId}`, channels.join(" ")].join("\n");
    }).join("\n");
  }
  function resultSummary(result, running) {
    const channels = [result.wechat, result.alipay].filter((channel) => channel.state !== "skipped");
    if (channels.some((channel) => channel.state === "failure" || channel.error)) return { label: "\u5B58\u5728\u5931\u8D25\u9879", tone: "error" };
    if (running || channels.some((channel) => channel.state === "pending")) return { label: "\u5904\u7406\u4E2D", tone: "pending" };
    return channels.length ? { label: "\u5DF2\u5B8C\u6210", tone: "success" } : { label: "\u672A\u6267\u884C", tone: "muted" };
  }
  function textElement(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
  }
  function renderResultList(container, results, running, onError) {
    container.replaceChildren();
    if (!results.length) {
      container.append(textElement("p", "empty", running ? "\u6B63\u5728\u7B49\u5F85\u540E\u53F0\u7ED3\u679C..." : "\u6682\u65E0\u91CD\u7F6E\u7ED3\u679C"));
      return;
    }
    for (const result of results) {
      const item = textElement("article", "merchant-result", "");
      const heading = textElement("div", "merchant-heading", "");
      const name = textElement("div", "merchant-name", "\u4E50\u5237\u5546\u6237\u53F7 ");
      name.append(textElement("strong", "", result.merchantId));
      const status = resultSummary(result, running);
      heading.append(name, textElement("span", `result-status ${status.tone}`, status.label));
      const lineName = result.businessLine === "lhsd" ? "\u8054\u5408\u6536\u5355" : "\u6536\u94F6\u901A";
      item.append(heading, textElement("div", "result-route", `${lineName} \xB7 ${result.route === "batch" ? "\u6279\u91CF\u91CD\u7F6E" : "\u81EA\u5B9A\u4E49\u6E20\u9053"}`));
      for (const [key, label] of [["wechat", "\u5FAE\u4FE1"], ["alipay", "\u652F\u4ED8\u5B9D"]]) {
        const channel = result[key];
        if (channel.state === "skipped") continue;
        const row = textElement("div", "channel-result", "");
        const content = textElement("div", "channel-content", "");
        content.append(textElement("span", channel.state === "failure" ? "error" : "submerchant-id", channel.subMchId || channelText(channel)));
        if (channel.subMchId && (channel.error || channel.note)) {
          content.append(textElement("div", channel.error ? "channel-note error" : "channel-note", channel.note || `\u540E\u7EED\u6D41\u7A0B\u5931\u8D25\uFF1A${channel.error}`));
        }
        row.append(textElement("span", "channel-name", label), content);
        if (channel.subMchId) {
          const copy = document.createElement("button");
          copy.type = "button";
          copy.className = "icon-button copy-channel";
          copy.title = `\u590D\u5236${label}\u5B50\u5546\u6237\u53F7`;
          copy.setAttribute("aria-label", copy.title);
          setButtonLabel(copy, "copy", "");
          copy.addEventListener("click", async () => {
            try {
              await copyText(channel.subMchId);
              copy.classList.add("copied");
              setButtonLabel(copy, "check", "");
              copy.title = "\u5DF2\u590D\u5236";
              copy.setAttribute("aria-label", "\u5DF2\u590D\u5236");
            } catch (error) {
              onError(`\u590D\u5236\u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`);
            }
          });
          row.append(copy);
        }
        item.append(row);
      }
      container.append(item);
    }
  }

  // src/sidepanel/display.ts
  var DISPLAY_SIZE_KEY = "operations-display-size";
  function resolveDisplaySize(saved, platform) {
    if (saved === "compact" || saved === "standard" || saved === "large") return saved;
    return /mac/i.test(platform) ? "compact" : "standard";
  }
  function initializeDisplaySize(select, status) {
    let saved = null;
    try {
      saved = localStorage.getItem(DISPLAY_SIZE_KEY);
    } catch {
    }
    const apply = (value) => {
      document.documentElement.dataset.displaySize = value;
      select.value = value;
    };
    apply(resolveDisplaySize(saved, navigator.platform));
    select.addEventListener("change", () => {
      const value = resolveDisplaySize(select.value, navigator.platform);
      apply(value);
      try {
        localStorage.setItem(DISPLAY_SIZE_KEY, value);
        status.textContent = "";
      } catch {
        status.textContent = "\u663E\u793A\u5927\u5C0F\u5DF2\u8C03\u6574\uFF0C\u4F46\u65E0\u6CD5\u4FDD\u5B58\uFF0C\u4E0B\u6B21\u6253\u5F00\u65F6\u5C06\u6062\u590D\u9ED8\u8BA4\u3002";
      }
    });
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
    let crc2 = 4294967295;
    for (let index = 0; index < bytes.length; index += 1) {
      crc2 = CRC32_TABLE[(crc2 ^ bytes[index]) & 255] ^ crc2 >>> 8;
    }
    return (crc2 ^ 4294967295) >>> 0;
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
    if (!isOperationsBackendPage()) {
      return requestMultipartText(
        options.actionUrl || `${SAAS}/qrCodeState.do?method=distributeBatch`,
        { submit: "\u786E\u8BA4\u63D0\u4EA4" },
        "distributeBatchFormFile",
        file,
        options.uploadTimeoutMs == null ? 3e4 : options.uploadTimeoutMs
      );
    }
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

  // src/api/device-bind-config.ts
  var ENDPOINT = `${ORIGIN}/base-business/pinpad/bindConfigManage.do`;
  var FORM_HEADERS = { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" };
  function parsePage(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script, style").forEach((element) => element.remove());
    const error = detectHtmlError(doc.documentElement.outerHTML);
    if (error) throw new Error(error);
    return doc;
  }
  function parseDeviceBindConfig(html, sn) {
    const doc = parsePage(html);
    const table = Array.from(doc.querySelectorAll("table")).find((element) => {
      const headers2 = Array.from(element.querySelectorAll("th")).map((th) => normalizeText(th.textContent));
      return headers2.includes("\u914D\u7F6E\u7EF4\u5EA6") && headers2.includes("\u7EF4\u5EA6\u6807\u8BC6") && headers2.includes("\u7D2F\u8BA1\u6700\u5927\u7ED1\u5B9A\u6B21\u6570");
    });
    if (!table) throw new Error("\u65E0\u6CD5\u8BC6\u522B\u8BBE\u5907\u6362\u7ED1\u914D\u7F6E\u67E5\u8BE2\u7ED3\u679C\uFF0C\u672A\u63D0\u4EA4\u4FEE\u6539\u6216\u65B0\u589E");
    const headers = Array.from(table.querySelectorAll("th")).map((th) => normalizeText(th.textContent));
    const matches = [];
    for (const row of Array.from(table.querySelectorAll("tr"))) {
      const cells = Array.from(row.children).filter((cell) => cell.tagName === "TD");
      const value = (name) => normalizeText(cells[headers.indexOf(name)]?.textContent);
      if (value("\u914D\u7F6E\u7EF4\u5EA6") !== "\u4E50\u5237SN" || value("\u7EF4\u5EA6\u6807\u8BC6") !== sn) continue;
      const id = Array.from(row.querySelectorAll("[onclick]")).map(
        (element) => element.getAttribute("onclick")?.match(/\btoEdit\(['"](\d+)['"]\)/)?.[1]
      ).find(Boolean);
      if (!id) throw new Error("\u67E5\u8BE2\u5230\u914D\u7F6E\u4F46\u7F3A\u5C11\u53EF\u4FEE\u6539\u7684\u8BB0\u5F55 ID\uFF0C\u8BF7\u68C0\u67E5\u6743\u9650");
      matches.push({ id, maxBindMchCount: value("\u7D2F\u8BA1\u6700\u5927\u5546\u6237\u6570"), maxBindCount: value("\u7D2F\u8BA1\u6700\u5927\u7ED1\u5B9A\u6B21\u6570") });
    }
    const pagination = normalizeText(doc.querySelector(".page")?.textContent);
    const pages = pagination.match(/共\s*(\d+)\s*页/);
    if (pages && Number(pages[1]) > 1) throw new Error("\u67E5\u8BE2\u7ED3\u679C\u5B58\u5728\u591A\u9875\uFF0C\u65E0\u6CD5\u5B89\u5168\u786E\u5B9A\u552F\u4E00\u914D\u7F6E\uFF0C\u8BF7\u5728\u540E\u53F0\u6838\u5B9E");
    if (matches.length > 1) throw new Error("\u540C\u4E00 SN \u5B58\u5728\u591A\u6761\u914D\u7F6E\uFF0C\u8BF7\u5728\u540E\u53F0\u6838\u5B9E\u540E\u518D\u8BD5");
    return matches[0] || null;
  }
  async function queryDeviceBindConfig(sn) {
    const html = await requestText(`${ENDPOINT}?method=configList`, {
      method: "POST",
      headers: FORM_HEADERS,
      timeoutMs: 3e4,
      body: buildFormBody({ updateTimeRange: "", configType: "1", configValue: sn, operator: "", agentClass: "", subAgentClass: "", pageSize: 200 })
    });
    return parseDeviceBindConfig(html, sn);
  }
  async function createDeviceBindConfig(values) {
    const response = await requestJson(`${ENDPOINT}?method=config`, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=UTF-8" },
      timeoutMs: 3e4,
      body: JSON.stringify({ configType: "1", agentClass: "", agentSn: values.sn, maxBindMchCount: "", perDayBindTimes: values.perDayBindTimes, perMonthBindTimes: values.perMonthBindTimes, maxBindCount: "", whiteList: values.whiteList })
    });
    if (response?.success !== true) throw new Error(response?.msg || "\u540E\u53F0\u672A\u786E\u8BA4\u8BBE\u5907\u6362\u7ED1\u914D\u7F6E\u65B0\u589E\u6210\u529F");
  }
  function assertDeviceBindConfigUpdated(html) {
    const doc = parsePage(html);
    const message = normalizeText(doc.body.textContent);
    if (/失败|错误|异常|无权限/.test(message) || !/操作成功\s*[!！]?/.test(message)) {
      throw new Error(message.slice(0, 260) || "\u540E\u53F0\u672A\u786E\u8BA4\u8BBE\u5907\u6362\u7ED1\u914D\u7F6E\u4FEE\u6539\u6210\u529F");
    }
  }
  async function updateDeviceBindConfig(record, values) {
    const html = await requestText(`${ENDPOINT}?method=update`, {
      method: "POST",
      headers: FORM_HEADERS,
      timeoutMs: 3e4,
      referrer: `${ENDPOINT}?method=update&id=${record.id}`,
      body: buildFormBody({ id: record.id, maxBindMchCount: record.maxBindMchCount, perDayBindTimes: values.perDayBindTimes, perMonthBindTimes: values.perMonthBindTimes, maxBindCount: record.maxBindCount, whiteList: values.whiteList })
    });
    assertDeviceBindConfigUpdated(html);
  }

  // src/tools/device-bind-config.ts
  function normalizeDeviceBindConfig(input) {
    const sn = input.sn.trim();
    if (!sn) throw new Error("\u8BF7\u8F93\u5165\u4E50\u5237 SN");
    const count = (raw, label) => {
      const value = raw?.trim() || "3";
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`${label}\u5FC5\u987B\u662F\u975E\u8D1F\u6574\u6570`);
      return String(Number(value));
    };
    const whiteList = input.whiteList ?? "1";
    if (whiteList !== "1" && whiteList !== "0") throw new Error("\u8BF7\u9009\u62E9\u662F\u5426\u542F\u7528\u7ED3\u7B97\u4E3B\u4F53\u767D\u540D\u5355");
    return { sn, perDayBindTimes: count(input.perDayBindTimes, "\u5355\u65E5\u6700\u5927\u7ED1\u5B9A\u6B21\u6570"), perMonthBindTimes: count(input.perMonthBindTimes, "\u5355\u6708\u6700\u5927\u7ED1\u5B9A\u6B21\u6570"), whiteList };
  }
  async function saveDeviceBindConfig(input, log) {
    const values = normalizeDeviceBindConfig(input);
    log(`\u67E5\u8BE2\u8BBE\u5907 ${values.sn} \u7684\u6362\u7ED1\u914D\u7F6E`);
    const record = await queryDeviceBindConfig(values.sn);
    if (record) {
      log(`\u627E\u5230\u8BBE\u5907\u6362\u7ED1\u914D\u7F6E ${record.id}\uFF0C\u6B63\u5728\u4FEE\u6539`);
      await updateDeviceBindConfig(record, values);
    } else {
      log("\u672A\u627E\u5230\u8BE5 SN \u7684\u914D\u7F6E\uFF0C\u6B63\u5728\u65B0\u589E");
      await createDeviceBindConfig(values);
    }
    log(`\u8BBE\u5907 ${values.sn} \u6362\u7ED1\u914D\u7F6E${record ? "\u4FEE\u6539" : "\u65B0\u589E"}\u6210\u529F`);
    return record ? "updated" : "created";
  }

  // node_modules/fflate/esm/browser.js
  var u8 = Uint8Array;
  var u16 = Uint16Array;
  var i32 = Int32Array;
  var fleb = new u8([
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    1,
    1,
    2,
    2,
    2,
    2,
    3,
    3,
    3,
    3,
    4,
    4,
    4,
    4,
    5,
    5,
    5,
    5,
    0,
    /* unused */
    0,
    0,
    /* impossible */
    0
  ]);
  var fdeb = new u8([
    0,
    0,
    0,
    0,
    1,
    1,
    2,
    2,
    3,
    3,
    4,
    4,
    5,
    5,
    6,
    6,
    7,
    7,
    8,
    8,
    9,
    9,
    10,
    10,
    11,
    11,
    12,
    12,
    13,
    13,
    /* unused */
    0,
    0
  ]);
  var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
  var freb = function(eb, start) {
    var b = new u16(31);
    for (var i = 0; i < 31; ++i) {
      b[i] = start += 1 << eb[i - 1];
    }
    var r = new i32(b[30]);
    for (var i = 1; i < 30; ++i) {
      for (var j = b[i]; j < b[i + 1]; ++j) {
        r[j] = j - b[i] << 5 | i;
      }
    }
    return { b, r };
  };
  var _a = freb(fleb, 2);
  var fl = _a.b;
  var revfl = _a.r;
  fl[28] = 258, revfl[258] = 28;
  var _b = freb(fdeb, 0);
  var fd = _b.b;
  var revfd = _b.r;
  var rev = new u16(32768);
  for (i = 0; i < 32768; ++i) {
    x = (i & 43690) >> 1 | (i & 21845) << 1;
    x = (x & 52428) >> 2 | (x & 13107) << 2;
    x = (x & 61680) >> 4 | (x & 3855) << 4;
    rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
  }
  var x;
  var i;
  var hMap = (function(cd, mb, r) {
    var s = cd.length;
    var i = 0;
    var l = new u16(mb);
    for (; i < s; ++i) {
      if (cd[i])
        ++l[cd[i] - 1];
    }
    var le = new u16(mb);
    for (i = 1; i < mb; ++i) {
      le[i] = le[i - 1] + l[i - 1] << 1;
    }
    var co;
    if (r) {
      co = new u16(1 << mb);
      var rvb = 15 - mb;
      for (i = 0; i < s; ++i) {
        if (cd[i]) {
          var sv = i << 4 | cd[i];
          var r_1 = mb - cd[i];
          var v = le[cd[i] - 1]++ << r_1;
          for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
            co[rev[v] >> rvb] = sv;
          }
        }
      }
    } else {
      co = new u16(s);
      for (i = 0; i < s; ++i) {
        if (cd[i]) {
          co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
        }
      }
    }
    return co;
  });
  var flt = new u8(288);
  for (i = 0; i < 144; ++i)
    flt[i] = 8;
  var i;
  for (i = 144; i < 256; ++i)
    flt[i] = 9;
  var i;
  for (i = 256; i < 280; ++i)
    flt[i] = 7;
  var i;
  for (i = 280; i < 288; ++i)
    flt[i] = 8;
  var i;
  var fdt = new u8(32);
  for (i = 0; i < 32; ++i)
    fdt[i] = 5;
  var i;
  var flm = /* @__PURE__ */ hMap(flt, 9, 0);
  var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
  var fdm = /* @__PURE__ */ hMap(fdt, 5, 0);
  var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
  var max = function(a) {
    var m = a[0];
    for (var i = 1; i < a.length; ++i) {
      if (a[i] > m)
        m = a[i];
    }
    return m;
  };
  var bits = function(d, p, m) {
    var o = p / 8 | 0;
    return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
  };
  var bits16 = function(d, p) {
    var o = p / 8 | 0;
    return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
  };
  var shft = function(p) {
    return (p + 7) / 8 | 0;
  };
  var slc = function(v, s, e) {
    if (s == null || s < 0)
      s = 0;
    if (e == null || e > v.length)
      e = v.length;
    return new u8(v.subarray(s, e));
  };
  var ec = [
    "unexpected EOF",
    "invalid block type",
    "invalid length/literal",
    "invalid distance",
    "stream finished",
    "no stream handler",
    ,
    "no callback",
    "invalid UTF-8 data",
    "extra field too long",
    "date not in range 1980-2099",
    "filename too long",
    "stream finishing",
    "invalid zip data"
    // determined by unknown compression method
  ];
  var err = function(ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    e.code = ind;
    if (Error.captureStackTrace)
      Error.captureStackTrace(e, err);
    if (!nt)
      throw e;
    return e;
  };
  var inflt = function(dat, st, buf, dict) {
    var sl = dat.length, dl = dict ? dict.length : 0;
    if (!sl || st.f && !st.l)
      return buf || new u8(0);
    var noBuf = !buf;
    var resize = noBuf || st.i != 2;
    var noSt = st.i;
    if (noBuf)
      buf = new u8(sl * 3);
    var cbuf = function(l2) {
      var bl = buf.length;
      if (l2 > bl) {
        var nbuf = new u8(Math.max(bl * 2, l2));
        nbuf.set(buf);
        buf = nbuf;
      }
    };
    var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
    var tbts = sl * 8;
    do {
      if (!lm) {
        final = bits(dat, pos, 1);
        var type = bits(dat, pos + 1, 3);
        pos += 3;
        if (!type) {
          var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
          if (t > sl) {
            if (noSt)
              err(0);
            break;
          }
          if (resize)
            cbuf(bt + l);
          buf.set(dat.subarray(s, t), bt);
          st.b = bt += l, st.p = pos = t * 8, st.f = final;
          continue;
        } else if (type == 1)
          lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
        else if (type == 2) {
          var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
          var tl = hLit + bits(dat, pos + 5, 31) + 1;
          pos += 14;
          var ldt = new u8(tl);
          var clt = new u8(19);
          for (var i = 0; i < hcLen; ++i) {
            clt[clim[i]] = bits(dat, pos + i * 3, 7);
          }
          pos += hcLen * 3;
          var clb = max(clt), clbmsk = (1 << clb) - 1;
          var clm = hMap(clt, clb, 1);
          for (var i = 0; i < tl; ) {
            var r = clm[bits(dat, pos, clbmsk)];
            pos += r & 15;
            var s = r >> 4;
            if (s < 16) {
              ldt[i++] = s;
            } else {
              var c = 0, n = 0;
              if (s == 16)
                n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
              else if (s == 17)
                n = 3 + bits(dat, pos, 7), pos += 3;
              else if (s == 18)
                n = 11 + bits(dat, pos, 127), pos += 7;
              while (n--)
                ldt[i++] = c;
            }
          }
          var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
          lbt = max(lt);
          dbt = max(dt);
          lm = hMap(lt, lbt, 1);
          dm = hMap(dt, dbt, 1);
        } else
          err(1);
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
      }
      if (resize)
        cbuf(bt + 131072);
      var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
      var lpos = pos;
      for (; ; lpos = pos) {
        var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
        pos += c & 15;
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (!c)
          err(2);
        if (sym < 256)
          buf[bt++] = sym;
        else if (sym == 256) {
          lpos = pos, lm = null;
          break;
        } else {
          var add = sym - 254;
          if (sym > 264) {
            var i = sym - 257, b = fleb[i];
            add = bits(dat, pos, (1 << b) - 1) + fl[i];
            pos += b;
          }
          var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
          if (!d)
            err(3);
          pos += d & 15;
          var dt = fd[dsym];
          if (dsym > 3) {
            var b = fdeb[dsym];
            dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
          }
          if (pos > tbts) {
            if (noSt)
              err(0);
            break;
          }
          if (resize)
            cbuf(bt + 131072);
          var end = bt + add;
          if (bt < dt) {
            var shift = dl - dt, dend = Math.min(dt, end);
            if (shift + bt < 0)
              err(3);
            for (; bt < dend; ++bt)
              buf[bt] = dict[shift + bt];
          }
          for (; bt < end; ++bt)
            buf[bt] = buf[bt - dt];
        }
      }
      st.l = lm, st.p = lpos, st.b = bt, st.f = final;
      if (lm)
        final = 1, st.m = lbt, st.d = dm, st.n = dbt;
    } while (!final);
    return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
  };
  var wbits = function(d, p, v) {
    v <<= p & 7;
    var o = p / 8 | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
  };
  var wbits16 = function(d, p, v) {
    v <<= p & 7;
    var o = p / 8 | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
    d[o + 2] |= v >> 16;
  };
  var hTree = function(d, mb) {
    var t = [];
    for (var i = 0; i < d.length; ++i) {
      if (d[i])
        t.push({ s: i, f: d[i] });
    }
    var s = t.length;
    var t2 = t.slice();
    if (!s)
      return { t: et, l: 0 };
    if (s == 1) {
      var v = new u8(t[0].s + 1);
      v[t[0].s] = 1;
      return { t: v, l: 1 };
    }
    t.sort(function(a, b) {
      return a.f - b.f;
    });
    t.push({ s: -1, f: 25001 });
    var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
    t[0] = { s: -1, f: l.f + r.f, l, r };
    while (i1 != s - 1) {
      l = t[t[i0].f < t[i2].f ? i0++ : i2++];
      r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
      t[i1++] = { s: -1, f: l.f + r.f, l, r };
    }
    var maxSym = t2[0].s;
    for (var i = 1; i < s; ++i) {
      if (t2[i].s > maxSym)
        maxSym = t2[i].s;
    }
    var tr = new u16(maxSym + 1);
    var mbt = ln(t[i1 - 1], tr, 0);
    if (mbt > mb) {
      var i = 0, dt = 0;
      var lft = mbt - mb, cst = 1 << lft;
      t2.sort(function(a, b) {
        return tr[b.s] - tr[a.s] || a.f - b.f;
      });
      for (; i < s; ++i) {
        var i2_1 = t2[i].s;
        if (tr[i2_1] > mb) {
          dt += cst - (1 << mbt - tr[i2_1]);
          tr[i2_1] = mb;
        } else
          break;
      }
      dt >>= lft;
      while (dt > 0) {
        var i2_2 = t2[i].s;
        if (tr[i2_2] < mb)
          dt -= 1 << mb - tr[i2_2]++ - 1;
        else
          ++i;
      }
      for (; i >= 0 && dt; --i) {
        var i2_3 = t2[i].s;
        if (tr[i2_3] == mb) {
          --tr[i2_3];
          ++dt;
        }
      }
      mbt = mb;
    }
    return { t: new u8(tr), l: mbt };
  };
  var ln = function(n, l, d) {
    return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
  };
  var lc = function(c) {
    var s = c.length;
    while (s && !c[--s])
      ;
    var cl = new u16(++s);
    var cli = 0, cln = c[0], cls = 1;
    var w = function(v) {
      cl[cli++] = v;
    };
    for (var i = 1; i <= s; ++i) {
      if (c[i] == cln && i != s)
        ++cls;
      else {
        if (!cln && cls > 2) {
          for (; cls > 138; cls -= 138)
            w(32754);
          if (cls > 2) {
            w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
            cls = 0;
          }
        } else if (cls > 3) {
          w(cln), --cls;
          for (; cls > 6; cls -= 6)
            w(8304);
          if (cls > 2)
            w(cls - 3 << 5 | 8208), cls = 0;
        }
        while (cls--)
          w(cln);
        cls = 1;
        cln = c[i];
      }
    }
    return { c: cl.subarray(0, cli), n: s };
  };
  var clen = function(cf, cl) {
    var l = 0;
    for (var i = 0; i < cl.length; ++i)
      l += cf[i] * cl[i];
    return l;
  };
  var wfblk = function(out, pos, dat) {
    var s = dat.length;
    var o = shft(pos + 2);
    out[o] = s & 255;
    out[o + 1] = s >> 8;
    out[o + 2] = out[o] ^ 255;
    out[o + 3] = out[o + 1] ^ 255;
    for (var i = 0; i < s; ++i)
      out[o + i + 4] = dat[i];
    return (o + 4 + s) * 8;
  };
  var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
    wbits(out, p++, final);
    ++lf[256];
    var _a2 = hTree(lf, 15), dlt = _a2.t, mlb = _a2.l;
    var _b2 = hTree(df, 15), ddt = _b2.t, mdb = _b2.l;
    var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
    var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
    var lcfreq = new u16(19);
    for (var i = 0; i < lclt.length; ++i)
      ++lcfreq[lclt[i] & 31];
    for (var i = 0; i < lcdt.length; ++i)
      ++lcfreq[lcdt[i] & 31];
    var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
    var nlcc = 19;
    for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
      ;
    var flen = bl + 5 << 3;
    var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
    var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
    if (bs >= 0 && flen <= ftlen && flen <= dtlen)
      return wfblk(out, p, dat.subarray(bs, bs + bl));
    var lm, ll, dm, dl;
    wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
    if (dtlen < ftlen) {
      lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
      var llm = hMap(lct, mlcb, 0);
      wbits(out, p, nlc - 257);
      wbits(out, p + 5, ndc - 1);
      wbits(out, p + 10, nlcc - 4);
      p += 14;
      for (var i = 0; i < nlcc; ++i)
        wbits(out, p + 3 * i, lct[clim[i]]);
      p += 3 * nlcc;
      var lcts = [lclt, lcdt];
      for (var it = 0; it < 2; ++it) {
        var clct = lcts[it];
        for (var i = 0; i < clct.length; ++i) {
          var len = clct[i] & 31;
          wbits(out, p, llm[len]), p += lct[len];
          if (len > 15)
            wbits(out, p, clct[i] >> 5 & 127), p += clct[i] >> 12;
        }
      }
    } else {
      lm = flm, ll = flt, dm = fdm, dl = fdt;
    }
    for (var i = 0; i < li; ++i) {
      var sym = syms[i];
      if (sym > 255) {
        var len = sym >> 18 & 31;
        wbits16(out, p, lm[len + 257]), p += ll[len + 257];
        if (len > 7)
          wbits(out, p, sym >> 23 & 31), p += fleb[len];
        var dst = sym & 31;
        wbits16(out, p, dm[dst]), p += dl[dst];
        if (dst > 3)
          wbits16(out, p, sym >> 5 & 8191), p += fdeb[dst];
      } else {
        wbits16(out, p, lm[sym]), p += ll[sym];
      }
    }
    wbits16(out, p, lm[256]);
    return p + ll[256];
  };
  var deo = /* @__PURE__ */ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
  var et = /* @__PURE__ */ new u8(0);
  var dflt = function(dat, lvl, plvl, pre, post, st) {
    var s = st.z || dat.length;
    var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
    var w = o.subarray(pre, o.length - post);
    var lst = st.l;
    var pos = (st.r || 0) & 7;
    if (lvl) {
      if (pos)
        w[0] = st.r >> 3;
      var opt = deo[lvl - 1];
      var n = opt >> 13, c = opt & 8191;
      var msk_1 = (1 << plvl) - 1;
      var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
      var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
      var hsh = function(i2) {
        return (dat[i2] ^ dat[i2 + 1] << bs1_1 ^ dat[i2 + 2] << bs2_1) & msk_1;
      };
      var syms = new i32(25e3);
      var lf = new u16(288), df = new u16(32);
      var lc_1 = 0, eb = 0, i = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
      for (; i + 2 < s; ++i) {
        var hv = hsh(i);
        var imod = i & 32767, pimod = head[hv];
        prev[imod] = pimod;
        head[hv] = imod;
        if (wi <= i) {
          var rem = s - i;
          if ((lc_1 > 7e3 || li > 24576) && (rem > 423 || !lst)) {
            pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
            li = lc_1 = eb = 0, bs = i;
            for (var j = 0; j < 286; ++j)
              lf[j] = 0;
            for (var j = 0; j < 30; ++j)
              df[j] = 0;
          }
          var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
          if (rem > 2 && hv == hsh(i - dif)) {
            var maxn = Math.min(n, rem) - 1;
            var maxd = Math.min(32767, i);
            var ml = Math.min(258, rem);
            while (dif <= maxd && --ch_1 && imod != pimod) {
              if (dat[i + l] == dat[i + l - dif]) {
                var nl = 0;
                for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
                  ;
                if (nl > l) {
                  l = nl, d = dif;
                  if (nl > maxn)
                    break;
                  var mmd = Math.min(dif, nl - 2);
                  var md = 0;
                  for (var j = 0; j < mmd; ++j) {
                    var ti = i - dif + j & 32767;
                    var pti = prev[ti];
                    var cd = ti - pti & 32767;
                    if (cd > md)
                      md = cd, pimod = ti;
                  }
                }
              }
              imod = pimod, pimod = prev[imod];
              dif += imod - pimod & 32767;
            }
          }
          if (d) {
            syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
            var lin = revfl[l] & 31, din = revfd[d] & 31;
            eb += fleb[lin] + fdeb[din];
            ++lf[257 + lin];
            ++df[din];
            wi = i + l;
            ++lc_1;
          } else {
            syms[li++] = dat[i];
            ++lf[dat[i]];
          }
        }
      }
      for (i = Math.max(i, wi); i < s; ++i) {
        syms[li++] = dat[i];
        ++lf[dat[i]];
      }
      pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
      if (!lst) {
        st.r = pos & 7 | w[pos / 8 | 0] << 3;
        pos -= 7;
        st.h = head, st.p = prev, st.i = i, st.w = wi;
      }
    } else {
      for (var i = st.w || 0; i < s + lst; i += 65535) {
        var e = i + 65535;
        if (e >= s) {
          w[pos / 8 | 0] = lst;
          e = s;
        }
        pos = wfblk(w, pos + 1, dat.subarray(i, e));
      }
      st.i = s;
    }
    return slc(o, 0, pre + shft(pos) + post);
  };
  var crct = /* @__PURE__ */ (function() {
    var t = new Int32Array(256);
    for (var i = 0; i < 256; ++i) {
      var c = i, k = 9;
      while (--k)
        c = (c & 1 && -306674912) ^ c >>> 1;
      t[i] = c;
    }
    return t;
  })();
  var crc = function() {
    var c = -1;
    return {
      p: function(d) {
        var cr = c;
        for (var i = 0; i < d.length; ++i)
          cr = crct[cr & 255 ^ d[i]] ^ cr >>> 8;
        c = cr;
      },
      d: function() {
        return ~c;
      }
    };
  };
  var dopt = function(dat, opt, pre, post, st) {
    if (!st) {
      st = { l: 1 };
      if (opt.dictionary) {
        var dict = opt.dictionary.subarray(-32768);
        var newDat = new u8(dict.length + dat.length);
        newDat.set(dict);
        newDat.set(dat, dict.length);
        dat = newDat;
        st.w = dict.length;
      }
    }
    return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post, st);
  };
  var mrg = function(a, b) {
    var o = {};
    for (var k in a)
      o[k] = a[k];
    for (var k in b)
      o[k] = b[k];
    return o;
  };
  var b2 = function(d, b) {
    return d[b] | d[b + 1] << 8;
  };
  var b4 = function(d, b) {
    return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
  };
  var b8 = function(d, b) {
    return b4(d, b) + b4(d, b + 4) * 4294967296;
  };
  var wbytes = function(d, b, v) {
    for (; v; ++b)
      d[b] = v, v >>>= 8;
  };
  function deflateSync(data, opts) {
    return dopt(data, opts || {}, 0, 0);
  }
  function inflateSync(data, opts) {
    return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
  }
  var fltn = function(d, p, t, o) {
    for (var k in d) {
      var val = d[k], n = p + k, op = o;
      if (Array.isArray(val))
        op = mrg(o, val[1]), val = val[0];
      if (val instanceof u8)
        t[n] = [val, op];
      else {
        t[n += "/"] = [new u8(0), op];
        fltn(val, n, t, o);
      }
    }
  };
  var te = typeof TextEncoder != "undefined" && /* @__PURE__ */ new TextEncoder();
  var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
  var tds = 0;
  try {
    td.decode(et, { stream: true });
    tds = 1;
  } catch (e) {
  }
  var dutf8 = function(d) {
    for (var r = "", i = 0; ; ) {
      var c = d[i++];
      var eb = (c > 127) + (c > 223) + (c > 239);
      if (i + eb > d.length)
        return { s: r, r: slc(d, i - 1) };
      if (!eb)
        r += String.fromCharCode(c);
      else if (eb == 3) {
        c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | d[i++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
      } else if (eb & 1)
        r += String.fromCharCode((c & 31) << 6 | d[i++] & 63);
      else
        r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | d[i++] & 63);
    }
  };
  function strToU8(str, latin1) {
    if (latin1) {
      var ar_1 = new u8(str.length);
      for (var i = 0; i < str.length; ++i)
        ar_1[i] = str.charCodeAt(i);
      return ar_1;
    }
    if (te)
      return te.encode(str);
    var l = str.length;
    var ar = new u8(str.length + (str.length >> 1));
    var ai = 0;
    var w = function(v) {
      ar[ai++] = v;
    };
    for (var i = 0; i < l; ++i) {
      if (ai + 5 > ar.length) {
        var n = new u8(ai + 8 + (l - i << 1));
        n.set(ar);
        ar = n;
      }
      var c = str.charCodeAt(i);
      if (c < 128 || latin1)
        w(c);
      else if (c < 2048)
        w(192 | c >> 6), w(128 | c & 63);
      else if (c > 55295 && c < 57344)
        c = 65536 + (c & 1023 << 10) | str.charCodeAt(++i) & 1023, w(240 | c >> 18), w(128 | c >> 12 & 63), w(128 | c >> 6 & 63), w(128 | c & 63);
      else
        w(224 | c >> 12), w(128 | c >> 6 & 63), w(128 | c & 63);
    }
    return slc(ar, 0, ai);
  }
  function strFromU8(dat, latin1) {
    if (latin1) {
      var r = "";
      for (var i = 0; i < dat.length; i += 16384)
        r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384));
      return r;
    } else if (td) {
      return td.decode(dat);
    } else {
      var _a2 = dutf8(dat), s = _a2.s, r = _a2.r;
      if (r.length)
        err(8);
      return s;
    }
  }
  var slzh = function(d, b) {
    return b + 30 + b2(d, b + 26) + b2(d, b + 28);
  };
  var zh = function(d, b, z) {
    var fnl = b2(d, b + 28), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl, bs = b4(d, b + 20);
    var _a2 = z && bs == 4294967295 ? z64e(d, es) : [bs, b4(d, b + 24), b4(d, b + 42)], sc = _a2[0], su = _a2[1], off = _a2[2];
    return [b2(d, b + 10), sc, su, fn, es + b2(d, b + 30) + b2(d, b + 32), off];
  };
  var z64e = function(d, b) {
    for (; b2(d, b) != 1; b += 4 + b2(d, b + 2))
      ;
    return [b8(d, b + 12), b8(d, b + 4), b8(d, b + 20)];
  };
  var exfl = function(ex) {
    var le = 0;
    if (ex) {
      for (var k in ex) {
        var l = ex[k].length;
        if (l > 65535)
          err(9);
        le += l + 4;
      }
    }
    return le;
  };
  var wzh = function(d, b, f, fn, u, c, ce, co) {
    var fl2 = fn.length, ex = f.extra, col = co && co.length;
    var exl = exfl(ex);
    wbytes(d, b, ce != null ? 33639248 : 67324752), b += 4;
    if (ce != null)
      d[b++] = 20, d[b++] = f.os;
    d[b] = 20, b += 2;
    d[b++] = f.flag << 1 | (c < 0 && 8), d[b++] = u && 8;
    d[b++] = f.compression & 255, d[b++] = f.compression >> 8;
    var dt = new Date(f.mtime == null ? Date.now() : f.mtime), y = dt.getFullYear() - 1980;
    if (y < 0 || y > 119)
      err(10);
    wbytes(d, b, y << 25 | dt.getMonth() + 1 << 21 | dt.getDate() << 16 | dt.getHours() << 11 | dt.getMinutes() << 5 | dt.getSeconds() >> 1), b += 4;
    if (c != -1) {
      wbytes(d, b, f.crc);
      wbytes(d, b + 4, c < 0 ? -c - 2 : c);
      wbytes(d, b + 8, f.size);
    }
    wbytes(d, b + 12, fl2);
    wbytes(d, b + 14, exl), b += 16;
    if (ce != null) {
      wbytes(d, b, col);
      wbytes(d, b + 6, f.attrs);
      wbytes(d, b + 10, ce), b += 14;
    }
    d.set(fn, b);
    b += fl2;
    if (exl) {
      for (var k in ex) {
        var exf = ex[k], l = exf.length;
        wbytes(d, b, +k);
        wbytes(d, b + 2, l);
        d.set(exf, b + 4), b += 4 + l;
      }
    }
    if (col)
      d.set(co, b), b += col;
    return b;
  };
  var wzf = function(o, b, c, d, e) {
    wbytes(o, b, 101010256);
    wbytes(o, b + 8, c);
    wbytes(o, b + 10, c);
    wbytes(o, b + 12, d);
    wbytes(o, b + 16, e);
  };
  function zipSync(data, opts) {
    if (!opts)
      opts = {};
    var r = {};
    var files = [];
    fltn(data, "", r, opts);
    var o = 0;
    var tot = 0;
    for (var fn in r) {
      var _a2 = r[fn], file = _a2[0], p = _a2[1];
      var compression = p.level == 0 ? 0 : 8;
      var f = strToU8(fn), s = f.length;
      var com = p.comment, m = com && strToU8(com), ms = m && m.length;
      var exl = exfl(p.extra);
      if (s > 65535)
        err(11);
      var d = compression ? deflateSync(file, p) : file, l = d.length;
      var c = crc();
      c.p(file);
      files.push(mrg(p, {
        size: file.length,
        crc: c.d(),
        c: d,
        f,
        m,
        u: s != fn.length || m && com.length != ms,
        o,
        compression
      }));
      o += 30 + s + exl + l;
      tot += 76 + 2 * (s + exl) + (ms || 0) + l;
    }
    var out = new u8(tot + 22), oe = o, cdl = tot - o;
    for (var i = 0; i < files.length; ++i) {
      var f = files[i];
      wzh(out, f.o, f, f.f, f.u, f.c.length);
      var badd = 30 + f.f.length + exfl(f.extra);
      out.set(f.c, f.o + badd);
      wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m), o += 16 + badd + (f.m ? f.m.length : 0);
    }
    wzf(out, o, files.length, cdl, oe);
    return out;
  }
  function unzipSync(data, opts) {
    var files = {};
    var e = data.length - 22;
    for (; b4(data, e) != 101010256; --e) {
      if (!e || data.length - e > 65558)
        err(13);
    }
    ;
    var c = b2(data, e + 8);
    if (!c)
      return {};
    var o = b4(data, e + 16);
    var z = o == 4294967295 || c == 65535;
    if (z) {
      var ze = b4(data, e - 12);
      z = b4(data, ze) == 101075792;
      if (z) {
        c = b4(data, ze + 32);
        o = b4(data, ze + 48);
      }
    }
    var fltr = opts && opts.filter;
    for (var i = 0; i < c; ++i) {
      var _a2 = zh(data, o, z), c_2 = _a2[0], sc = _a2[1], su = _a2[2], fn = _a2[3], no = _a2[4], off = _a2[5], b = slzh(data, off);
      o = no;
      if (!fltr || fltr({
        name: fn,
        size: sc,
        originalSize: su,
        compression: c_2
      })) {
        if (!c_2)
          files[fn] = slc(data, b, b + sc);
        else if (c_2 == 8)
          files[fn] = inflateSync(data.subarray(b, b + sc), { out: new u8(su) });
        else
          err(14, "unknown compression type " + c_2);
      }
    }
    return files;
  }

  // src/api/cups.ts
  async function getCupsApplicant() {
    const html = await requestText(`${USER_CENTER}/userInfo.do?method=loaddata`, { cache: "no-store", timeoutMs: 15e3 });
    const doc = new DOMParser().parseFromString(html, "text/html");
    const account = doc.querySelector('input[name="usercode"]')?.value.trim();
    if (!account) throw new Error(detectHtmlError(html) || "\u65E0\u6CD5\u83B7\u53D6\u5F53\u524D\u767B\u5F55\u8D26\u53F7\uFF0C\u8BF7\u5148\u767B\u5F55\u8FD0\u8425\u540E\u53F0");
    return account;
  }
  function parseCupsResponse(text) {
    let response;
    try {
      const value = JSON.parse(text);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      response = value;
    } catch {
      const error = detectHtmlError(text);
      if (error) throw new Error(error);
      return { state: "unknown", message: "\u8BF7\u6C42\u5DF2\u53D1\u9001\uFF0C\u4F46\u65E0\u6CD5\u786E\u8BA4\u540E\u53F0\u662F\u5426\u53D7\u7406\uFF0C\u8BF7\u5230\u540E\u53F0\u6838\u5B9E\uFF0C\u52FF\u91CD\u590D\u63D0\u4EA4" };
    }
    const message = [response.error_msg, response.errMsg, response.respMsg, response.message, response.msg].find((value) => typeof value === "string" && value.trim());
    if (response.success === false || response.fail === true || response.error_code != null && String(response.error_code) !== "0") {
      throw new Error(message || "\u540E\u53F0\u62D2\u7EDD\u4E86 CUPS \u4E0A\u62A5\u7533\u8BF7");
    }
    if (response.success === true) {
      return { state: "accepted", message: `CUPS \u4E0A\u62A5\u7533\u8BF7\u5DF2\u53D7\u7406${message ? `\uFF1A${message}` : ""}\uFF08\u4E0D\u4EE3\u8868\u6700\u7EC8\u4E0A\u62A5\u5B8C\u6210\uFF09` };
    }
    return { state: "unknown", message: `\u8BF7\u6C42\u5DF2\u53D1\u9001\uFF0C\u4F46\u53D7\u7406\u72B6\u6001\u5F85\u786E\u8BA4${message ? `\uFF1A${message}` : ""}\u3002\u8BF7\u5230\u540E\u53F0\u6838\u5B9E\uFF0C\u52FF\u91CD\u590D\u63D0\u4EA4` };
  }
  async function submitCupsApplication(file, applicant) {
    if (!applicant.trim()) throw new Error("\u7F3A\u5C11\u7533\u8BF7\u4EBA\u8D26\u53F7");
    let response;
    try {
      response = await requestMultipartText(`${ORIGIN}/lspos/cups.do?method=batchGenerateAndBind`, {
        applicant,
        reason: "1",
        channelType: "1",
        merchantType: "undefined"
      }, "file", file, 3e4, { Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest" });
    } catch (error) {
      throw new Error(`\u63D0\u4EA4\u8BF7\u6C42\u5F02\u5E38\uFF0C\u53D7\u7406\u72B6\u6001\u672A\u77E5\uFF0C\u8BF7\u5148\u5230\u540E\u53F0\u6838\u5B9E\uFF0C\u52FF\u91CD\u590D\u63D0\u4EA4\uFF1A${error instanceof Error ? error.message : String(error)}`);
    }
    return parseCupsResponse(response);
  }

  // src/tools/cups-report.ts
  function fillCupsTemplate(template, merchantId) {
    assertMerchantId(merchantId);
    const entries = unzipSync(template);
    const sheetPath = "xl/worksheets/sheet1.xml";
    if (!entries[sheetPath]) throw new Error("CUPS \u6A21\u677F\u7F3A\u5C11\u5DE5\u4F5C\u8868");
    const doc = new DOMParser().parseFromString(strFromU8(entries[sheetPath]), "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("CUPS \u6A21\u677F\u5DE5\u4F5C\u8868\u683C\u5F0F\u9519\u8BEF");
    const cell = doc.querySelector('c[r="A2"]');
    if (!cell) throw new Error("CUPS \u6A21\u677F\u7F3A\u5C11\u5546\u6237\u53F7\u5355\u5143\u683C A2");
    const ns = doc.documentElement.namespaceURI;
    const inline = doc.createElementNS(ns, "is");
    const text = doc.createElementNS(ns, "t");
    text.textContent = merchantId;
    inline.append(text);
    cell.setAttribute("t", "inlineStr");
    cell.replaceChildren(inline);
    entries[sheetPath] = strToU8(new XMLSerializer().serializeToString(doc));
    const bytes = zipSync(entries);
    return new File([new Uint8Array(bytes).buffer], "cups_generate_template.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
  }
  async function reportCups(rawMerchantId, onProgress) {
    const merchantId = rawMerchantId.trim();
    assertMerchantId(merchantId);
    onProgress("\u6B63\u5728\u8BFB\u53D6\u5F53\u524D\u767B\u5F55\u8D26\u53F7...");
    const applicant = await getCupsApplicant();
    onProgress("\u6B63\u5728\u751F\u6210 CUPS \u4E0A\u62A5 Excel...");
    const response = await fetch(chrome.runtime.getURL("assets/cups_generate_template.xlsx"), { signal: AbortSignal.timeout(1e4) });
    if (!response.ok) throw new Error("\u65E0\u6CD5\u52A0\u8F7D\u63D2\u4EF6\u5185\u7684 CUPS \u5B98\u65B9\u6A21\u677F\uFF0C\u8BF7\u91CD\u65B0\u5B89\u88C5\u5B8C\u6574\u7684 dist \u76EE\u5F55");
    const file = fillCupsTemplate(new Uint8Array(await response.arrayBuffer()), merchantId);
    onProgress(`\u6B63\u5728\u63D0\u4EA4\u5546\u6237 ${merchantId} \u7684 CUPS \u4E0A\u62A5\u7533\u8BF7...`);
    return submitCupsApplication(file, applicant);
  }

  // src/api/device-transfer.ts
  var ENDPOINT2 = "/base-business/pinpad/newTerminal.do";
  var LHSD_TRANSFER_ENDPOINT = "/uts_platform/machine/manager/machineChangeAgent.do";
  function trim(value) {
    return value.trim();
  }
  function assertSuccess(payload) {
    if (Number(payload?.code) === 0 && payload?.success === true) return payload.data;
    throw new Error(payload?.msg || "\u540E\u53F0\u672A\u8FD4\u56DE\u6210\u529F\u7ED3\u679C");
  }
  async function request(method, values, fetchImpl) {
    const body = new URLSearchParams(values);
    const url = `${ORIGIN}${ENDPOINT2}?method=${encodeURIComponent(method)}`;
    if (!fetchImpl) {
      const payload = await requestJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body
      });
      return assertSuccess(payload);
    }
    const response = await fetchImpl(url, {
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
  async function queryOldDeviceAgent(sn, fetchImpl) {
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
  async function queryNewDeviceAgent(sn, oldAgentId, newAgentId, fetchImpl) {
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
  async function submitDeviceTransfer(values, onStep, fetchImpl) {
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
  function validateLhsdDeviceTransfer(values) {
    const normalized = {
      sn: trim(values.sn),
      oldAgentId: trim(values.oldAgentId),
      newAgentId: trim(values.newAgentId)
    };
    if (!normalized.sn) throw new Error("\u8BF7\u8F93\u5165 SN");
    if (!/^\d+$/.test(normalized.oldAgentId)) throw new Error("\u65E7\u4EE3\u7406\u5546\u7F16\u53F7\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u4E14\u5FC5\u987B\u4E3A\u6570\u5B57");
    if (!/^\d+$/.test(normalized.newAgentId)) throw new Error("\u65B0\u4EE3\u7406\u5546\u7F16\u53F7\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u4E14\u5FC5\u987B\u4E3A\u6570\u5B57");
    if (normalized.oldAgentId === normalized.newAgentId) throw new Error("\u65B0\u65E7\u4EE3\u7406\u5546\u7F16\u53F7\u4E0D\u80FD\u76F8\u540C");
    return normalized;
  }
  function parseLhsdDeviceTransferResult(payload) {
    const success = String(payload.error_code) === "0" || payload.success === true && payload.fail !== true;
    if (!success) throw new Error(payload.error_msg || "\u8054\u5408\u6536\u5355\u673A\u5177\u5212\u62E8\u5931\u8D25");
    return {
      count: Number(payload.count || 0),
      message: payload.error_msg || "\u5212\u62E8\u6210\u529F"
    };
  }
  async function submitLhsdDeviceTransfer(values, fetchImpl) {
    const normalized = validateLhsdDeviceTransfer(values);
    const body = new URLSearchParams({
      sn: normalized.sn,
      oldAgentId: normalized.oldAgentId,
      newAgentId: normalized.newAgentId
    });
    const url = `${ORIGIN}${LHSD_TRANSFER_ENDPOINT}`;
    if (!fetchImpl) {
      const payload = await requestJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body
      });
      return parseLhsdDeviceTransferResult(payload);
    }
    const response = await fetchImpl(url, {
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
      return parseLhsdDeviceTransferResult(JSON.parse(text));
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`\u63A5\u53E3\u8FD4\u56DE\u975E JSON \u5185\u5BB9: ${text.slice(0, 200)}`);
      throw error;
    }
  }

  // src/tools/device-transfer.ts
  var queryOldDeviceAgent2 = (sn) => queryOldDeviceAgent(sn);
  var queryNewDeviceAgent2 = (sn, oldAgentId, newAgentId) => queryNewDeviceAgent(sn, oldAgentId, newAgentId);
  var submitDeviceTransfer2 = (values, onStep) => submitDeviceTransfer(values, onStep);
  var submitLhsdDeviceTransfer2 = (values) => submitLhsdDeviceTransfer(values);

  // src/sidepanel/index.ts
  var VERSION = chrome.runtime.getManifest().version;
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
  function businessLineName(businessLine) {
    return businessLine === "lhsd" ? "\u8054\u5408\u6536\u5355" : "\u6536\u94F6\u901A";
  }
  function createPanel() {
    document.getElementById("syt-extension-root")?.remove();
    const root = document.createElement("div");
    root.id = "syt-extension-root";
    root.innerHTML = `
    <section class="panel" aria-label="\u8FD0\u8425\u5DE5\u5177">
      <header class="app-header"><span class="brand">${icon("wrench")}\u8FD0\u8425\u5DE5\u5177</span><div class="header-settings"><label class="sr-only" for="syt-display-size">\u663E\u793A\u5927\u5C0F</label><select id="syt-display-size" title="\u663E\u793A\u5927\u5C0F"><option value="compact">\u7D27\u51D1</option><option value="standard">\u6807\u51C6</option><option value="large">\u5927\u5B57</option></select><span class="version">v${VERSION}</span></div></header>
      <div id="syt-display-status" class="display-status" role="status"></div>
      <main>
        <div class="tool-heading"><div><button id="syt-back" class="icon-button" type="button" title="\u8FD4\u56DE\u91CD\u7F6E\u9875\u9762" aria-label="\u8FD4\u56DE\u91CD\u7F6E\u9875\u9762">${icon("back")}</button><h1 id="syt-title">\u5B50\u5546\u6237\u53F7\u91CD\u7F6E</h1></div><select id="syt-tool-select" aria-label="\u5207\u6362\u5DE5\u5177"><option value="" disabled selected>\u5207\u6362\u5DE5\u5177</option><option value="reset">\u5B50\u5546\u6237\u53F7\u91CD\u7F6E</option><option value="code">\u7801\u724C\u5212\u8F6C</option><option value="device">\u6536\u94F6\u901A\u673A\u5177\u5212\u62E8</option><option value="lhsd-device">\u8054\u5408\u6536\u5355\u673A\u5177\u5212\u62E8</option><option value="whitelist">\u9632\u5207\u6237\u767D\u540D\u5355</option><option value="bind-config">\u8BBE\u5907\u6362\u7ED1\u914D\u7F6E</option></select></div>
        <section id="syt-view-reset" class="view active">
          <fieldset class="segmented business-line"><legend class="sr-only">\u91CD\u7F6E\u4E1A\u52A1\u7EBF</legend><label><input type="radio" name="syt-business-line" value="syt" checked>\u6536\u94F6\u901A</label><label><input type="radio" name="syt-business-line" value="lhsd">\u8054\u5408\u6536\u5355</label></fieldset>
          <label for="syt-merchant-ids">\u4E50\u5237\u5546\u6237\u53F7</label><div class="input-clear"><input id="syt-merchant-ids" placeholder="\u591A\u4E2A\u5546\u6237\u53F7\u4EE5 ; \u5206\u9694" autocomplete="off" aria-describedby="syt-merchant-hint"><button id="syt-clear-merchant" type="button" class="icon-button" title="\u6E05\u7A7A\u5546\u6237\u53F7" aria-label="\u6E05\u7A7A\u5546\u6237\u53F7">${icon("close")}</button></div><div id="syt-merchant-hint" class="field-hint" aria-live="polite">\u91CD\u7F6E\u6700\u591A 5 \u4E2A \xB7 \u914D\u7F6E key \u4E0D\u9650\u6570\u91CF</div>
          <fieldset class="segmented report-channels"><legend class="sr-only">\u91CD\u7F6E\u901A\u9053</legend><label><input type="radio" name="syt-report-type" value="WECHAT">\u5FAE\u4FE1</label><label><input type="radio" name="syt-report-type" value="ALIPAY">\u652F\u4ED8\u5B9D</label><label><input type="radio" name="syt-report-type" value="ALL" checked>\u5168\u90E8</label></fieldset>
          <details id="syt-optional-config" class="optional-config"><summary>${icon("chevron")}<span>\u53EF\u9009\u914D\u7F6E</span><span id="syt-optional-summary">\u6E20\u9053 \xB7 appid \xB7 \u6388\u6743\u76EE\u5F55</span></summary><div class="optional-content"><label>\u4E0A\u62A5\u9884\u8BBE<select id="syt-preset">${PRESETS.map((preset2, index) => `<option value="${index}">${preset2.name}</option>`).join("")}</select></label>
          <div id="syt-channel-options" class="optional-options"><div class="section-title">\u53EF\u9009\u4E0A\u62A5\u6E20\u9053</div><div class="form-row"><label>\u5FAE\u4FE1\u6E20\u9053\u53F7<input id="syt-wx-channel-id" autocomplete="off"></label><label>\u5FAE\u4FE1\u6E20\u9053\u4E3B\u4F53<input id="syt-wx-channel-name" autocomplete="off"></label></div><div class="form-row"><label>\u652F\u4ED8\u5B9D\u6E20\u9053\u53F7<input id="syt-alipay-channel-id" autocomplete="off"></label><label>\u652F\u4ED8\u5B9D\u6E20\u9053\u4E3B\u4F53<input id="syt-alipay-channel-name" autocomplete="off"></label></div></div>
          <div class="section-title">\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570\uFF08\u53EF\u9009\uFF09</div><label>appid<input id="syt-appid" autocomplete="off"></label><label>\u652F\u4ED8\u6388\u6743\u76EE\u5F55<input id="syt-jsapi-paths" autocomplete="off"></label>
          </div></details>
          <button id="syt-run-reset" class="primary" type="button">\u6267\u884C\u91CD\u7F6E</button>
          <div class="secondary-actions"><button id="syt-run-payment-config" type="button">\u914D\u7F6E\u7ED1\u5B9A</button><button id="syt-run-key" type="button">\u914D\u7F6E\u5546\u6237 key</button></div>
          <div id="syt-reset-status" class="status" role="status"></div>
          <section class="results-section" aria-label="\u672C\u6B21\u7ED3\u679C"><div class="results-heading"><h2>\u672C\u6B21\u7ED3\u679C</h2><button id="syt-copy" class="text-button" type="button" disabled>${icon("copy")}\u590D\u5236\u5168\u90E8</button></div><div id="syt-results"><p class="empty">\u6682\u65E0\u91CD\u7F6E\u7ED3\u679C</p></div></section>
        </section>
        <section id="syt-view-cups" class="view">
          <label for="syt-cups-merchant">\u4E50\u5237\u5546\u6237\u53F7</label><input id="syt-cups-merchant" inputmode="numeric" autocomplete="off" placeholder="10 \u4F4D\u4E50\u5237\u5546\u6237\u53F7">
          <button id="syt-run-cups" class="primary" type="button">\u63D0\u4EA4\u4E0A\u62A5\u7533\u8BF7</button><div id="syt-cups-status" class="status" role="status" aria-live="polite"></div>
        </section>
        <section id="syt-view-bind-config" class="view">
          <label>\u4E50\u5237 SN\uFF08\u5FC5\u586B\uFF09<span class="field-help" tabindex="0" aria-label="\u8BBE\u5907\u6362\u7ED1\u914D\u7F6E\u8BF4\u660E" aria-describedby="syt-bind-config-help">?<span id="syt-bind-config-help" class="field-help-tooltip" role="tooltip">\u70B9\u51FB\u786E\u8BA4\u914D\u7F6E\u540E\uFF0C\u5148\u6309\u4E50\u5237 SN \u67E5\u8BE2\u5DF2\u6709\u914D\u7F6E\uFF1A\u6709\u8BB0\u5F55\u5219\u4FEE\u6539\u8BE5\u8BB0\u5F55\uFF0C\u6CA1\u6709\u8BB0\u5F55\u5219\u65B0\u589E\u914D\u7F6E\u3002\u67E5\u8BE2\u5931\u8D25\u65F6\u4E0D\u4F1A\u7EE7\u7EED\u63D0\u4EA4\u3002</span></span><input id="syt-bind-config-sn" autocomplete="off" required></label>
          <div class="form-row"><label>\u5355\u65E5\u6700\u5927\u7ED1\u5B9A\u6B21\u6570<input id="syt-bind-config-day" type="number" min="0" step="1" value="3" placeholder="3"></label><label>\u5355\u6708\u6700\u5927\u7ED1\u5B9A\u6B21\u6570<input id="syt-bind-config-month" type="number" min="0" step="1" value="3" placeholder="3"></label></div>
          <fieldset class="business-line"><legend>\u7ED3\u7B97\u4E3B\u4F53\u767D\u540D\u5355</legend><label><input type="radio" name="syt-bind-config-whitelist" value="1" checked>\u662F</label><label><input type="radio" name="syt-bind-config-whitelist" value="0">\u5426</label></fieldset>
          <button id="syt-run-bind-config" class="primary" type="button">\u786E\u8BA4\u914D\u7F6E</button><div id="syt-bind-config-status" class="status" role="status"></div>
        </section>
        <section id="syt-view-code" class="view"><div class="form-row"><label>\u7801\u724C\u5F00\u59CB\u7F16\u53F7<input id="syt-code-start" autocomplete="off"></label><label>\u7801\u724C\u7ED3\u675F\u7F16\u53F7<input id="syt-code-end" autocomplete="off"></label></div><div class="form-row"><label>\u539F\u4EE3\u7406\u5546<input id="syt-code-source" autocomplete="off"></label><label>\u65B0\u4EE3\u7406\u5546<input id="syt-code-target" autocomplete="off"></label></div><button id="syt-run-code" class="primary" type="button">\u786E\u8BA4\u5212\u8F6C</button><div id="syt-code-status" class="status"></div></section>
        <section id="syt-view-device" class="view"><div class="section-title">\u673A\u5177\u4FE1\u606F</div><div class="form-row"><label>\u4E50\u5237 SN \u59CB<input id="syt-device-sn" autocomplete="off"></label><label>\u6570\u91CF<input id="syt-device-quantity" value="1" readonly></label></div><button id="syt-device-query-old" type="button">\u67E5\u8BE2\u65E7\u4EE3\u7406\u5546</button><div class="section-title">\u65E7\u4EE3\u7406\u5546</div><label>\u65E7\u4EE3\u7406\u5546\u7F16\u53F7<input id="syt-device-old-id" readonly></label><label>\u65E7\u4EE3\u7406\u5546\u540D\u79F0<input id="syt-device-old-name" readonly></label><label>\u65E7\u4EE3\u7406\u5546\u7C7B\u578B<input id="syt-device-old-type" readonly></label><div class="section-title">\u65B0\u4EE3\u7406\u5546</div><label>\u65B0\u4EE3\u7406\u5546\u7F16\u53F7<input id="syt-device-new-id" autocomplete="off"></label><label>\u65B0\u4EE3\u7406\u5546\u540D\u79F0<input id="syt-device-new-name" readonly></label><label>\u65B0\u4EE3\u7406\u5546\u7C7B\u578B<input id="syt-device-new-type" readonly></label><button id="syt-run-device" class="primary" type="button">\u786E\u8BA4\u5212\u62E8</button><div id="syt-device-status" class="status"></div></section>
        <section id="syt-view-lhsd-device" class="view"><label>SN<input id="syt-lhsd-device-sn" autocomplete="off"></label><label>\u65E7\u4EE3\u7406\u5546\u7F16\u53F7<input id="syt-lhsd-device-old-id" autocomplete="off"></label><label>\u65B0\u4EE3\u7406\u5546\u7F16\u53F7<input id="syt-lhsd-device-new-id" autocomplete="off"></label><button id="syt-run-lhsd-device" class="primary" type="button">\u786E\u8BA4\u5212\u62E8</button><div id="syt-lhsd-device-status" class="status"></div></section>
        <section id="syt-view-whitelist" class="view"><div class="form-row"><label>\u624B\u673A\u53F7<input id="syt-white-mobile" autocomplete="off"></label><label>\u8EAB\u4EFD\u8BC1\u53F7<input id="syt-white-id" autocomplete="off"></label></div><div class="form-row"><label>\u8425\u4E1A\u6267\u7167\u53F7<input id="syt-white-license" autocomplete="off"></label><label>\u7ED3\u7B97\u8D26\u53F7<input id="syt-white-account" autocomplete="off"></label></div><button id="syt-run-whitelist" class="primary" type="button">\u6DFB\u52A0\u9632\u5207\u6237\u767D\u540D\u5355</button><div id="syt-white-status" class="status"></div></section>
        <section class="log"><div class="log-actions"><button id="syt-log-toggle" class="text-button" type="button" aria-expanded="false" aria-controls="syt-log-full">${icon("chevron")}\u8FD0\u884C\u65E5\u5FD7</button><button id="syt-log-clear" class="icon-button" type="button" title="\u6E05\u7A7A\u65E5\u5FD7" aria-label="\u6E05\u7A7A\u65E5\u5FD7">${icon("trash")}</button></div><div id="syt-log-preview" aria-live="polite">\u7B49\u5F85\u6267\u884C</div><div id="syt-log-full"></div></section>
      </main>
    </section>`;
    document.body.append(root);
    initializeDisplaySize(byId(root, "syt-display-size"), byId(root, "syt-display-status"));
    const backButton = byId(root, "syt-back");
    const title = byId(root, "syt-title");
    const resetInput = byId(root, "syt-merchant-ids");
    const businessLineInputs = Array.from(root.querySelectorAll('input[name="syt-business-line"]'));
    const toolSelect = byId(root, "syt-tool-select");
    toolSelect.add(new Option("CUPS \u4E0A\u62A5", "cups"));
    const clearMerchant = byId(root, "syt-clear-merchant");
    const merchantHint = byId(root, "syt-merchant-hint");
    const optionalConfig = byId(root, "syt-optional-config");
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
    let resetRunning = false;
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
      root.querySelectorAll("#syt-view-reset input, #syt-view-reset select").forEach((control) => {
        control.disabled = next;
      });
      clearMerchant.disabled = next;
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
      renderResultList(resultBody, results, resetRunning, (message) => log(message, true));
      copyButton.disabled = !results.length;
      copyButton.classList.remove("copied");
      setButtonLabel(copyButton, "copy", "\u590D\u5236\u5168\u90E8");
    };
    const copyCurrentResults = async (automatic = false) => {
      if (!latestResults.length) return;
      try {
        await copyText(copyResultText(latestResults));
        copyButton.classList.add("copied");
        setButtonLabel(copyButton, "check", "\u5DF2\u590D\u5236");
        log(automatic ? "\u5DF2\u81EA\u52A8\u590D\u5236\u672C\u6279\u91CD\u7F6E\u7ED3\u679C" : "\u5DF2\u590D\u5236\u672C\u6279\u91CD\u7F6E\u7ED3\u679C");
      } catch (error) {
        copyButton.classList.remove("copied");
        setButtonLabel(copyButton, "copy", "\u590D\u5236\u5168\u90E8");
        log(`\u590D\u5236\u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`, true);
      }
    };
    const showView = (name) => {
      root.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `syt-view-${name}`));
      backButton.classList.toggle("visible", name !== "reset");
      title.textContent = name === "reset" ? "\u5B50\u5546\u6237\u53F7\u91CD\u7F6E" : { cups: "CUPS \u4E0A\u62A5", code: "\u7801\u724C\u5212\u8F6C", device: "\u6536\u94F6\u901A\u673A\u5177\u5212\u62E8", "lhsd-device": "\u8054\u5408\u6536\u5355\u673A\u5177\u5212\u62E8", "bind-config": "\u8BBE\u5907\u6362\u7ED1\u914D\u7F6E", whitelist: "\u9632\u5207\u6237\u767D\u540D\u5355" }[name];
      toolSelect.value = "";
    };
    const updateOptionalSummary = () => {
      const configured = Object.values(reportOptions()).some((value) => typeof value === "string" && value.trim());
      byId(root, "syt-optional-summary").textContent = configured ? "\u5DF2\u914D\u7F6E" : "\u6E20\u9053 \xB7 appid \xB7 \u6388\u6743\u76EE\u5F55";
    };
    const applyPreset = () => {
      const option = PRESETS[Number(preset.value)] || PRESETS[0];
      wxChannelId.value = option.channelId;
      wxChannelName.value = option.channelName;
      appids.value = option.subAppids;
      jsapiPaths.value = option.jsapiPaths;
      channelOptions.classList.toggle("hidden", option.name === "\u65E0");
      updateOptionalSummary();
    };
    const updateMerchantHint = () => {
      const ids = resetInput.value.split(";").map((value) => value.trim()).filter(Boolean);
      let message = ids.length ? `\u5DF2\u8BC6\u522B ${ids.length} \u4E2A\u5546\u6237 \xB7 \u91CD\u7F6E\u6700\u591A 5 \u4E2A` : "\u91CD\u7F6E\u6700\u591A 5 \u4E2A \xB7 \u914D\u7F6E key \u4E0D\u9650\u6570\u91CF";
      let invalid = false;
      if (ids.some((id) => !/^\d{10}$/.test(id))) {
        message = "\u5546\u6237\u53F7\u9700\u4E3A 10 \u4F4D\u6570\u5B57\uFF0C\u591A\u4E2A\u4EE5\u82F1\u6587 ; \u5206\u9694";
        invalid = true;
      } else if (new Set(ids).size !== ids.length) {
        message = "\u5B58\u5728\u91CD\u590D\u5546\u6237\u53F7\uFF0C\u8BF7\u68C0\u67E5";
        invalid = true;
      } else if (ids.length > 5) message = `\u5DF2\u8BC6\u522B ${ids.length} \u4E2A\u5546\u6237 \xB7 \u4EC5\u914D\u7F6E key \u652F\u6301\u8D85\u8FC7 5 \u4E2A`;
      merchantHint.textContent = message;
      merchantHint.classList.toggle("error", invalid);
      resetInput.setAttribute("aria-invalid", String(invalid));
    };
    const clearMerchantInput = () => {
      if (busy) return;
      resetInput.value = "";
      updateMerchantHint();
      resetInput.focus();
    };
    resetInput.addEventListener("dblclick", clearMerchantInput);
    resetInput.addEventListener("input", updateMerchantHint);
    clearMerchant.addEventListener("click", clearMerchantInput);
    optionalConfig.addEventListener("input", updateOptionalSummary);
    backButton.addEventListener("click", () => showView("reset"));
    preset.addEventListener("change", applyPreset);
    toolSelect.addEventListener("change", () => showView(toolSelect.value));
    logToggle.addEventListener("click", () => {
      const isOpen = root.classList.toggle("log-open");
      logToggle.setAttribute("aria-expanded", String(isOpen));
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
        const type = root.querySelector('input[name="syt-report-type"]:checked').value;
        const businessLine = selectedBusinessLine();
        const reportMode = businessLine === "lhsd" ? "COMMON" : "SYT";
        const options = reportOptions();
        validateChannels(options);
        if (type === "ALIPAY" && (options.subAppids || options.jsapiPaths)) {
          throw new Error("\u652F\u4ED8\u5B9D\u5355\u72EC\u91CD\u7F6E\u4E0D\u80FD\u7ED1\u5B9A\u5FAE\u4FE1\u652F\u4ED8\u53C2\u6570\uFF0C\u8BF7\u9009\u62E9\u5FAE\u4FE1\u6216\u5168\u90E8\u91CD\u7F6E");
        }
        setBusy(true);
        resetRunning = true;
        renderResults([]);
        const useCustomChannel = hasCustomChannel(options);
        setStatus(resetStatus, useCustomChannel ? `\u6B63\u5728\u5904\u7406${businessLineName(businessLine)}\u81EA\u5B9A\u4E49\u6E20\u9053\u91CD\u7F6E` : `\u6B63\u5728\u8C03\u7528${businessLineName(businessLine)}\u6279\u91CF\u91CD\u7F6E\u63A5\u53E3`);
        log(`\u5F00\u59CB${businessLineName(businessLine)}${useCustomChannel ? "\u81EA\u5B9A\u4E49\u6E20\u9053" : "\u6279\u91CF"}\u91CD\u7F6E: ${merchantIds.join("\uFF1B")}`);
        const results = useCustomChannel ? await runCustomChannelReset(merchantIds, type, options, log, renderResults, businessLine) : await runBatchReset(merchantIds, type, options, log, reportMode);
        resetRunning = false;
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
        if (resetRunning) {
          resetRunning = false;
          renderResults(latestResults);
        }
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
          optionalConfig.open = true;
          appids.focus();
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
    const lhsdDeviceSubmit = byId(root, "syt-run-lhsd-device");
    const lhsdDeviceStatus = byId(root, "syt-lhsd-device-status");
    lhsdDeviceSubmit.addEventListener("click", async () => {
      if (lhsdDeviceSubmit.disabled) return;
      const values = {
        sn: byId(root, "syt-lhsd-device-sn").value.trim(),
        oldAgentId: byId(root, "syt-lhsd-device-old-id").value.trim(),
        newAgentId: byId(root, "syt-lhsd-device-new-id").value.trim()
      };
      lhsdDeviceSubmit.disabled = true;
      try {
        setStatus(lhsdDeviceStatus, "\u6B63\u5728\u53D1\u8D77\u8054\u5408\u6536\u5355\u673A\u5177\u5212\u62E8...");
        const result = await submitLhsdDeviceTransfer2(values);
        const countText = result.count > 0 ? `\uFF0C\u5904\u7406\u6570\u91CF ${result.count}` : "";
        setStatus(lhsdDeviceStatus, `\u8054\u5408\u6536\u5355\u673A\u5177\u5212\u62E8\u6210\u529F${countText}`);
        log(`\u8054\u5408\u6536\u5355\u673A\u5177 ${values.sn} \u5212\u62E8\u6210\u529F: ${values.oldAgentId} -> ${values.newAgentId}${countText}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(lhsdDeviceStatus, `\u8054\u5408\u6536\u5355\u673A\u5177\u5212\u62E8\u5931\u8D25: ${message}`, true);
        log(`\u8054\u5408\u6536\u5355\u673A\u5177\u5212\u62E8\u5931\u8D25: ${message}`, true);
      } finally {
        lhsdDeviceSubmit.disabled = false;
      }
    });
    const cupsSubmit = byId(root, "syt-run-cups");
    const cupsMerchant = byId(root, "syt-cups-merchant");
    const cupsStatus = byId(root, "syt-cups-status");
    cupsSubmit.addEventListener("click", async () => {
      if (cupsSubmit.disabled) return;
      cupsSubmit.disabled = true;
      cupsMerchant.disabled = true;
      cupsSubmit.textContent = "\u63D0\u4EA4\u4E2D...";
      try {
        const result = await reportCups(cupsMerchant.value, (message) => {
          setStatus(cupsStatus, message);
          log(message);
        });
        setStatus(cupsStatus, result.message);
        cupsStatus.classList.add(result.state === "accepted" ? "cups-success" : "cups-warning");
        log(result.message);
      } catch (error) {
        const message = `CUPS \u4E0A\u62A5\u7533\u8BF7\u672A\u786E\u8BA4\u6210\u529F\uFF1A${error instanceof Error ? error.message : String(error)}`;
        setStatus(cupsStatus, message, true);
        log(message, true);
      } finally {
        cupsSubmit.disabled = false;
        cupsMerchant.disabled = false;
        cupsSubmit.textContent = "\u63D0\u4EA4\u4E0A\u62A5\u7533\u8BF7";
      }
    });
    const bindConfigView = byId(root, "syt-view-bind-config");
    const bindConfigSubmit = byId(root, "syt-run-bind-config");
    bindConfigSubmit.addEventListener("click", async () => {
      if (bindConfigSubmit.disabled) return;
      const status = byId(root, "syt-bind-config-status");
      const values = {
        sn: byId(root, "syt-bind-config-sn").value,
        perDayBindTimes: byId(root, "syt-bind-config-day").value,
        perMonthBindTimes: byId(root, "syt-bind-config-month").value,
        whiteList: bindConfigView.querySelector('input[name="syt-bind-config-whitelist"]:checked')?.value
      };
      const controls = bindConfigView.querySelectorAll("input, button");
      controls.forEach((control) => {
        control.disabled = true;
      });
      bindConfigSubmit.textContent = "\u5904\u7406\u4E2D...";
      try {
        setStatus(status, "\u6B63\u5728\u67E5\u8BE2\u5E76\u4FDD\u5B58\u8BBE\u5907\u6362\u7ED1\u914D\u7F6E...");
        const action = await saveDeviceBindConfig(values, log);
        setStatus(status, `\u8BBE\u5907\u6362\u7ED1\u914D\u7F6E${action === "created" ? "\u65B0\u589E" : "\u4FEE\u6539"}\u6210\u529F`);
      } catch (error) {
        const message = `\u8BBE\u5907\u6362\u7ED1\u914D\u7F6E\u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`;
        setStatus(status, message, true);
        log(message, true);
      } finally {
        controls.forEach((control) => {
          control.disabled = false;
        });
        bindConfigSubmit.textContent = "\u786E\u8BA4\u914D\u7F6E";
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
    applyPreset();
  }
  createPanel();
})();
