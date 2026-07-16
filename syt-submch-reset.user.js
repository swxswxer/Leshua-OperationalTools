// ==UserScript==
// @name         收银通重置子商户号工具脚本
// @namespace    https://om.leshuazf.com/
// @version      1.0.3
// @description  自动执行运营后台微信/支付宝子商户号上报、轮询确认、禁用旧号，并输出新上报子商户号。
// @author       swx
// @match        https://om.leshuazf.com/*
// @grant        unsafeWindow
// @run-at       document-end
// @updateURL    https://gitee.com/swxswxer1/submch-reset/raw/master/syt-submch-reset.user.js
// @downloadURL  https://gitee.com/swxswxer1/submch-reset/raw/master/syt-submch-reset.user.js
// ==/UserScript==


(function () {
  'use strict';

  const ORIGIN = 'https://om.leshuazf.com';
  const SAAS = `${ORIGIN}/saasadmin`;
  const SYT_OMS = `${ORIGIN}/syt_oms`;
  const DEFAULT_WECHAT_CHANNEL_ID = '209096974';
  const DEFAULT_WECHAT_CHANNEL_NAME = '深圳市前海扫扫科技有限公司';
  const DEFAULT_ALIPAY_CHANNEL_ID = '2088621549599695';
  const DEFAULT_ALIPAY_CHANNEL_NAME = '乐刷支付科技有限公司';
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
  const CHANNEL_DEFAULT_FIELD = {
    银联: 'unionDefault',
    网联: 'nuccDefault',
    网联互联互通: 'interconnectionDefault',
  };
  const STATUS_FIELD_CHANNEL = {
    unionStatus: '银联',
    nuccStatus: '网联',
    interconnectionStatus: '网联互联互通',
  };
  const WECHAT_PAYMENT_PRESETS = [
    {
      name: '美团',
      channelId: '755607656',
      channelName: '天津三快飞跃科技有限公司',
      subAppids: 'wx1fde2c33280d64b6;wx0e8672034309be8f',
      jsapiPaths: 'https://openpay.meituan.com/;https://openpay-zc.st.meituan.com/',
    },
    {
      name: '乐店宝',
      channelId: '835134506',
      channelName: '深圳富云数科信息技术有限公司',
      subAppids: 'wx76a4c0a8a9ef465b',
      jsapiPaths: '',
    },
  ];

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

  function getAroundDateRange(options = {}) {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    start.setDate(start.getDate() - (options.beforeDays || 1));
    end.setDate(end.getDate() + (options.afterDays || 1));
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

  async function configureMerchantKey(merchantId) {
    assertMerchantId(merchantId);
    const html = await requestText(`${SAAS}/merchant-key-info.do?method=add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      referrer: `${SAAS}/merchant-key-info.do?method=addPage`,
      body: buildFormBody({
        merchants: merchantId,
        submit: '确认提交',
      }),
    });
    const htmlError = detectHtmlError(html);
    if (htmlError) throw new Error(htmlError);

    const message = getHtmlMessage(html);
    const successMatch = message.match(/新增成功\s*[：:]\s*(\d+)\s*个/);
    const failureMatch = message.match(/新增失败\s*[：:]\s*(\d+)\s*个/);
    const successCount = successMatch ? Number(successMatch[1]) : 0;
    const failureCount = failureMatch ? Number(failureMatch[1]) : 0;
    if (!successMatch || !failureMatch) {
      throw new Error(`无法确认商户 key 配置结果: ${summarizeHtml(html)}`);
    }
    if (successCount < 1 || failureCount > 0) {
      throw new Error(`商户 key 配置失败，新增成功 ${successCount} 个，新增失败 ${failureCount} 个`);
    }
    return {
      ok: true,
      merchantId,
      successCount,
      failureCount,
      message,
    };
  }

  function assertOmsSuccess(response, label, codeField = 'error_code') {
    if (!response || String(response[codeField]) !== '0') {
      const message = response?.error_msg || response?.returnDesc || JSON.stringify(response);
      throw new Error(`${label}失败: ${message}`);
    }
    return response;
  }

  function pickLatestEnabledMappingGroup(rows, type) {
    const subMchIdKey = type === 'alipay' ? 'zfbSubMchId' : 'wxSubMchId';
    const groupMap = new Map();
    rows.filter((row) => {
      return normalizeText(row.noticeStatus) === STATUS.ENABLED
        && String(row.payType || '2') === '2'
        && /^\d+$/.test(String(row[subMchIdKey] || ''));
    }).forEach((row) => {
      const subMchId = String(row[subMchIdKey]);
      if (!groupMap.has(subMchId)) {
        groupMap.set(subMchId, {
          subMchId,
          payType: '2',
          rows: [],
          latestTime: 0,
          defaultParams: {},
        });
      }
      const group = groupMap.get(subMchId);
      group.rows.push(row);
      group.latestTime = Math.max(group.latestTime, parseLooseDateTime(row.createTime));
      const field = CHANNEL_DEFAULT_FIELD[normalizeText(row.channel)];
      if (field) group.defaultParams[field] = '0';
    });
    return Array.from(groupMap.values())
        .filter((group) => Object.keys(group.defaultParams).length > 0)
        .sort((left, right) => right.latestTime - left.latestTime)[0] || null;
  }

  function parseDefaultResultHtml(html, defaultParams) {
    const message = getHtmlMessage(html);
    const expectedTexts = Object.keys(defaultParams).map((field) => {
      const channel = Object.entries(CHANNEL_DEFAULT_FIELD).find(([, value]) => value === field)?.[0] || '';
      return `${channel}:设置默认成功`;
    });
    return {
      ok: expectedTexts.length > 0 && expectedTexts.every((text) => message.includes(text)),
      message,
      html,
    };
  }

  async function setMappingTradeDefault(merchantId, group, type) {
    assertMerchantId(merchantId);
    if (!group || !/^\d+$/.test(String(group.subMchId || ''))) {
      throw new Error(`未找到可设置默认的${type === 'alipay' ? '支付宝' : '微信'}子商户号`);
    }
    const isAlipay = type === 'alipay';
    const endpoint = isAlipay ? 'alipayMappingInfo.do' : 'wechatMappingInfo.do';
    const subMchParam = isAlipay ? 'zfbSubMchId' : 'wxSubMchId';
    const body = buildFormBody({
      merchantId,
      [subMchParam]: group.subMchId,
      payType: group.payType || '2',
      ...group.defaultParams,
      submit: '提 交',
    });
    const html = await requestText(`${SAAS}/${endpoint}?method=setTradeDefault`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      referrer: `${SAAS}/${endpoint}?method=getSetTradeDefaultPage&merchantId=${encodeURIComponent(merchantId)}&${subMchParam}=${encodeURIComponent(group.subMchId)}&payType=${encodeURIComponent(group.payType || '2')}`,
      body,
    });
    const htmlError = detectHtmlError(html);
    if (htmlError) throw new Error(htmlError);
    const result = parseDefaultResultHtml(html, group.defaultParams);
    if (!result.ok) throw new Error(`设置默认结果未确认成功: ${result.message}`);
    return result;
  }

  async function openOnlineReceiptAuthority(merchantId) {
    const response = await requestJson(`${SYT_OMS}/syt-online-receipt-manager/batchOpenOnlineReceiptAuthhority`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
      },
      referrer: `${SYT_OMS}/views/ods/onlineReceiptManagement.html`,
      body: JSON.stringify({ merchantId, branchAuthorityFlag: 0 }),
    });
    return assertOmsSuccess(response, '开通在线收款单权限', 'returnCode');
  }

  async function reportOnlineReceiptChannel(merchantId, subMerchantId) {
    const response = await requestJson(`${SYT_OMS}/syt-online-receipt-manager/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
      },
      referrer: `${SYT_OMS}/views/ods/addressManagement.html`,
      body: JSON.stringify({
        hasSubMerchantId: 1,
        feeType: null,
        channel: null,
        channelId: null,
        subMerchantId,
        merchantId,
      }),
    });
    return assertOmsSuccess(response, `增加通道号 ${subMerchantId}`);
  }

  async function queryOnlineReceiptAddresses(merchantId, channel, subMerchantId) {
    const params = new URLSearchParams({
      pageNo: '1',
      pageSize: '20',
      merchantId,
      startTime: '',
      endTime: '',
      channel: String(channel),
      feeType: '',
      applyStatus: '',
      subMerchantId,
    });
    const response = await requestJson(`${SYT_OMS}/syt-online-receipt-manager/getBusinessAddresses?${params.toString()}`, {
      method: 'GET',
      referrer: `${SYT_OMS}/views/ods/addressManagement.html`,
    });
    assertOmsSuccess(response, '查询在线收款单经营地址记录');
    const records = Array.isArray(response?.data?.page?.records) ? response.data.page.records : [];
    return records.filter((record) => {
      return String(record.merchantId) === String(merchantId)
        && String(record.channel) === String(channel)
        && String(record.subMerchantId) === String(subMerchantId);
    });
  }

  async function pollOnlineReceiptAddressRecord(merchantId, channel, subMerchantId, options = {}) {
    const intervalMs = options.onlineReceiptPollIntervalMs == null ? 1000 : options.onlineReceiptPollIntervalMs;
    const timeoutMs = options.onlineReceiptPollTimeoutMs == null ? 15000 : options.onlineReceiptPollTimeoutMs;
    const deadline = Date.now() + timeoutMs;
    do {
      const records = await queryOnlineReceiptAddresses(merchantId, channel, subMerchantId);
      const record = records.slice().sort((left, right) => {
        return parseLooseDateTime(right.createTime) - parseLooseDateTime(left.createTime);
      })[0];
      if (record?.id) return record;
      if (Date.now() < deadline) await sleep(intervalMs);
    } while (Date.now() < deadline);
    throw new Error(`未查询到子商户号 ${subMerchantId} 的在线收款单经营地址记录`);
  }

  async function setOnlineReceiptBusinessAddress(id) {
    if (!/^\d+$/.test(String(id || ''))) throw new Error('在线收款单经营地址记录 id 无效');
    const response = await requestJson(`${SYT_OMS}/syt-online-receipt-manager/modifyBusinessAddress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
      },
      referrer: `${SYT_OMS}/views/ods/addressManagement.html`,
      body: JSON.stringify({
        modifyReason: '1',
        entireCountry: '1',
        cityCode: '0',
        city: ' ',
        provinceCode: '0',
        province: ' ',
        id: String(id),
      }),
    });
    return assertOmsSuccess(response, `设置经营地址记录 ${id}`);
  }

  async function enableOnlineReceipt(merchantId, options = {}) {
    assertMerchantId(merchantId);
    const log = (message) => {
      if (options.onLog) options.onLog(message);
    };
    log(`开始查询商户 ${merchantId} 的微信/支付宝启用映射记录`);
    const range = getDateRange({ years: 5 });
    const [wechatRows, alipayRows] = await Promise.all([
      queryWechatMappings(merchantId, { ...range, payType: '2', status: '1' }),
      queryAlipayMappings(merchantId, { ...range, payType: '2', status: '1' }),
    ]);
    const wechatGroup = pickLatestEnabledMappingGroup(wechatRows, 'wechat');
    const alipayGroup = pickLatestEnabledMappingGroup(alipayRows, 'alipay');
    if (!wechatGroup) throw new Error('未查询到可用的微信启用映射记录');
    if (!alipayGroup) throw new Error('未查询到可用的支付宝启用映射记录');
    log(`选中微信子商户号 ${wechatGroup.subMchId}，通道: ${wechatGroup.rows.map((row) => row.channel).join('、')}`);
    log(`选中支付宝子商户号 ${alipayGroup.subMchId}，通道: ${alipayGroup.rows.map((row) => row.channel).join('、')}`);

    log('开始设置微信默认通道号');
    const wechatDefaultResult = await setMappingTradeDefault(merchantId, wechatGroup, 'wechat');
    log('微信默认通道号设置完成');
    log('开始设置支付宝默认通道号');
    const alipayDefaultResult = await setMappingTradeDefault(merchantId, alipayGroup, 'alipay');
    log('支付宝默认通道号设置完成');

    log('开始开通在线收款单权限');
    const authorityResult = await openOnlineReceiptAuthority(merchantId);
    log('在线收款单权限开通完成');

    log(`开始增加微信通道号 ${wechatGroup.subMchId}`);
    const wechatReportResult = await reportOnlineReceiptChannel(merchantId, wechatGroup.subMchId);
    log('微信通道号增加完成');
    log(`开始增加支付宝通道号 ${alipayGroup.subMchId}`);
    const alipayReportResult = await reportOnlineReceiptChannel(merchantId, alipayGroup.subMchId);
    log('支付宝通道号增加完成');

    log('查询微信/支付宝在线收款单经营地址记录');
    const [wechatAddressRecord, alipayAddressRecord] = await Promise.all([
      pollOnlineReceiptAddressRecord(merchantId, 1, wechatGroup.subMchId, options),
      pollOnlineReceiptAddressRecord(merchantId, 2, alipayGroup.subMchId, options),
    ]);
    log(`查询到微信经营地址记录 id: ${wechatAddressRecord.id}`);
    log(`查询到支付宝经营地址记录 id: ${alipayAddressRecord.id}`);
    const wechatAddressResult = await setOnlineReceiptBusinessAddress(wechatAddressRecord.id);
    log('微信经营地址设置完成');
    const alipayAddressResult = await setOnlineReceiptBusinessAddress(alipayAddressRecord.id);
    log('支付宝经营地址设置完成');
    log(`商户 ${merchantId} 在线收款单开通完成`);

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
      alipayAddressResult,
    };
  }

  function getOptionValue(options, key, defaultValue) {
    return Object.prototype.hasOwnProperty.call(options, key) ? String(options[key] == null ? '' : options[key]) : defaultValue;
  }

  function resolveWechatChannelOptions(options = {}) {
    const channelId = normalizeText(options.channelId);
    const channelName = normalizeText(options.channelName);
    if (Boolean(channelId) !== Boolean(channelName)) {
      throw new Error('微信渠道号与渠道号主体必须同时填写');
    }
    return {
      channelId: channelId || DEFAULT_WECHAT_CHANNEL_ID,
      channelName: channelName || DEFAULT_WECHAT_CHANNEL_NAME,
    };
  }

  function resolveAlipayChannelOptions(options = {}) {
    const sourcePid = normalizeText(options.sourcePid);
    const sourceName = normalizeText(options.sourceName);
    if (Boolean(sourcePid) !== Boolean(sourceName)) {
      throw new Error('支付宝渠道号与渠道号主体必须同时填写');
    }
    return {
      sourcePid: sourcePid || DEFAULT_ALIPAY_CHANNEL_ID,
      sourceName: sourceName || DEFAULT_ALIPAY_CHANNEL_NAME,
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
    return new Date(text.replace(/\.0$/, '').replace(' ', 'T')).getTime() || 0;
  }

  async function submitWechatReport(merchantId, options = {}) {
    assertMerchantId(merchantId);
    const channel = resolveWechatChannelOptions(options);
    const params = new URLSearchParams({
      method: 'posreport',
      merchantId,
      channelId: channel.channelId,
      channelName: channel.channelName,
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
      throw new Error(`收银通微信上报失败: ${data.respMsg || JSON.stringify(data)}`);
    }
    assertReportBusinessSuccess(data, '收银通微信');
    const wxMchId = normalizeText(getReportDataObject(data).wxMchId || data.wxMchId || data.data);
    if (!/^\d+$/.test(wxMchId)) {
      throw new Error(`微信上报接口未返回微信子商户号: ${JSON.stringify(data)}`);
    }
    return {
      ...data,
      rawData: data.data,
      data: wxMchId,
      wxMchId,
    };
  }

  const reportMerchant = submitWechatReport;
  const submitSytWechatReport = submitWechatReport;

  async function submitAlipayReport(merchantId, options = {}) {
    assertMerchantId(merchantId);
    const channel = resolveAlipayChannelOptions(options);
    const params = new URLSearchParams({
      method: 'posreport',
      merchantId,
      sourcePid: channel.sourcePid,
      sourceName: channel.sourceName,
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
      throw new Error(`收银通支付宝上报失败: ${data.respMsg || JSON.stringify(data)}`);
    }
    assertReportBusinessSuccess(data, '收银通支付宝');
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

  const submitSytAlipayReport = submitAlipayReport;

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

  async function queryWxSubmchConfigRows(merchantId, wxSubMchId, options = {}) {
    assertMerchantId(merchantId);
    if (!/^\d+$/.test(String(wxSubMchId || ''))) {
      throw new Error('微信子商户号不能为空，且必须为数字');
    }
    const range = getAroundDateRange({ beforeDays: 1, afterDays: 1 });
    const body = buildFormBody({
      fCreateTimeStart: options.fCreateTimeStart || range.createStartTime,
      fCreateTimeEnd: options.fCreateTimeEnd || range.createEndTime,
      fChannelType: '',
      fPayType: '',
      fStatus: '',
      fCanTrade: '',
      fUpdateTimeStart: '',
      fUpdateTimeEnd: '',
      fChannelId: '',
      fWxSubMchId: wxSubMchId,
      fAgentId1g: '',
      fMerchantId: merchantId,
      fAuthorizeState: '',
      fInUse: '',
      syncPlatform: '',
      page: '1',
      rows: options.rows || '15',
    });
    const data = await requestJson(`${SAAS}/wxsubmch.do?method=list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: ORIGIN,
        Referer: `${SAAS}/wxsubmch.do?method=page`,
      },
      body,
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
      throw new Error(`未查询到微信子商户号 ${wxSubMchId} 对应的配置记录 id`);
    }
    const id = String(row.fId);
    if (options.onConfigRow) options.onConfigRow(row);

    const body = buildFormBody({
      subAppids: getOptionValue(options, 'subAppids', ''),
      jsapiPaths: getOptionValue(options, 'jsapiPaths', ''),
      id,
      isSubmitted: '1',
    });
    const html = await requestText(`${SAAS}/wxsubmch.do?method=configReport`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: ORIGIN,
        Referer: `${SAAS}/wxsubmch.do?method=getByReportConfigId&reportConfigId=0&id=${encodeURIComponent(id)}`,
      },
      body,
    });
    const text = summarizeHtml(html);
    if (/没有该项操作权限|失败|错误|异常/.test(text)) {
      throw new Error(`微信支付参数绑定失败: ${text}`);
    }
    return {
      ok: true,
      id,
      row,
      message: text,
      html,
    };
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
    const confirmIntervalMs = options.wechatConfirmIntervalMs == null ? 1500 : options.wechatConfirmIntervalMs;
    const timeoutMs = options.pollTimeoutMs == null ? 30000 : options.pollTimeoutMs;
    const startedAt = Date.now();
    const snapshots = [];

    await sleep(firstDelayMs);
    while (Date.now() - startedAt <= timeoutMs) {
      const snapshot = await queryWechatUnnotifiedOnce(merchantId, wxSubMchId, options);
      snapshots.push(snapshot);
      if (snapshots.length > 3) snapshots.shift();

      const channelKeys = snapshots.map((item) => getRowChannelKey(item.unnotifiedRows));
      if (
          snapshots.length === 3
          && channelKeys[0]
          && channelKeys.every((channelKey) => channelKey === channelKeys[0])
      ) {
        const lastSnapshot = snapshots[snapshots.length - 1];
        return {
          rows: lastSnapshot.rows,
          unnotifiedRows: lastSnapshot.unnotifiedRows,
        };
      }
      await sleep(confirmIntervalMs);
    }

    const channelKeys = snapshots.map((snapshot) => getRowChannelKey(snapshot.unnotifiedRows));
    throw new Error(`微信子商户号 ${wxSubMchId} 的未通知通道未在超时时间内稳定: ${channelKeys.join(' -> ') || '无'}`);
  }

  async function enableNewWechatMappings(merchantId, wxSubMchId, options = {}) {
    const { rows, unnotifiedRows } = await pollWechatNewMappings(merchantId, wxSubMchId, options);
    const groups = groupRowsForTradeStatus(unnotifiedRows, '1', 'wxSubMchId');
    if (groups.length === 0) {
      throw new Error(`未找到微信子商户号 ${wxSubMchId} 可启用的通道`);
    }
    const changedGroups = await setWechatStatusGroups(merchantId, groups, options);
    return {
      rows,
      unnotifiedRows,
      groups,
      changedGroups,
    };
  }

  async function pollWechatEnabledMappings(merchantId, wxSubMchId, options = {}) {
    assertMerchantId(merchantId);
    const firstDelayMs = options.wechatFirstQueryDelayMs == null ? 3000 : options.wechatFirstQueryDelayMs;
    const intervalMs = options.wechatConfirmIntervalMs == null ? 2000 : options.wechatConfirmIntervalMs;
    const maxRetries = options.wechatConfirmRetries == null ? 3 : options.wechatConfirmRetries;

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
    return pollWechatEnabledMappings(merchantId, wxSubMchId, options);
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

    let report;
    let newWxSubMchId;
    try {
      const channel = resolveWechatChannelOptions(options);
      log(`开始微信上报商户 ${merchantId}`);
      log('微信上报按钮: 收银通上报');
      log(`微信上报渠道: ${channel.channelId} ${channel.channelName}`);
      report = await submitWechatReport(merchantId, options);
      newWxSubMchId = String(report.data);
      log(`上报任务已提交，返回微信子商户号: ${newWxSubMchId}`);
      notifyReportedSubMchId(options, 'wechat', newWxSubMchId);
      notifyProgress(options, 'wechat', 'report', 'success');
    } catch (error) {
      notifyProgress(options, 'wechat', 'report', 'error');
      throw error;
    }

    const enableResult = null;
    let confirmResult;
    try {
      log('等待 3 秒后查询新微信子商户号启用状态，没有查到则每隔 2 秒重试，最多重试 3 次');
      confirmResult = await confirmNewWechatMappings(merchantId, newWxSubMchId, options);
      log(`新微信子商户号已启用，查询到 ${confirmResult.enabledRows.length} 条启用记录`);
      notifyProgress(options, 'wechat', 'enable', 'success');
    } catch (error) {
      notifyProgress(options, 'wechat', 'enable', 'error');
      throw error;
    }

    let disableResult;
    try {
      log('查询 5 年内旧启用微信子商户号并禁用');
      disableResult = await disableOldEnabledWechatMappings(merchantId, newWxSubMchId, {
        ...options,
        onGroup: (group) => {
          const paramsText = Object.entries(group.statusParams)
              .map(([key, value]) => `${key}=${value}`)
              .join('&');
          log(`禁用旧微信子商户号 ${group.wxSubMchId}: ${paramsText}`);
        },
      });
      log(`旧微信子商户号禁用完成，处理 ${disableResult.changedGroups.length} 个分组`);
      notifyProgress(options, 'wechat', 'disable', 'success');
    } catch (error) {
      notifyProgress(options, 'wechat', 'disable', 'error');
      throw error;
    }

    let paymentConfigResult = null;
    if (hasWechatPaymentConfigOptions(options)) {
      log('检测到微信支付参数，开始绑定 appid / 支付授权目录');
      try {
        paymentConfigResult = await bindWechatPaymentConfig(merchantId, newWxSubMchId, {
          ...options,
          onConfigRow: (row) => log(`查询到微信配置记录 id: ${row.fId}`),
        });
        log('微信支付参数绑定完成');
      } catch (error) {
        const errorMessage = `微信支付参数绑定失败: ${error.message}`;
        paymentConfigResult = {
          ok: false,
          error: error.message,
        };
        logs.push(`[${formatDateTime(new Date())}] ${errorMessage}`);
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

    let report;
    let newZfbSubMchId;
    try {
      const channel = resolveAlipayChannelOptions(options);
      log(`开始支付宝上报商户 ${merchantId}`);
      log('支付宝上报按钮: 收银通上报');
      log(`支付宝上报渠道: ${channel.sourcePid} ${channel.sourceName}`);
      report = await submitAlipayReport(merchantId, options);
      newZfbSubMchId = String(report.data);
      log(`支付宝上报任务已提交，返回支付宝子商户号: ${newZfbSubMchId}`);
      notifyReportedSubMchId(options, 'alipay', newZfbSubMchId);
      notifyProgress(options, 'alipay', 'report', 'success');
    } catch (error) {
      notifyProgress(options, 'alipay', 'report', 'error');
      throw error;
    }

    let confirmResult;
    try {
      log('等待 1 秒后轮询新支付宝子商户号映射记录');
      confirmResult = await confirmNewAlipayMappings(merchantId, newZfbSubMchId, options);
      log(`新支付宝子商户号已启用，查询到 ${confirmResult.enabledRows.length} 条启用记录`);
      notifyProgress(options, 'alipay', 'enable', 'success');
    } catch (error) {
      notifyProgress(options, 'alipay', 'enable', 'error');
      throw error;
    }

    let disableResult;
    try {
      log('查询 5 年内旧启用支付宝子商户号并禁用');
      disableResult = await disableOldEnabledAlipayMappings(merchantId, newZfbSubMchId, {
        ...options,
        onGroup: (group) => {
          const paramsText = Object.entries(group.statusParams)
              .map(([key, value]) => `${key}=${value}`)
              .join('&');
          log(`禁用旧支付宝子商户号 ${group.zfbSubMchId || group.subMchId}: ${paramsText}`);
        },
      });
      log(`旧支付宝子商户号禁用完成，处理 ${disableResult.changedGroups.length} 个分组`);
      notifyProgress(options, 'alipay', 'disable', 'success');
    } catch (error) {
      notifyProgress(options, 'alipay', 'disable', 'error');
      throw error;
    }

    if (hasWechatPaymentConfigOptions(options)) {
      log('检测到微信支付参数，但本次未产生新微信子商户号，跳过微信支付参数绑定');
    }

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
    const onLog = (message, isError) => {
      logs.push(`[${formatDateTime(new Date())}] ${message}`);
      if (options.onLog) options.onLog(message, isError === true);
    };
    const [wechatState, alipayState] = await Promise.allSettled([
      wechatAutoReport(merchantId, { ...options, onLog }),
      alipayAutoReport(merchantId, { ...options, onLog }),
    ]);
    const failures = [wechatState, alipayState]
        .filter((state) => state.status === 'rejected')
        .map((state) => state.reason?.message || String(state.reason));
    if (failures.length > 0) {
      throw new Error(`全部重置存在失败流程: ${failures.join('; ')}`);
    }
    const wechatResult = wechatState.value;
    const alipayResult = alipayState.value;
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
          <div class="merchant-row">
            <input id="om-auto-report-merchant" type="text" inputmode="numeric" placeholder="乐刷商户号">
            <button id="om-auto-report-merchant-clear" type="button">清空</button>
          </div>
          <div class="optional-title-row">
            <div class="optional-title">可选参数</div>
            <select id="syt-preset-select" class="preset-select" title="选择预设配置">
              <option value="none">无</option>
              <option value="custom">自定义</option>
              ${WECHAT_PAYMENT_PRESETS.map((preset, index) => `
                <option value="preset-${index}">${preset.name}</option>
              `).join('')}
            </select>
          </div>
          <div id="syt-optional-content" class="optional-content">
            <div class="optional-title">微信上报渠道号</div>
            <div class="optional-row">
              <input id="syt-wx-channel-id" type="text" placeholder="渠道号">
              <input id="syt-wx-channel-name" type="text" placeholder="渠道号主体">
            </div>
            <div class="optional-title">支付宝上报渠道号</div>
            <div class="optional-row">
              <input id="syt-alipay-channel-id" type="text" placeholder="渠道号">
              <input id="syt-alipay-channel-name" type="text" placeholder="渠道号主体">
            </div>
            <div class="optional-title">微信支付参数</div>
            <div class="optional-field">
              <label for="syt-appid">appid</label>
              <input id="syt-appid" type="text" placeholder="appid">
            </div>
            <div class="optional-field">
              <label for="syt-pay-auth-dir">支付授权目录</label>
              <input id="syt-pay-auth-dir" type="text" placeholder="支付授权目录">
            </div>
          </div>
          <div class="actions">
            <button id="om-auto-report-wechat" type="button">微信重置子商户号</button>
            <button id="om-auto-report-alipay" type="button">支付宝重置子商户号</button>
            <button id="om-auto-report-all" type="button">全部重置子商户号</button>
            <button id="syt-configure-merchant-key" type="button">配置商户 key</button>
            <button id="syt-enable-online-receipt" type="button">开通在线收款单</button>
          </div>
          <div class="result-label">新上报微信子商户号</div>
          <div class="result-row">
            <input id="om-auto-report-result" type="text" readonly placeholder="执行成功后显示">
            <div id="om-auto-report-wechat-progress" class="result-progress" aria-label="微信重置进度">
              <span class="progress-step" data-step="report">上报</span>
              <span class="progress-step" data-step="enable">启用子商户号</span>
              <span class="progress-step" data-step="disable">禁用旧子商户号</span>
            </div>
          </div>
          <div class="result-label">新上报支付宝子商户号</div>
          <div class="result-row">
            <input id="om-auto-report-alipay-result" type="text" readonly placeholder="执行成功后显示">
            <div id="om-auto-report-alipay-progress" class="result-progress" aria-label="支付宝重置进度">
              <span class="progress-step" data-step="report">上报</span>
              <span class="progress-step" data-step="enable">启用子商户号</span>
              <span class="progress-step" data-step="disable">禁用旧子商户号</span>
            </div>
          </div>
          <div class="copy-actions">
            <button id="om-auto-report-log-toggle" type="button">展开日志</button>
            <button id="om-auto-report-copy" type="button" disabled>复制</button>
          </div>
          <div id="om-auto-report-log-section" class="log-section">
            <pre id="om-auto-report-log"></pre>
            <div class="log-actions">
              <button id="om-auto-report-clear" type="button">清空日志</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    const floatBall = panel.querySelector('.float-ball');
    const input = panel.querySelector('#om-auto-report-merchant');
    const merchantClearButton = panel.querySelector('#om-auto-report-merchant-clear');
    const wxChannelIdInput = panel.querySelector('#syt-wx-channel-id');
    const wxChannelNameInput = panel.querySelector('#syt-wx-channel-name');
    const alipayChannelIdInput = panel.querySelector('#syt-alipay-channel-id');
    const alipayChannelNameInput = panel.querySelector('#syt-alipay-channel-name');
    const appidInput = panel.querySelector('#syt-appid');
    const payAuthDirInput = panel.querySelector('#syt-pay-auth-dir');
    const logBox = panel.querySelector('#om-auto-report-log');
    const wechatButton = panel.querySelector('#om-auto-report-wechat');
    const alipayButton = panel.querySelector('#om-auto-report-alipay');
    const allButton = panel.querySelector('#om-auto-report-all');
    const configureMerchantKeyButton = panel.querySelector('#syt-configure-merchant-key');
    const enableOnlineReceiptButton = panel.querySelector('#syt-enable-online-receipt');
    const clearButton = panel.querySelector('#om-auto-report-clear');
    const resultInput = panel.querySelector('#om-auto-report-result');
    const copyButton = panel.querySelector('#om-auto-report-copy');
    const alipayResultInput = panel.querySelector('#om-auto-report-alipay-result');
    const closeButton = panel.querySelector('.close');
    const presetSelect = panel.querySelector('#syt-preset-select');
    const optionalContent = panel.querySelector('#syt-optional-content');
    const logToggleButton = panel.querySelector('#om-auto-report-log-toggle');
    const logSection = panel.querySelector('#om-auto-report-log-section');
    const wechatProgress = panel.querySelector('#om-auto-report-wechat-progress');
    const alipayProgress = panel.querySelector('#om-auto-report-alipay-progress');

    const pageMerchantInput = document.querySelector('input[name="merchantId"], #merchantId');
    if (pageMerchantInput && pageMerchantInput.value) input.value = pageMerchantInput.value.trim();

    const retryContexts = {
      wechat: null,
      alipay: null,
    };
    let busy = false;

    const appendLog = (line, isError = false) => {
      const time = formatDateTime(new Date());
      const row = document.createElement('div');
      row.className = isError === true ? 'log-line error' : 'log-line';
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
      merchantClearButton.disabled = busy;
      refreshProgressRetryability('wechat');
      refreshProgressRetryability('alipay');
    };
    const getReportOptions = () => {
      return {
        channelId: wxChannelIdInput.value.trim(),
        channelName: wxChannelNameInput.value.trim(),
        sourcePid: alipayChannelIdInput.value.trim(),
        sourceName: alipayChannelNameInput.value.trim(),
        subAppids: appidInput.value.trim(),
        jsapiPaths: payAuthDirInput.value.trim(),
      };
    };
    const getCopyText = () => {
      const wechatValue = resultInput.value.trim();
      const alipayValue = alipayResultInput.value.trim();
      if (!wechatValue && !alipayValue) return '';
      return [
        `乐刷商户号：${input.value.trim()}`,
        wechatValue ? `微信子商户号：${wechatValue}` : '',
        alipayValue ? `支付宝子商户号：${alipayValue}` : '',
        '温馨提示：重置子商户号，代理记得自行检查商户费率，2个工作日内反馈，请知悉！',
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
    const getProgressContainer = (type) => type === 'alipay' ? alipayProgress : wechatProgress;
    const getTypeName = (type) => type === 'alipay' ? '支付宝' : '微信';
    const getResultInput = (type) => type === 'alipay' ? alipayResultInput : resultInput;
    const createRetryContext = (type, merchantId, newSubMchId, reportOptions) => {
      retryContexts[type] = {
        type,
        merchantId,
        newSubMchId,
        reportOptions: { ...reportOptions },
        completedSteps: {
          report: true,
          enable: false,
          disable: false,
        },
        failedStep: null,
      };
      refreshProgressRetryability(type);
    };
    const updateRetryContext = (type, step, status) => {
      const context = retryContexts[type];
      if (!context) return;
      if (status === 'success') {
        context.completedSteps[step] = true;
        if (context.failedStep === step) context.failedStep = null;
      } else if (status === 'error') {
        context.completedSteps[step] = false;
        context.failedStep = step;
      }
    };
    const canRetryProgressStep = (type, step) => {
      const context = retryContexts[type];
      if (busy || !context || (step !== 'enable' && step !== 'disable')) return false;
      if (step === 'enable') return context.completedSteps.report && context.failedStep === 'enable';
      return context.completedSteps.enable && context.failedStep === 'disable';
    };
    const refreshProgressRetryability = (type) => {
      getProgressContainer(type).querySelectorAll('.progress-step').forEach((stepElement) => {
        const step = stepElement.dataset.step;
        const retryable = stepElement.classList.contains('error') && canRetryProgressStep(type, step);
        stepElement.classList.toggle('retryable', retryable);
        if (retryable) {
          stepElement.title = '点击重试此步骤';
        } else if (step === 'report' && stepElement.classList.contains('error')) {
          stepElement.title = '上报失败，请重新执行完整重置';
        } else {
          stepElement.removeAttribute('title');
        }
      });
    };
    const setProgressStep = (type, step, status) => {
      const target = getProgressContainer(type).querySelector(`[data-step="${step}"]`);
      if (!target) return;
      target.classList.remove('success', 'error', 'running', 'retryable');
      if (status === 'success' || status === 'error' || status === 'running') target.classList.add(status);
      updateRetryContext(type, step, status);
      refreshProgressRetryability(type);
    };
    const resetProgress = (type) => {
      getProgressContainer(type).querySelectorAll('.progress-step').forEach((step) => {
        step.classList.remove('success', 'error', 'running', 'retryable');
        step.removeAttribute('title');
      });
    };
    const resetTaskState = () => {
      retryContexts.wechat = null;
      retryContexts.alipay = null;
      resetResultOutputs();
      resetProgress('wechat');
      resetProgress('alipay');
    };
    const markFirstPendingProgressError = (type) => {
      const target = Array.from(getProgressContainer(type).querySelectorAll('.progress-step')).find((step) => {
        return !step.classList.contains('success') && !step.classList.contains('error');
      });
      if (target) setProgressStep(type, target.dataset.step, 'error');
    };
    const setReportedSubMchId = (type, merchantId, subMchId, reportOptions) => {
      const targetInput = getResultInput(type);
      targetInput.value = subMchId;
      refreshCopyButton();
      createRetryContext(type, merchantId, subMchId, reportOptions);
      appendLog(`新上报${getTypeName(type)}子商户号已写入输出框: ${subMchId}`);
    };
    const clearOptionalInputs = () => {
      wxChannelIdInput.value = '';
      wxChannelNameInput.value = '';
      alipayChannelIdInput.value = '';
      alipayChannelNameInput.value = '';
      appidInput.value = '';
      payAuthDirInput.value = '';
    };
    const setOptionalContentOpen = (open) => {
      optionalContent.classList.toggle('open', open);
    };
    const setLogSectionOpen = (open) => {
      logSection.classList.toggle('open', open);
      logToggleButton.textContent = open ? '收起日志' : '展开日志';
    };
    const applyWechatPaymentPreset = (preset) => {
      wxChannelIdInput.value = preset.channelId;
      wxChannelNameInput.value = preset.channelName;
      appidInput.value = preset.subAppids;
      payAuthDirInput.value = preset.jsapiPaths;
      appendLog(`已选择预设配置: ${preset.name}`);
    };
    const buildFlowOptions = (type, merchantId, reportOptions) => {
      return {
        ...reportOptions,
        onLog: appendLog,
        onProgress: setProgressStep,
        onReportedSubMchId: (reportedType, subMchId) => {
          setReportedSubMchId(reportedType, merchantId, subMchId, reportOptions);
        },
      };
    };
    const retryDisableOldMappings = async (context) => {
      const typeName = getTypeName(context.type);
      setProgressStep(context.type, 'disable', 'running');
      appendLog(`开始重试禁用旧${typeName}子商户号`);
      try {
        if (context.type === 'wechat') {
          const result = await disableOldEnabledWechatMappings(context.merchantId, context.newSubMchId, {
            ...context.reportOptions,
            onGroup: (group) => {
              const paramsText = Object.entries(group.statusParams)
                  .map(([key, value]) => `${key}=${value}`)
                  .join('&');
              appendLog(`重试禁用旧微信子商户号 ${group.wxSubMchId}: ${paramsText}`);
            },
          });
          appendLog(`禁用旧微信子商户号重试成功，处理 ${result.changedGroups.length} 个分组`);
        } else {
          const result = await disableOldEnabledAlipayMappings(context.merchantId, context.newSubMchId, {
            ...context.reportOptions,
            onGroup: (group) => {
              const paramsText = Object.entries(group.statusParams)
                  .map(([key, value]) => `${key}=${value}`)
                  .join('&');
              appendLog(`重试禁用旧支付宝子商户号 ${group.zfbSubMchId || group.subMchId}: ${paramsText}`);
            },
          });
          appendLog(`禁用旧支付宝子商户号重试成功，处理 ${result.changedGroups.length} 个分组`);
        }
        setProgressStep(context.type, 'disable', 'success');
      } catch (error) {
        setProgressStep(context.type, 'disable', 'error');
        throw new Error(`禁用旧${typeName}子商户号重试失败: ${error.message}`);
      }
    };
    const retryEnableAndContinue = async (context) => {
      const typeName = getTypeName(context.type);
      setProgressStep(context.type, 'enable', 'running');
      appendLog(`开始重试启用${typeName}子商户号 ${context.newSubMchId}`);
      try {
        if (context.type === 'wechat') {
          await confirmNewWechatMappings(context.merchantId, context.newSubMchId, context.reportOptions);
          appendLog('微信子商户号启用状态确认重试成功');
        } else {
          await confirmNewAlipayMappings(context.merchantId, context.newSubMchId, context.reportOptions);
          appendLog('支付宝子商户号启用状态确认重试成功');
        }
        setProgressStep(context.type, 'enable', 'success');
      } catch (error) {
        setProgressStep(context.type, 'enable', 'error');
        throw new Error(`启用${typeName}子商户号重试失败: ${error.message}`);
      }

      appendLog(`继续查询并禁用旧${typeName}子商户号`);
      await retryDisableOldMappings(context);
      appendLog('重试流程已完成，本次未执行 appid / 支付授权目录绑定');
    };
    const retryProgressStep = async (type, step) => {
      const context = retryContexts[type];
      if (!context || !canRetryProgressStep(type, step)) return;
      const typeName = getTypeName(type);
      const message = step === 'enable'
        ? `确认重试启用${typeName}子商户号并继续禁用旧号？`
        : `确认重试禁用旧${typeName}子商户号？`;
      if (!window.confirm(message)) return;

      setBusy(true);
      try {
        if (step === 'enable') {
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

    wechatButton.addEventListener('click', async () => {
      setBusy(true);
      logBox.innerHTML = '';
      resetTaskState();
      try {
        const merchantId = input.value.trim();
        const reportOptions = getReportOptions();
        const result = await autoReport(merchantId, buildFlowOptions('wechat', merchantId, reportOptions));
        console.log('omAutoReport result:', result);
      } catch (error) {
        if (!wechatProgress.querySelector('.progress-step.error')) markFirstPendingProgressError('wechat');
        appendLog(`失败: ${error.message}`, true);
        console.error(error);
      } finally {
        setBusy(false);
      }
    });

    alipayButton.addEventListener('click', async () => {
      setBusy(true);
      logBox.innerHTML = '';
      resetTaskState();
      try {
        const merchantId = input.value.trim();
        const reportOptions = getReportOptions();
        const result = await alipayAutoReport(merchantId, buildFlowOptions('alipay', merchantId, reportOptions));
        console.log('omAutoReport alipay result:', result);
      } catch (error) {
        if (!alipayProgress.querySelector('.progress-step.error')) markFirstPendingProgressError('alipay');
        appendLog(`失败: ${error.message}`, true);
        console.error(error);
      } finally {
        setBusy(false);
      }
    });

    allButton.addEventListener('click', async () => {
      setBusy(true);
      logBox.innerHTML = '';
      resetTaskState();
      try {
        const merchantId = input.value.trim();
        const reportOptions = getReportOptions();
        const runFlow = async (type, runner) => {
          try {
            return await runner(merchantId, buildFlowOptions(type, merchantId, reportOptions));
          } catch (error) {
            const progress = getProgressContainer(type);
            if (!progress.querySelector('.progress-step.error')) markFirstPendingProgressError(type);
            appendLog(`${getTypeName(type)}重置失败: ${error.message}`, true);
            throw error;
          }
        };
        const results = await Promise.allSettled([
          runFlow('wechat', wechatAutoReport),
          runFlow('alipay', alipayAutoReport),
        ]);
        console.log('omAutoReport all result:', results);
      } finally {
        setBusy(false);
      }
    });

    configureMerchantKeyButton.addEventListener('click', async () => {
      setBusy(true);
      try {
        const merchantId = input.value.trim();
        appendLog(`开始为商户 ${merchantId || '(未填写)'} 配置商户 key`);
        const result = await configureMerchantKey(merchantId);
        appendLog(`商户 ${merchantId} 配置商户 key 成功`);
        console.log('sytAutoReport configureMerchantKey result:', result);
      } catch (error) {
        appendLog(`配置商户 key 失败: ${error.message}`, true);
        console.error(error);
      } finally {
        setBusy(false);
      }
    });

    enableOnlineReceiptButton.addEventListener('click', async () => {
      setBusy(true);
      try {
        const merchantId = input.value.trim();
        const result = await enableOnlineReceipt(merchantId, { onLog: appendLog });
        console.log('sytAutoReport enableOnlineReceipt result:', result);
      } catch (error) {
        appendLog(`开通在线收款单失败: ${error.message}`, true);
        console.error(error);
      } finally {
        setBusy(false);
      }
    });

    clearButton.addEventListener('click', () => {
      logBox.innerHTML = '';
    });
    merchantClearButton.addEventListener('click', () => {
      input.value = '';
      logBox.innerHTML = '';
      resetTaskState();
      input.focus();
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
    presetSelect.addEventListener('change', () => {
      if (presetSelect.value === 'none') {
        clearOptionalInputs();
        setOptionalContentOpen(false);
        appendLog('已选择预设配置: 无');
        return;
      }
      setOptionalContentOpen(true);
      if (presetSelect.value === 'custom') {
        appendLog('已选择预设配置: 自定义');
        return;
      }
      const presetIndex = Number(presetSelect.value.replace('preset-', ''));
      const preset = WECHAT_PAYMENT_PRESETS[presetIndex];
      if (preset) applyWechatPaymentPreset(preset);
    });
    logToggleButton.addEventListener('click', () => {
      setLogSectionOpen(!logSection.classList.contains('open'));
    });
    wechatProgress.addEventListener('click', (event) => {
      const stepElement = event.target.closest('.progress-step.retryable');
      if (stepElement) retryProgressStep('wechat', stepElement.dataset.step);
    });
    alipayProgress.addEventListener('click', (event) => {
      const stepElement = event.target.closest('.progress-step.retryable');
      if (stepElement) retryProgressStep('alipay', stepElement.dataset.step);
    });
    document.addEventListener('click', (event) => {
      if (!panel.classList.contains('collapsed') && !panel.contains(event.target)) {
        panel.classList.add('collapsed');
      }
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
    submitSytWechatReport,
    submitSytAlipayReport,
    resolveWechatChannelOptions,
    resolveAlipayChannelOptions,
    bindWechatPaymentConfig,
    configureMerchantKey,
    enableOnlineReceipt,
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
