// ==UserScript==
// @name         收银通重置子商户号工具脚本
// @namespace    https://om.leshuazf.com/
// @version      0.0.13
// @description  自动执行运营后台微信/支付宝子商户号上报、轮询确认、禁用旧号，并输出新上报子商户号
// @author       swx
// @match        https://om.leshuazf.com/*
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      gitee.com
// @connect      raw.giteeusercontent.com
// @run-at       document-end
// @updateURL    https://gitee.com/swxswxer1/submch-reset/raw/master/syt-submch-reset.user.js
// @downloadURL  https://gitee.com/swxswxer1/submch-reset/raw/master/syt-submch-reset.user.js
// ==/UserScript==


(function () {
  'use strict';

  const ORIGIN = 'https://om.leshuazf.com';
  const SAAS = `${ORIGIN}/saasadmin`;
  const BUSINESS_NAME = '收银通';
  const USER_NAME_SELECTOR = 'body > div.panel.layout-panel.layout-panel-north.layout-split-north > div > span.head > span';
  const WHITELIST_URL = 'https://raw.giteeusercontent.com/swxswxer1/submch-reset/raw/master/syt-whitelist.json';
  let whitelistCache = null;
  let whitelistPromise = null;
  const STATUS = {
    UNNOTIFIED: '未通知',
    DISABLED: '禁用',
    ENABLED: '启用',
  };
  const CHANNEL_STATUS_FIELD = {
    银联: 'unionStatus',
    网联: 'nuccStatus',
    网联互联互通: 'interconnectionStatus',
  };
  const STATUS_FIELD_CHANNEL = {
    unionStatus: '银联',
    nuccStatus: '网联',
    interconnectionStatus: '网联互联互通',
  };

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function formatDateTime(date) {
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
    ].join('-') + ' ' + [
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds()),
    ].join(':');
  }

  function getDateRange(options = {}) {
    const end = new Date();
    const start = new Date(end);
    if (options.years) {
      start.setFullYear(start.getFullYear() - options.years);
    } else {
      start.setDate(start.getDate() - (options.days || 1));
    }
    return {
      createStartTime: formatDateTime(start),
      createEndTime: formatDateTime(end),
    };
  }

  function getDefaultRange() {
    return getDateRange({ days: 1 });
  }

  function uniqueBy(list, keyFn) {
    const seen = new Set();
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
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function getLoginUserText() {
    const localNode = document.querySelector(USER_NAME_SELECTOR);
    if (localNode) return normalizeText(localNode.textContent);

    try {
      const topNode = window.top && window.top.document.querySelector(USER_NAME_SELECTOR);
      if (topNode) return normalizeText(topNode.textContent);
    } catch (error) {
      return '';
    }

    return '';
  }

  function getLoginUserName() {
    const text = getLoginUserText();
    const match = text.match(/欢迎\s*([^（(\s]+)\s*[（(]/);
    return match ? match[1] : '';
  }

  function requestWhitelistText(url) {
    return new Promise((resolve, reject) => {
      const requestUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
      const request = typeof GM_xmlhttpRequest === 'function'
        ? GM_xmlhttpRequest
        : (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function' ? GM.xmlHttpRequest : null);

      if (request) {
        request({
          method: 'GET',
          url: requestUrl,
          headers: {
            Accept: 'application/json,text/plain,*/*',
          },
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) {
              resolve(response.responseText || '');
              return;
            }
            reject(new Error(`HTTP ${response.status}`));
          },
          onerror: () => reject(new Error('网络请求失败')),
          ontimeout: () => reject(new Error('网络请求超时')),
        });
        return;
      }

      reject(new Error('油猴跨域请求能力不可用，请更新或重新安装脚本并允许 gitee.com 访问权限'));
    });
  }

  function parseWhitelist(text) {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) {
      throw new Error('白名单文件必须是 JSON 数组');
    }
    return new Set(data.map((item) => normalizeText(item)).filter(Boolean));
  }

  async function getWhitelist() {
    if (whitelistCache) return whitelistCache;
    if (!whitelistPromise) {
      whitelistPromise = requestWhitelistText(WHITELIST_URL).then(parseWhitelist);
    }
    try {
      whitelistCache = await whitelistPromise;
      return whitelistCache;
    } catch (error) {
      whitelistPromise = null;
      throw new Error(`读取${BUSINESS_NAME}白名单失败: ${error.message}`);
    }
  }

  async function assertCurrentUserAllowed() {
    const userName = getLoginUserName();
    if (!userName) {
      throw new Error('无法识别当前登录用户，请在运营后台主页面加载完成后再试');
    }
    const whitelist = await getWhitelist();
    if (!whitelist.has(userName)) {
      throw new Error(`当前用户 ${userName} 不在${BUSINESS_NAME}白名单内，禁止重置子商户号`);
    }
    return userName;
  }

  getWhitelist().catch(() => undefined);

  function buildFormBody(params) {
    const body = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      body.set(key, value == null ? '' : String(value));
    });
    return body;
  }

  function getPageFetch() {
    if (typeof unsafeWindow !== 'undefined' && unsafeWindow.fetch) {
      return unsafeWindow.fetch.bind(unsafeWindow);
    }
    return window.fetch.bind(window);
  }

  function summarizeHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const title = normalizeText(doc.querySelector('title') ? doc.querySelector('title').textContent : '');
    const body = normalizeText(doc.body ? doc.body.textContent : html);
    const summary = [title ? `标题: ${title}` : '', body ? `正文: ${body.slice(0, 260)}` : ''].filter(Boolean).join('；');
    return summary || html.slice(0, 260);
  }

  function getHtmlMessage(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return normalizeText(doc.body ? doc.body.textContent : html);
  }

  function detectHtmlError(html) {
    const message = getHtmlMessage(html);
    if (message.includes('没有该项操作权限')) {
      return '没有该项操作权限，请确认当前账号已开通该后台操作权限';
    }
    if (/登录|login|验证码/.test(message)) {
      return '当前登录态可能已失效，请重新登录运营后台后再试';
    }
    return '';
  }

  function looksLikeHtml(text) {
    return /^\s*<!doctype html/i.test(text) || /^\s*<html[\s>]/i.test(text);
  }

  async function requestText(url, options = {}) {
    const fetchImpl = getPageFetch();
    const { accept, headers, ...fetchOptions } = options;
    const response = await fetchImpl(url, {
      credentials: 'include',
      redirect: 'follow',
      ...fetchOptions,
      headers: {
        Accept: accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'X-Requested-With': 'XMLHttpRequest',
        ...(headers || {}),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`请求失败 ${response.status}: ${text.slice(0, 200)}`);
    }
    return text;
  }

  async function requestJson(url, options = {}) {
    const text = await requestText(url, {
      ...options,
      accept: 'application/json, text/javascript, */*; q=0.01',
      headers: {
        'Content-Type': 'text/json,charset=utf-8',
        ...(options.headers || {}),
      },
    });
    try {
      return JSON.parse(text);
    } catch (error) {
      const htmlError = looksLikeHtml(text) ? detectHtmlError(text) : '';
      if (htmlError) throw new Error(htmlError);
      const detail = looksLikeHtml(text) ? summarizeHtml(text) : text.slice(0, 260);
      throw new Error(`JSON 解析失败，上报接口返回了非 JSON 内容。${detail}`);
    }
  }

  function getReportDataObject(response) {
    return response && response.data && typeof response.data === 'object' ? response.data : {};
  }

  function assertReportBusinessSuccess(response, label) {
    const reportData = getReportDataObject(response);
    if (reportData.result != null && Number(reportData.result) !== 0) {
      throw new Error(`${label}上报失败: ${reportData.msg || response.respMsg || JSON.stringify(response)}`);
    }
  }

  async function submitWechatReport(merchantId, options = {}) {
    assertMerchantId(merchantId);
    const params = new URLSearchParams({
      method: 'posreport',
      merchantId,
      channelId: options.channelId || '209096974',
      channelName: options.channelName || '深圳市前海扫扫科技有限公司',
      notice: options.notice == null ? '1' : String(options.notice),
      mchId: options.mchId || '1502075691',
      configType: options.configType == null ? '1' : String(options.configType),
      payType: options.payType || '2',
    });
    const data = await requestJson(`${SAAS}/wxsubmch.do?${params.toString()}`, {
      method: 'GET',
      headers: {
        Referer: `${SAAS}/wxsubmch.do?method=page`,
      },
    });
    if (Number(data.respCode) !== 0) {
      throw new Error(`上报失败: ${data.respMsg || JSON.stringify(data)}`);
    }
    assertReportBusinessSuccess(data, '微信');
    const wxMchId = normalizeText(getReportDataObject(data).wxMchId || data.wxMchId || data.data);
    if (!/^\d+$/.test(wxMchId)) {
      throw new Error(`上报接口未返回微信子商户号: ${JSON.stringify(data)}`);
    }
    return {
      ...data,
      rawData: data.data,
      data: wxMchId,
      wxMchId,
    };
  }

  const reportMerchant = submitWechatReport;

  async function submitAlipayReport(merchantId, options = {}) {
    assertMerchantId(merchantId);
    const params = new URLSearchParams({
      method: 'posreport',
      merchantId,
      sourcePid: options.sourcePid || '2088621549599695',
      sourceName: options.sourceName || '乐刷支付科技有限公司',
      report4M3Flag: options.report4M3Flag == null ? '2' : String(options.report4M3Flag),
      configType: options.configType || '',
      notice: options.notice == null ? '1' : String(options.notice),
    });
    const data = await requestJson(`${SAAS}/zfbsubmch.do?${params.toString()}`, {
      method: 'GET',
      headers: {
        Referer: `${SAAS}/zfbsubmch.do?method=page`,
      },
    });
    if (Number(data.respCode) !== 0) {
      throw new Error(`支付宝上报失败: ${data.respMsg || JSON.stringify(data)}`);
    }
    assertReportBusinessSuccess(data, '支付宝');
    const zfbSubMch = normalizeText(getReportDataObject(data).zfbSubMch || data.zfbSubMch || data.data);
    if (!/^\d+$/.test(zfbSubMch)) {
      throw new Error(`支付宝上报接口未返回支付宝子商户号: ${JSON.stringify(data)}`);
    }
    return {
      ...data,
      rawData: data.data,
      data: zfbSubMch,
      zfbSubMch,
    };
  }

  async function queryWechatMappings(merchantId, options = {}) {
    assertMerchantId(merchantId);
    const range = getDateRange({ days: 1 });
    const body = buildFormBody({
      createStartTime: options.createStartTime || range.createStartTime,
      createEndTime: options.createEndTime || range.createEndTime,
      payType: options.payType || '2',
      status: options.status || '',
      isDefault: options.isDefault || '',
      source: options.source || '',
      channelType: options.channelType || '',
      updateStartTime: options.updateStartTime || '',
      updateEndTime: options.updateEndTime || '',
      agentId1g: options.agentId1g || '',
      merchantId,
      wxSubMchId: options.wxSubMchId || '',
      nuccwxMchId: options.nuccwxMchId || '',
      pageSize: options.pageSize || '200',
    });
    const html = await requestText(`${SAAS}/wechatMappingInfo.do?method=page`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: ORIGIN,
        Referer: `${SAAS}/wechatMappingInfo.do?method=page`,
      },
      body,
    });
    return parseMappingHtml(html, 'wechat');
  }

  async function queryAlipayMappings(merchantId, options = {}) {
    assertMerchantId(merchantId);
    const range = getDateRange({ days: 1 });
    const body = buildFormBody({
      createStartTime: options.createStartTime || range.createStartTime,
      createEndTime: options.createEndTime || range.createEndTime,
      payType: options.payType || '2',
      status: options.status || '',
      isDefault: options.isDefault || '',
      source: options.source || '',
      channelType: options.channelType || '',
      updateStartTime: options.updateStartTime || '',
      updateEndTime: options.updateEndTime || '',
      agentId1g: options.agentId1g || '',
      merchantId,
      zfbSubMchId: options.zfbSubMchId || '',
      nuccZfbMchId: options.nuccZfbMchId || '',
      pageSize: options.pageSize || '200',
    });
    const html = await requestText(`${SAAS}/alipayMappingInfo.do?method=page`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: ORIGIN,
        Referer: `${SAAS}/alipayMappingInfo.do?method=page`,
      },
      body,
    });
    return parseMappingHtml(html, 'alipay');
  }

  function parseMappingHtml(html, type = 'wechat') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const subMchHeader = type === 'alipay' ? '支付宝商户号' : '微信商户号';
    const table = Array.from(doc.querySelectorAll('table.tablesorter')).find((item) => {
      return normalizeText(item.textContent).includes(subMchHeader) && normalizeText(item.textContent).includes('通知状态');
    });
    if (!table) return [];

    const headers = Array.from(table.querySelectorAll('thead th')).map((th) => normalizeText(th.textContent));
    return Array.from(table.querySelectorAll('tbody tr')).map((tr) => {
      const cells = Array.from(tr.querySelectorAll('td'));
      const row = {};
      headers.forEach((header, index) => {
        row[header] = normalizeText(cells[index] ? cells[index].textContent : '');
      });

      const statusLink = cells[0] ? cells[0].querySelector('a[onclick*="getSetTradeStatusPage"]') : null;
      const onclick = statusLink ? statusLink.getAttribute('onclick') || '' : '';
      row.merchantId = row['乐刷商户号'];
      row.wxSubMchId = row['微信商户号'] || '';
      row.zfbSubMchId = row['支付宝商户号'] || '';
      row.subMchId = type === 'alipay' ? row.zfbSubMchId : row.wxSubMchId;
      row.nuccwxMchId = row['网联商户号'] || '';
      row.nuccZfbMchId = row['网联商户号'] || '';
      row.channel = row['通道'];
      row.payTypeName = row['费率类型'];
      row.noticeStatus = row['通知状态'];
      row.source = row['来源'];
      row.createTime = row['创建时间'];
      row.updateTime = row['更新时间'];
      row.payType = extractOnclickParam(onclick, 'payType') || payTypeNameToCode(row.payTypeName);
      return row;
    }).filter((row) => row.merchantId || row.subMchId);
  }

  function extractOnclickParam(onclick, key) {
    const reg = new RegExp(`${key}=\\+'([^']*)'`);
    const match = onclick.match(reg);
    return match ? match[1] : '';
  }

  function payTypeNameToCode(name) {
    const map = {
      线上: '1',
      线下: '2',
      公缴: '3',
      公益: '4',
      保险: '5',
      绿洲: '6',
      高校食堂: '7',
      私立中小幼: '8',
      服饰日化: '9',
      线上批发: '10',
    };
    return map[normalizeText(name)] || '2';
  }

  function getChannelStatusField(channel) {
    return CHANNEL_STATUS_FIELD[normalizeText(channel)] || '';
  }

  function getStatusName(statusValue) {
    return String(statusValue) === '1' ? STATUS.ENABLED : STATUS.DISABLED;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function groupRowsForTradeStatus(rows, targetStatusValue, subMchIdKey = 'wxSubMchId') {
    const groupMap = new Map();
    rows.forEach((row) => {
      const subMchId = row[subMchIdKey] || row.subMchId;
      if (!subMchId) return;
      const key = `${subMchId}__${row.payType || '2'}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          merchantId: row.merchantId,
          subMchId,
          wxSubMchId: row.wxSubMchId || '',
          zfbSubMchId: row.zfbSubMchId || '',
          payType: row.payType || '2',
          rows: [],
          statusParams: {},
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
    return rows.map((row) => normalizeText(row.channel)).filter(Boolean).sort().join('|');
  }

  function getPollOptions(options = {}) {
    return {
      startDelayMs: options.pollStartDelayMs == null ? 1000 : options.pollStartDelayMs,
      intervalMs: options.pollIntervalMs == null ? 2000 : options.pollIntervalMs,
      timeoutMs: options.pollTimeoutMs == null ? 30000 : options.pollTimeoutMs,
      settleMs: options.settleMs == null ? 2000 : options.settleMs,
    };
  }

  async function queryWechatUnnotifiedOnce(merchantId, wxSubMchId, options = {}) {
    const rows = await queryWechatMappings(merchantId, {
      ...options,
      wxSubMchId,
      ...getDateRange({ days: 1 }),
    });
    return {
      rows,
      unnotifiedRows: pickRowsByStatus(rows, STATUS.UNNOTIFIED),
    };
  }

  function buildSetTradeStatusBody(merchantId, subMchParamName, subMchId, payType, statusParams) {
    const params = {
      merchantId,
      [subMchParamName]: subMchId,
      payType,
    };
    Object.entries(statusParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params[key] = value;
      }
    });
    params.submit = '提 交';
    return buildFormBody(params);
  }

  async function setWechatTradeStatus(merchantId, wxSubMchId, statusParams, options = {}) {
    assertMerchantId(merchantId);
    if (!/^\d+$/.test(String(wxSubMchId || ''))) {
      throw new Error('微信商户号不能为空，且必须为数字');
    }
    if (!statusParams || Object.keys(statusParams).length === 0) {
      throw new Error('至少需要传入一个通道状态参数');
    }
    const payType = options.payType || '2';
    const body = buildSetTradeStatusBody(merchantId, 'wxSubMchId', wxSubMchId, payType, statusParams);
    const html = await requestText(`${SAAS}/wechatMappingInfo.do?method=setTradeStatus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: ORIGIN,
        Referer: `${SAAS}/wechatMappingInfo.do?method=getSetTradeStatusPage&merchantId=${encodeURIComponent(merchantId)}&wxSubMchId=${encodeURIComponent(wxSubMchId)}&payType=${encodeURIComponent(payType)}`,
      },
      body,
    });
    return parseStatusResultHtml(html, statusParams);
  }

  const setTradeStatus = setWechatTradeStatus;

  async function setAlipayTradeStatus(merchantId, zfbSubMchId, statusParams, options = {}) {
    assertMerchantId(merchantId);
    if (!/^\d+$/.test(String(zfbSubMchId || ''))) {
      throw new Error('支付宝商户号不能为空，且必须为数字');
    }
    if (!statusParams || Object.keys(statusParams).length === 0) {
      throw new Error('至少需要传入一个通道状态参数');
    }
    const payType = options.payType || '2';
    const body = buildSetTradeStatusBody(merchantId, 'zfbSubMchId', zfbSubMchId, payType, statusParams);
    const html = await requestText(`${SAAS}/alipayMappingInfo.do?method=setTradeStatus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: ORIGIN,
        Referer: `${SAAS}/alipayMappingInfo.do?method=getSetTradeStatusPage&merchantId=${encodeURIComponent(merchantId)}&zfbSubMchId=${encodeURIComponent(zfbSubMchId)}&payType=${encodeURIComponent(payType)}`,
      },
      body,
    });
    return parseStatusResultHtml(html, statusParams);
  }

  function parseStatusResultHtml(html, statusParams) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const text = normalizeText(doc.body ? doc.body.textContent : html);
    const expectedTexts = Object.entries(statusParams || {}).map(([field, value]) => {
      return `${STATUS_FIELD_CHANNEL[field] || ''}:${getStatusName(value)}成功`;
    });
    return {
      ok: expectedTexts.length > 0 && expectedTexts.every((targetText) => text.includes(targetText)),
      message: text,
      html,
    };
  }

  async function setWechatStatusGroups(merchantId, groups, options = {}) {
    assertMerchantId(merchantId);
    const changedGroups = [];

    for (const group of groups) {
      if (options.onGroup) options.onGroup(group);
      const result = await setWechatTradeStatus(merchantId, group.wxSubMchId || group.subMchId, group.statusParams, {
        payType: group.payType,
      });
      changedGroups.push({ ...group, result });
      if (!result.ok) {
        throw new Error(`设置 ${group.wxSubMchId} 未确认成功: ${result.message}`);
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
        payType: group.payType,
      });
      changedGroups.push({ ...group, result });
      if (!result.ok) {
        throw new Error(`设置支付宝子商户号 ${group.zfbSubMchId || group.subMchId} 未确认成功: ${result.message}`);
      }
    }

    return changedGroups;
  }

  async function pollWechatNewMappings(merchantId, wxSubMchId, options = {}) {
    assertMerchantId(merchantId);
    const firstDelayMs = options.wechatFirstQueryDelayMs == null ? 3000 : options.wechatFirstQueryDelayMs;
    const intervalMs = options.wechatConfirmIntervalMs == null ? 2000 : options.wechatConfirmIntervalMs;
    const maxRetries = options.wechatConfirmRetries == null ? 3 : options.wechatConfirmRetries;
    const startedAt = Date.now();

    await sleep(firstDelayMs);
    for (let index = 0; index <= maxRetries; index += 1) {
      if (index > 0) await sleep(intervalMs);
      const rows = await queryWechatMappings(merchantId, {
        ...options,
        wxSubMchId,
        ...getDateRange({ days: 1 }),
      });
      const enabledRows = pickRowsByStatus(rows, STATUS.ENABLED);
      if (enabledRows.length > 0) {
        return { rows, enabledRows };
      }
    }
    throw new Error(`轮询超时，未查询到微信子商户号 ${wxSubMchId} 的启用映射记录`);
  }

  async function confirmNewWechatMappings(merchantId, wxSubMchId, options = {}) {
    return pollWechatNewMappings(merchantId, wxSubMchId, options);
  }

  async function disableOldEnabledWechatMappings(merchantId, newWxSubMchId, options = {}) {
    const rows = await queryWechatMappings(merchantId, {
      ...options,
      wxSubMchId: '',
      ...getDateRange({ years: 5 }),
    });
    const enabledRows = rows.filter((row) => {
      return row.wxSubMchId !== newWxSubMchId && normalizeText(row.noticeStatus) === STATUS.ENABLED;
    });
    const groups = groupRowsForTradeStatus(enabledRows, '0', 'wxSubMchId');
    const changedGroups = await setWechatStatusGroups(merchantId, groups, options);
    return {
      rows,
      enabledRows,
      groups,
      changedGroups,
    };
  }

  async function pollAlipayNewMappings(merchantId, zfbSubMchId, options = {}) {
    assertMerchantId(merchantId);
    const { startDelayMs, intervalMs, timeoutMs, settleMs } = getPollOptions(options);
    const startedAt = Date.now();
    let firstEnabledAt = 0;
    let lastChannelKey = '';
    let stableChannelCount = 0;
    let latestRows = [];
    let latestEnabledRows = [];

    await sleep(startDelayMs);
    while (Date.now() - startedAt <= timeoutMs) {
      const rows = await queryAlipayMappings(merchantId, {
        ...options,
        zfbSubMchId,
        ...getDateRange({ days: 1 }),
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
    throw new Error(`轮询超时，未查询到支付宝子商户号 ${zfbSubMchId} 的启用映射记录`);
  }

  async function confirmNewAlipayMappings(merchantId, zfbSubMchId, options = {}) {
    return pollAlipayNewMappings(merchantId, zfbSubMchId, options);
  }

  async function disableOldEnabledAlipayMappings(merchantId, newZfbSubMchId, options = {}) {
    const rows = await queryAlipayMappings(merchantId, {
      ...options,
      zfbSubMchId: '',
      ...getDateRange({ years: 5 }),
    });
    const enabledRows = rows.filter((row) => {
      return row.zfbSubMchId !== newZfbSubMchId && normalizeText(row.noticeStatus) === STATUS.ENABLED;
    });
    const groups = groupRowsForTradeStatus(enabledRows, '0', 'zfbSubMchId');
    const changedGroups = await setAlipayStatusGroups(merchantId, groups, options);
    return {
      rows,
      enabledRows,
      groups,
      changedGroups,
    };
  }

  async function wechatAutoReport(merchantId, options = {}) {
    assertMerchantId(merchantId);
    const logs = [];
    const log = (message) => {
      logs.push(`[${formatDateTime(new Date())}] ${message}`);
      if (options.onLog) options.onLog(message, logs.slice());
    };

    const userName = await assertCurrentUserAllowed();
    log(`当前用户 ${userName} 已通过${BUSINESS_NAME}白名单校验`);
    log(`开始微信上报商户 ${merchantId}`);
    const report = await submitWechatReport(merchantId, options);
    const newWxSubMchId = String(report.data);
    log(`上报任务已提交，返回微信子商户号: ${newWxSubMchId}`);

    log('等待 3 秒后查询新微信子商户号启用状态，没有查到则每隔 2 秒重试，最多重试 3 次');
    const confirmResult = await confirmNewWechatMappings(merchantId, newWxSubMchId, options);
    log(`新微信子商户号已启用，查询到 ${confirmResult.enabledRows.length} 条启用记录`);

    log('查询 5 年内旧启用微信子商户号并禁用');
    const disableResult = await disableOldEnabledWechatMappings(merchantId, newWxSubMchId, {
      ...options,
      onGroup: (group) => {
        const paramsText = Object.entries(group.statusParams)
            .map(([key, value]) => `${key}=${value}`)
            .join('&');
        log(`禁用旧微信子商户号 ${group.wxSubMchId}: ${paramsText}`);
      },
    });
    log(`旧微信子商户号禁用完成，处理 ${disableResult.changedGroups.length} 个分组`);

    const result = {
      merchantId,
      report,
      newWxSubMchId,
      newReportedWxSubMchId: newWxSubMchId,
      confirmResult,
      disableResult,
      logs,
    };
    log(`完成。新上报微信子商户号: ${newWxSubMchId}`);
    return result;
  }

  const autoReport = wechatAutoReport;

  async function alipayAutoReport(merchantId, options = {}) {
    assertMerchantId(merchantId);
    const logs = [];
    const log = (message) => {
      logs.push(`[${formatDateTime(new Date())}] ${message}`);
      if (options.onLog) options.onLog(message, logs.slice());
    };

    const userName = await assertCurrentUserAllowed();
    log(`当前用户 ${userName} 已通过${BUSINESS_NAME}白名单校验`);
    log(`开始支付宝上报商户 ${merchantId}`);
    const report = await submitAlipayReport(merchantId, options);
    const newZfbSubMchId = String(report.data);
    log(`支付宝上报任务已提交，返回支付宝子商户号: ${newZfbSubMchId}`);

    log('等待 1 秒后轮询新支付宝子商户号映射记录');
    const confirmResult = await confirmNewAlipayMappings(merchantId, newZfbSubMchId, options);
    log(`新支付宝子商户号已启用，查询到 ${confirmResult.enabledRows.length} 条启用记录`);

    log('查询 5 年内旧启用支付宝子商户号并禁用');
    const disableResult = await disableOldEnabledAlipayMappings(merchantId, newZfbSubMchId, {
      ...options,
      onGroup: (group) => {
        const paramsText = Object.entries(group.statusParams)
            .map(([key, value]) => `${key}=${value}`)
            .join('&');
        log(`禁用旧支付宝子商户号 ${group.zfbSubMchId || group.subMchId}: ${paramsText}`);
      },
    });
    log(`旧支付宝子商户号禁用完成，处理 ${disableResult.changedGroups.length} 个分组`);

    const result = {
      merchantId,
      report,
      newZfbSubMchId,
      newReportedZfbSubMchId: newZfbSubMchId,
      confirmResult,
      disableResult,
      logs,
    };
    log(`完成。新上报支付宝子商户号: ${newZfbSubMchId}`);
    return result;
  }

  async function allAutoReport(merchantId, options = {}) {
    const logs = [];
    const onLog = (message) => {
      logs.push(`[${formatDateTime(new Date())}] ${message}`);
      if (options.onLog) options.onLog(message, logs.slice());
    };
    const wechatResult = await wechatAutoReport(merchantId, { ...options, onLog });
    const alipayResult = await alipayAutoReport(merchantId, { ...options, onLog });
    return {
      merchantId,
      wechatResult,
      alipayResult,
      newWxSubMchId: wechatResult.newWxSubMchId,
      newZfbSubMchId: alipayResult.newZfbSubMchId,
      logs,
    };
  }

  function assertMerchantId(merchantId) {
    if (!/^\d{10}$/.test(String(merchantId || ''))) {
      throw new Error('乐刷商户号不能为空，且必须为 10 位数字');
    }
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  function createPanel() {
    if (document.getElementById('syt-auto-report-panel')) return;

    const style = document.createElement('style');
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
      #syt-auto-report-panel .log-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 8px;
      }
      #syt-auto-report-panel .log-actions button {
        min-width: 96px;
      }
      #syt-auto-report-panel .result-row {
        margin-top: 8px;
      }
      #syt-auto-report-panel .copy-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 8px;
      }
      #syt-auto-report-panel .copy-actions button {
        min-width: 96px;
      }
      #syt-auto-report-panel .notice-tip {
        position: relative;
        display: inline-flex;
        align-items: center;
        height: 30px;
        color: #1d4ed8;
        font-weight: 700;
        cursor: help;
      }
      #syt-auto-report-panel .notice-tip::after {
        content: attr(data-tip);
        position: absolute;
        left: 0;
        bottom: 34px;
        display: none;
        width: 300px;
        padding: 8px 10px;
        color: #111827;
        background: #fff;
        border: 1px solid #c7d2fe;
        box-shadow: 0 8px 20px rgba(15, 23, 42, .18);
        white-space: pre-line;
        word-break: break-word;
        line-height: 1.5;
        z-index: 1;
      }
      #syt-auto-report-panel .notice-tip:hover::after {
        display: block;
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

    const panel = document.createElement('div');
    panel.id = 'syt-auto-report-panel';
    panel.className = 'collapsed';
    panel.innerHTML = `
      <button class="float-ball" type="button" title="打开收银通重置子商户号工具">重置</button>
      <div class="panel-window">
        <header>
          <span>收银通重置子商户号工具</span>
          <button class="close" type="button" title="收起">x</button>
        </header>
        <div class="body">
          <div>
            <input id="om-auto-report-merchant" type="text" inputmode="numeric" placeholder="乐刷商户号">
          </div>
          <div class="actions">
            <button id="om-auto-report-wechat" type="button">微信重置子商户号</button>
            <button id="om-auto-report-alipay" type="button">支付宝重置子商户号</button>
            <button id="om-auto-report-all" type="button">全部重置子商户号</button>
          </div>
          <div class="result-label">新上报微信子商户号</div>
          <div class="result-row">
            <input id="om-auto-report-result" type="text" readonly placeholder="执行成功后显示">
          </div>
          <div class="result-label">新上报支付宝子商户号</div>
          <div class="result-row">
            <input id="om-auto-report-alipay-result" type="text" readonly placeholder="执行成功后显示">
          </div>
          <div class="copy-actions">
            <span class="notice-tip" data-tip="微信默认上报渠道号：209096974深圳市前海扫扫科技有限公司&#10;支付宝默认上报渠道号：2088621549599695乐刷支付科技有限公司&#10;暂不支持修改">注意事项</span>
            <button id="om-auto-report-copy" type="button" disabled>复制</button>
          </div>
          <pre id="om-auto-report-log"></pre>
          <div class="log-actions">
            <button id="om-auto-report-clear" type="button">清空日志</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    const floatBall = panel.querySelector('.float-ball');
    const input = panel.querySelector('#om-auto-report-merchant');
    const logBox = panel.querySelector('#om-auto-report-log');
    const wechatButton = panel.querySelector('#om-auto-report-wechat');
    const alipayButton = panel.querySelector('#om-auto-report-alipay');
    const allButton = panel.querySelector('#om-auto-report-all');
    const clearButton = panel.querySelector('#om-auto-report-clear');
    const resultInput = panel.querySelector('#om-auto-report-result');
    const copyButton = panel.querySelector('#om-auto-report-copy');
    const alipayResultInput = panel.querySelector('#om-auto-report-alipay-result');
    const closeButton = panel.querySelector('.close');

    const pageMerchantInput = document.querySelector('input[name="merchantId"], #merchantId');
    if (pageMerchantInput && pageMerchantInput.value) input.value = pageMerchantInput.value.trim();

    const appendLog = (line, isError = false) => {
      const time = formatDateTime(new Date());
      const row = document.createElement('div');
      row.className = isError || /失败|错误|异常/.test(line) ? 'log-line error' : 'log-line';
      row.textContent = `[${time}] ${line}`;
      logBox.appendChild(row);
      logBox.scrollTop = logBox.scrollHeight;
    };
    const setBusy = (busy) => {
      wechatButton.disabled = busy;
      alipayButton.disabled = busy;
      allButton.disabled = busy;
    };
    const getCopyText = () => {
      const wechatValue = resultInput.value.trim();
      const alipayValue = alipayResultInput.value.trim();
      if (!wechatValue && !alipayValue) return '';
      return [
        `乐刷商户号：${input.value.trim()}`,
        wechatValue ? `微信：${wechatValue}` : '',
        alipayValue ? `支付宝：${alipayValue}` : '',
      ].filter(Boolean).join('\n');
    };
    const refreshCopyButton = () => {
      copyButton.disabled = !getCopyText();
    };
    const resetResultOutputs = () => {
      resultInput.value = '';
      alipayResultInput.value = '';
      refreshCopyButton();
    };

    wechatButton.addEventListener('click', async () => {
      setBusy(true);
      logBox.innerHTML = '';
      resetResultOutputs();
      try {
        const result = await autoReport(input.value.trim(), { onLog: appendLog });
        const newReportedId = result.newReportedWxSubMchId || '';
        resultInput.value = newReportedId;
        refreshCopyButton();
        appendLog(`新上报微信子商户号: ${newReportedId || '无'}`);
        console.log('omAutoReport result:', result);
      } catch (error) {
        appendLog(`失败: ${error.message}`, true);
        console.error(error);
      } finally {
        setBusy(false);
      }
    });

    alipayButton.addEventListener('click', async () => {
      setBusy(true);
      logBox.innerHTML = '';
      resetResultOutputs();
      try {
        const result = await alipayAutoReport(input.value.trim(), { onLog: appendLog });
        const newReportedId = result.newReportedZfbSubMchId || '';
        alipayResultInput.value = newReportedId;
        refreshCopyButton();
        appendLog(`新上报支付宝子商户号: ${newReportedId || '无'}`);
        console.log('omAutoReport alipay result:', result);
      } catch (error) {
        appendLog(`失败: ${error.message}`, true);
        console.error(error);
      } finally {
        setBusy(false);
      }
    });

    allButton.addEventListener('click', async () => {
      setBusy(true);
      logBox.innerHTML = '';
      resetResultOutputs();
      try {
        const merchantId = input.value.trim();
        const wechatResult = await wechatAutoReport(merchantId, { onLog: appendLog });
        const newWxSubMchId = wechatResult.newWxSubMchId || '';
        resultInput.value = newWxSubMchId;
        refreshCopyButton();
        appendLog(`新上报微信子商户号: ${newWxSubMchId || '无'}`);

        const alipayResult = await alipayAutoReport(merchantId, { onLog: appendLog });
        const newZfbSubMchId = alipayResult.newZfbSubMchId || '';
        alipayResultInput.value = newZfbSubMchId;
        refreshCopyButton();
        appendLog(`新上报支付宝子商户号: ${newZfbSubMchId || '无'}`);
        console.log('omAutoReport all result:', { wechatResult, alipayResult });
      } catch (error) {
        appendLog(`失败: ${error.message}`, true);
        console.error(error);
      } finally {
        setBusy(false);
      }
    });

    clearButton.addEventListener('click', () => {
      logBox.innerHTML = '';
      resetResultOutputs();
    });
    copyButton.addEventListener('click', async () => {
      const text = getCopyText();
      if (!text) return;
      try {
        await copyText(text);
        appendLog('已复制新上报子商户号');
      } catch (error) {
        appendLog(`复制失败: ${error.message}`, true);
      }
    });
    floatBall.addEventListener('click', () => {
      panel.classList.remove('collapsed');
      input.focus();
    });
    closeButton.addEventListener('click', () => {
      panel.classList.add('collapsed');
    });
  }

  function shouldCreatePanel() {
    const url = new URL(window.location.href);
    const method = url.searchParams.get('method') || '';
    const blockedMethods = new Set([
      'getSetTradeStatusPage',
      'setTradeStatus',
      'getSetTradeDefaultPage',
      'setTradeDefault',
    ]);
    if (blockedMethods.has(method)) return false;
    if (window.top === window.self) return true;
    return method === 'page';
  }

  const api = {
    wechatAutoReport,
    alipayAutoReport,
    allAutoReport,
    submitWechatReport,
    submitAlipayReport,
    reportMerchant,
    queryWechatMappings,
    queryAlipayMappings,
    parseMappingHtml,
    pollWechatNewMappings,
    pollAlipayNewMappings,
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
    getDefaultRange,
  };

  window.sytAutoReport = api;
  window.omAutoReport = api;
  if (typeof unsafeWindow !== 'undefined') {
    unsafeWindow.sytAutoReport = api;
    unsafeWindow.omAutoReport = api;
  }

  if (shouldCreatePanel()) {
    createPanel();
  }
})();
