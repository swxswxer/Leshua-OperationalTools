// ==UserScript==
// @name         收银通重置子商户号工具脚本
// @namespace    https://om.leshuazf.com/
// @version      1.0.14
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

  const SCRIPT_VERSION = '1.0.14';
  const ORIGIN = 'https://om.leshuazf.com';
  const SAAS = `${ORIGIN}/saasadmin`;
  const SYT_OMS = `${ORIGIN}/syt_oms`;
  const USER_CENTER = `${ORIGIN}/lsuser_center`;
  const CODE_PLATE_RESULT_SUBJECT = '码牌批量转移处理结果';
  const CODE_PLATE_RESULT_SOURCE = '码牌管理-码牌转移';
  const CODE_PLATE_ACCEPTED_MESSAGE = '后台批量处理中，结果以系统内消息通知';
  const MERCHANT_CHANGE_WHITELIST_FIELDS = [
    { key: 'mobile', dataType: '1', label: '手机号' },
    { key: 'idCard', dataType: '2', label: '身份证号' },
    { key: 'businessLicense', dataType: '3', label: '营业执照号' },
    { key: 'settlementAccount', dataType: '4', label: '结算账号' },
  ];
  const CODE_PLATE_TEMPLATE_BASE64 = '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';
  const CODE_PLATE_SHEET_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:etc="http://www.wps.cn/officeDocument/2017/etCustomData"><sheetPr/><dimension ref="A1:D2"/><sheetViews><sheetView tabSelected="1" workbookViewId="0"><selection activeCell="D9" sqref="D9"/></sheetView></sheetViews><sheetFormatPr defaultColWidth="9" defaultRowHeight="16.8" outlineLevelRow="1" outlineLevelCol="3"/><cols><col min="1" max="2" width="11.7692307692308"/></cols><sheetData><row r="1" spans="1:4"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row><row r="2" spans="1:4"><c r="A2" s="1" t="s"><v>4</v></c><c r="B2" s="1" t="s"><v>4</v></c><c r="C2"><v>5267151</v></c><c r="D2"><v>3287859</v></c></row></sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><headerFooter/></worksheet>';
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
    const { accept, headers, timeoutMs, ...fetchOptions } = options;
    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const controller = timeoutMs && !fetchOptions.signal ? new pageWindow.AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetchImpl(url, {
        credentials: 'include',
        redirect: 'follow',
        ...fetchOptions,
        ...(controller ? { signal: controller.signal } : {}),
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
    } catch (error) {
      if (controller?.signal.aborted) throw new Error(`请求超时（${timeoutMs}ms）: ${url}`);
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
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

  function normalizeMerchantChangeWhitelistValues(values = {}) {
    return MERCHANT_CHANGE_WHITELIST_FIELDS.reduce((result, field) => {
      result[field.key] = String(values[field.key] || '').trim();
      return result;
    }, {});
  }

  function getMerchantChangeWhitelistItems(values = {}) {
    const normalized = normalizeMerchantChangeWhitelistValues(values);
    return MERCHANT_CHANGE_WHITELIST_FIELDS
        .filter((field) => normalized[field.key])
        .map((field) => ({
          ...field,
          dataValue: normalized[field.key],
        }));
  }

  async function addMerchantChangeWhitelistItem(dataType, dataValue, options = {}) {
    const field = MERCHANT_CHANGE_WHITELIST_FIELDS.find((item) => item.dataType === String(dataType));
    if (!field) throw new Error(`不支持的白名单数据类型: ${dataType}`);
    const normalizedValue = String(dataValue || '').trim();
    if (!normalizedValue) throw new Error(`${field.label}不能为空`);

    const response = await requestJson(
      options.endpoint || `${SYT_OMS}/merchantChange/addMerchantChangeWhitelist`,
      {
        method: 'POST',
        body: JSON.stringify({
          dataType: field.dataType,
          dataValue: normalizedValue,
        }),
        timeoutMs: options.timeoutMs == null ? 15000 : options.timeoutMs,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
        },
      },
    );
    if (String(response.error_code) !== '0') {
      throw new Error(response.error_msg || `${field.label}添加失败`);
    }
    return {
      ok: true,
      key: field.key,
      label: field.label,
      dataType: field.dataType,
      response,
    };
  }

  async function addMerchantChangeWhitelist(values, options = {}) {
    const items = getMerchantChangeWhitelistItems(values);
    if (items.length === 0) throw new Error('请至少填写手机号、身份证号、营业执照号或结算账号中的一项');
    const log = (message, isError = false) => {
      if (options.onLog) options.onLog(message, isError);
    };
    const status = (state, message) => {
      if (options.onStatus) options.onStatus(state, message);
    };

    status('submitting', `正在并发提交 ${items.length} 项白名单`);
    log(`开始添加防切户白名单: ${items.map((item) => item.label).join('、')}`);
    const settled = await Promise.allSettled(items.map(async (item) => {
      try {
        const result = await addMerchantChangeWhitelistItem(item.dataType, item.dataValue, options);
        log(`${item.label}防切户白名单添加成功`);
        return result;
      } catch (error) {
        log(`${item.label}防切户白名单添加失败: ${error.message}`, true);
        throw Object.assign(new Error(error.message), {
          key: item.key,
          label: item.label,
          dataType: item.dataType,
        });
      }
    }));
    const successes = [];
    const failures = [];
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successes.push(result.value);
      } else {
        failures.push({
          key: items[index].key,
          label: items[index].label,
          dataType: items[index].dataType,
          message: result.reason?.message || String(result.reason),
        });
      }
    });
    const summary = {
      ok: failures.length === 0,
      total: items.length,
      successes,
      failures,
    };
    if (failures.length > 0) {
      const failureText = failures.map((item) => `${item.label}: ${item.message}`).join('；');
      const successText = successes.length > 0
        ? `；已成功: ${successes.map((item) => item.label).join('、')}`
        : '';
      const message = `防切户白名单添加存在失败项：${failureText}${successText}`;
      status('failure', message);
      const error = new Error(message);
      error.result = summary;
      throw error;
    }
    const message = `防切户白名单添加完成：${successes.map((item) => item.label).join('、')}`;
    status('success', message);
    log(message);
    return summary;
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

  function shouldDisableOldSubMch(options = {}) {
    return options.disableOldSubMch !== false;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizeCodePlateTransferValues(values = {}) {
    return {
      startCode: String(values.startCode || '').trim(),
      endCode: String(values.endCode || '').trim(),
      sourceAgent: String(values.sourceAgent || '').trim(),
      targetAgent: String(values.targetAgent || '').trim(),
    };
  }

  function assertCodePlateTransferValues(values) {
    const normalized = normalizeCodePlateTransferValues(values);
    if (!normalized.startCode || !normalized.endCode || !normalized.sourceAgent || !normalized.targetAgent) {
      throw new Error('请完整填写四项划转信息');
    }
    if (!/^[A-Za-z0-9]+$/.test(normalized.startCode) || !/^[A-Za-z0-9]+$/.test(normalized.endCode)) {
      throw new Error('码牌开始编号和结束编号只能填写英文字母或数字');
    }
    if (normalized.startCode.length !== normalized.endCode.length) {
      throw new Error('码牌开始编号和结束编号长度必须一致');
    }
    if (/^\d+$/.test(normalized.startCode)
      && /^\d+$/.test(normalized.endCode)
      && BigInt(normalized.startCode) > BigInt(normalized.endCode)) {
      throw new Error('码牌开始编号不能大于结束编号');
    }
    if (!/^\d+$/.test(normalized.sourceAgent) || !/^\d+$/.test(normalized.targetAgent)) {
      throw new Error('原代理商和新代理商只能填写数字');
    }
    if (!Number.isSafeInteger(Number(normalized.sourceAgent)) || !Number.isSafeInteger(Number(normalized.targetAgent))) {
      throw new Error('代理商编号超出 Excel 可安全处理的数字范围');
    }
    if (normalized.sourceAgent === normalized.targetAgent) {
      throw new Error('原代理商和新代理商不能相同');
    }
    return normalized;
  }

  function replaceTemplateCell(sheetXml, cellRef, replacement) {
    const pattern = new RegExp(`<c\\s+[^>]*r=["']${cellRef}["'][^>]*>[\\s\\S]*?<\\/c>`);
    if (!pattern.test(sheetXml)) throw new Error(`官方模板缺少单元格 ${cellRef}`);
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
        value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
      }
      table[index] = value >>> 0;
    }
    return table;
  })();

  function calculateCrc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let index = 0; index < bytes.length; index += 1) {
      crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
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
      if (view.getUint32(offset, true) === 0x06054B50) return offset;
    }
    throw new Error('内嵌官方 Excel 模板缺少 ZIP 结束记录');
  }

  function parseTemplateZip(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const endOffset = findZipEndRecord(bytes, view);
    const entryCount = view.getUint16(endOffset + 10, true);
    const centralOffset = view.getUint32(endOffset + 16, true);
    const commentLength = view.getUint16(endOffset + 20, true);
    const comment = bytes.slice(endOffset + 22, endOffset + 22 + commentLength);
    const decoder = new TextDecoder('utf-8');
    const entries = [];
    let offset = centralOffset;

    for (let index = 0; index < entryCount; index += 1) {
      if (view.getUint32(offset, true) !== 0x02014B50) throw new Error('内嵌官方 Excel 模板中央目录损坏');
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const entryCommentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      if (view.getUint32(localOffset, true) !== 0x04034B50) throw new Error('内嵌官方 Excel 模板文件记录损坏');
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
        flags: view.getUint16(offset + 8, true) & ~0x08,
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
        data: bytes.slice(dataOffset, dataOffset + compressedSize),
      });
      offset += 46 + nameLength + extraLength + entryCommentLength;
    }
    return { entries, comment };
  }

  function createZipLocalRecord(entry) {
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034B50, true);
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
    view.setUint32(0, 0x02014B50, true);
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
    endView.setUint32(0, 0x06054B50, true);
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
      '<si><t>码牌开始编号</t></si>',
      '<si><t>码牌结束编号</t></si>',
      '<si><t>原代理商</t></si>',
      '<si><t>新代理商</t></si>',
      `<si><t>${normalized.startCode}</t></si>`,
      endCodeIndex === 5 ? `<si><t>${normalized.endCode}</t></si>` : '',
      '</sst>',
    ].join('');

    let sheetXml = CODE_PLATE_SHEET_XML;
    sheetXml = replaceTemplateCell(sheetXml, 'A2', '<c r="A2" s="1" t="s"><v>4</v></c>');
    sheetXml = replaceTemplateCell(sheetXml, 'B2', `<c r="B2" s="1" t="s"><v>${endCodeIndex}</v></c>`);
    sheetXml = replaceTemplateCell(sheetXml, 'C2', `<c r="C2"><v>${normalized.sourceAgent}</v></c>`);
    sheetXml = replaceTemplateCell(sheetXml, 'D2', `<c r="D2"><v>${normalized.targetAgent}</v></c>`);
    const bytes = rebuildTemplateZip(new Map([
      ['xl/sharedStrings.xml', sharedStrings],
      ['xl/worksheets/sheet1.xml', sheetXml],
    ]));
    return new File([bytes], '批量转移模板.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  function parseCodePlateMessageRows(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const table = doc.querySelector('table.tablesorter');
    if (!table) {
      const htmlError = detectHtmlError(html);
      if (htmlError) throw new Error(htmlError);
      throw new Error(`无法解析消息中心响应: ${summarizeHtml(html)}`);
    }
    const headers = Array.from(table.querySelectorAll('thead th')).map((cell) => normalizeText(cell.textContent));
    const getIndex = (name) => headers.indexOf(name);
    const indexes = {
      id: getIndex('消息ID'),
      subject: getIndex('主题'),
      body: getIndex('正文'),
      source: getIndex('来源'),
      sendTime: getIndex('发信时间'),
    };
    if (Object.values(indexes).some((index) => index < 0)) {
      throw new Error('消息中心表格字段不完整，无法匹配码牌划转结果');
    }
    return Array.from(table.querySelectorAll('tbody tr')).map((row) => {
      const cells = Array.from(row.children);
      return {
        id: normalizeText(cells[indexes.id]?.textContent),
        subject: normalizeText(cells[indexes.subject]?.textContent),
        body: normalizeText(cells[indexes.body]?.textContent),
        source: normalizeText(cells[indexes.source]?.textContent),
        sendTime: normalizeText(cells[indexes.sendTime]?.textContent),
      };
    }).filter((message) => message.id);
  }

  function parseCodePlateResultMessage(message) {
    const jsonText = message.body.match(/\{[^{}]*\}/)?.[0] || '';
    if (!jsonText) return null;
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (error) {
      return null;
    }
    const resultText = normalizeText(message.body.match(/处理结果[：:]\s*([\s\S]*)$/)?.[1] || '');
    const success = Number(data.fStatus) === 1 && /转移成功/.test(resultText);
    return {
      ...message,
      data,
      resultText,
      success,
    };
  }

  function isCodePlateResultForValues(result, values) {
    if (!result) return false;
    return result.subject === CODE_PLATE_RESULT_SUBJECT
      && result.source === CODE_PLATE_RESULT_SOURCE
      && String(result.data.fStartNum || '') === values.startCode
      && String(result.data.fEndNum || '') === values.endCode
      && String(result.data.fOldAgent || '') === values.sourceAgent
      && String(result.data.fNewAgent || '') === values.targetAgent;
  }

  function pickNewCodePlateTransferResult(messages, baselineMessageIds) {
    const baselineIds = new Set(Array.from(baselineMessageIds || []).map(String));
    return messages.find((message) => !baselineIds.has(String(message.id))) || null;
  }

  function summarizeCodePlateMessageValues(message) {
    const data = message?.data || {};
    return [
      `消息ID=${message?.id || '未知'}`,
      `开始=${data.fStartNum || '空'}`,
      `结束=${data.fEndNum || '空'}`,
      `原代理=${data.fOldAgent || '空'}`,
      `新代理=${data.fNewAgent || '空'}`,
    ].join('，');
  }

  async function queryCodePlateTransferMessages(values) {
    const normalized = values ? assertCodePlateTransferValues(values) : null;
    const queryUrl = `${USER_CENTER}/messagePush.do?method=list&_=${Date.now()}`;
    const html = await requestText(queryUrl, {
      method: 'POST',
      cache: 'no-store',
      timeoutMs: 12000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      referrer: `${USER_CENTER}/messagePush.do?method=list`,
      body: buildFormBody({
        dateRange: '',
        msgId: '',
        subject: CODE_PLATE_RESULT_SUBJECT,
        type: '',
        status: '',
        system: 'saasadmin',
        pageNumber: '1',
        pageSize: '200',
      }),
    });
    const messages = parseCodePlateMessageRows(html)
        .map(parseCodePlateResultMessage)
        .filter(Boolean);
    return normalized ? messages.filter((message) => isCodePlateResultForValues(message, normalized)) : messages;
  }

  async function submitCodePlateTransferViaNativeForm(file, options = {}) {
    if (!(file instanceof Blob)) throw new Error('待上传的码牌模板文件无效');
    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const PageFile = pageWindow.File || File;
    const PageDataTransfer = pageWindow.DataTransfer || DataTransfer;
    const uploadFile = new PageFile([await file.arrayBuffer()], file.name || '批量转移模板.xlsx', {
      type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const dataTransfer = new PageDataTransfer();
    dataTransfer.items.add(uploadFile);

    return new Promise((resolve, reject) => {
      const frameName = `syt-code-plate-upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const iframe = document.createElement('iframe');
      const form = document.createElement('form');
      const fileInput = document.createElement('input');
      const submitInput = document.createElement('input');
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
        finish(reject, new Error('码牌划转上传请求超时，请检查后台登录状态后重试'));
      }, options.uploadTimeoutMs == null ? 30000 : options.uploadTimeoutMs);

      iframe.name = frameName;
      iframe.style.display = 'none';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('sandbox', 'allow-forms allow-same-origin');
      iframe.addEventListener('load', () => {
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
          const html = responseDocument?.documentElement?.outerHTML || '';
          if (!html) throw new Error('后台上传接口返回了空页面');
          finish(resolve, html);
        } catch (error) {
          finish(reject, new Error(`无法读取码牌划转上传响应: ${error.message}`));
        }
      });

      form.method = 'POST';
      form.action = options.actionUrl || `${SAAS}/qrCodeState.do?method=distributeBatch`;
      form.enctype = 'multipart/form-data';
      form.target = frameName;
      form.acceptCharset = 'UTF-8';
      form.style.display = 'none';

      fileInput.type = 'file';
      fileInput.name = 'distributeBatchFormFile';
      fileInput.files = dataTransfer.files;
      submitInput.type = 'hidden';
      submitInput.name = 'submit';
      submitInput.value = '确认提交';
      form.append(fileInput, submitInput);
      document.body.append(iframe, form);
    });
  }

  async function submitCodePlateTransfer(values, options = {}) {
    const normalized = assertCodePlateTransferValues(values);
    const file = options.file || await createCodePlateTransferFile(normalized);
    const html = await submitCodePlateTransferViaNativeForm(file, {
      uploadTimeoutMs: options.uploadTimeoutMs,
    });
    const htmlError = detectHtmlError(html);
    if (htmlError) throw new Error(htmlError);
    const message = getHtmlMessage(html);
    if (!message.includes(CODE_PLATE_ACCEPTED_MESSAGE)) {
      throw new Error(`无法确认码牌划转任务已受理: ${summarizeHtml(html)}`);
    }
    return { ok: true, accepted: true, requestMode: 'native-form-iframe', message, html, values: normalized };
  }

  async function pollCodePlateTransferResult(values, options = {}) {
    const normalized = assertCodePlateTransferValues(values);
    const baselineIds = new Set(Array.from(options.baselineMessageIds || []).map(String));
    const intervalMs = options.pollIntervalMs == null ? 2000 : options.pollIntervalMs;
    const timeoutMs = options.pollTimeoutMs == null ? 60000 : options.pollTimeoutMs;
    const deadline = Date.now() + timeoutMs;
    let successfulQueries = 0;
    let lastQueryError = null;
    const reportedUnmatchedIds = new Set();
    const unmatchedMessages = new Map();

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
            options.onLog(`发现新的码牌划转消息，但参数与本次任务不一致: ${summarizeCodePlateMessageValues(message)}`);
          }
        });
        if (!result) continue;
        if (!result.success) {
          const error = new Error(`码牌划转失败: ${result.resultText || result.body}`);
          error.code = 'CODE_PLATE_TRANSFER_FAILED';
          error.result = result;
          throw error;
        }
        return { ok: true, timeout: false, result, values: normalized };
      } catch (error) {
        if (error.code === 'CODE_PLATE_TRANSFER_FAILED') throw error;
        lastQueryError = error;
        if (options.onLog) options.onLog(`消息中心查询失败，将继续重试: ${error.message}`, true);
      }
    }
    if (successfulQueries === 0 && lastQueryError) {
      throw new Error(`持续无法查询消息中心: ${lastQueryError.message}`);
    }
    return {
      ok: false,
      timeout: true,
      result: null,
      values: normalized,
      unmatchedMessages: Array.from(unmatchedMessages.values()),
    };
  }

  async function transferCodePlates(values, options = {}) {
    const normalized = assertCodePlateTransferValues(values);
    const log = (message, isError = false) => {
      if (options.onLog) options.onLog(message, isError);
    };
    const status = (state, message) => {
      if (options.onStatus) options.onStatus(state, message);
    };

    status('generating', '正在生成 Excel');
    log(`码牌划转运行版本: ${SCRIPT_VERSION}`);
    log(`开始生成码牌划转 Excel: ${normalized.startCode} 至 ${normalized.endCode}`);
    const file = await createCodePlateTransferFile(normalized);
    log(`Excel 生成完成: ${file.name}（${file.size} 字节）`);

    status('preparing', '正在读取消息中心基线');
    log('正在记录消息中心基线');
    const baselineMessages = await queryCodePlateTransferMessages();
    const baselineMessageIds = new Set(baselineMessages.map((message) => message.id));

    status('submitting', '正在提交后台');
    log(`开始提交码牌划转: ${normalized.sourceAgent} -> ${normalized.targetAgent}`);
    const submission = await submitCodePlateTransfer(normalized, { file });
    status('waiting', '后台已受理，正在等待处理结果');
    log('码牌划转任务已受理，开始等待消息中心处理结果');

    const outcome = await pollCodePlateTransferResult(normalized, {
      baselineMessageIds,
      pollIntervalMs: options.pollIntervalMs,
      pollTimeoutMs: options.pollTimeoutMs,
      onLog: options.onLog,
    });
    if (outcome.timeout) {
      const unmatchedMessage = outcome.unmatchedMessages?.[0];
      const message = unmatchedMessage
        ? `后台已受理并发现新消息，但参数未完全匹配，请到消息中心确认。${summarizeCodePlateMessageValues(unmatchedMessage)}`
        : '后台已受理，但等待结果超时，请到消息中心确认';
      status('timeout', message);
      log(message);
      return { ...outcome, submission };
    }
    status('success', '码牌划转成功');
    log(`码牌划转成功，消息ID: ${outcome.result.id}`);
    return { ...outcome, submission };
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
    if (shouldDisableOldSubMch(options)) {
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
    } else {
      disableResult = { skipped: true, changedGroups: [] };
      log('未勾选“是否关闭旧子商户号”，已保留旧微信子商户号');
      notifyProgress(options, 'wechat', 'disable', 'skipped');
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
    if (shouldDisableOldSubMch(options)) {
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
    } else {
      disableResult = { skipped: true, changedGroups: [] };
      log('未勾选“是否关闭旧子商户号”，已保留旧支付宝子商户号');
      notifyProgress(options, 'alipay', 'disable', 'skipped');
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

    const panel = document.createElement('div');
    panel.id = 'syt-auto-report-panel';
    panel.className = 'collapsed';
    panel.innerHTML = `
      <button class="float-ball" type="button" title="打开收银通重置子商户号工具">重置</button>
      <div class="panel-window">
        <header>
          <div class="panel-header-main">
            <button id="syt-tool-view-back" class="panel-back" type="button" title="返回">←</button>
            <span id="syt-tool-view-title">收银通重置子商户号工具 v${SCRIPT_VERSION}</span>
          </div>
          <button class="close" type="button" title="收起">x</button>
        </header>
        <div id="syt-main-tool-view" class="body tool-view active">
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
          <label class="setting-checkbox" for="syt-disable-old-submch">
            <input id="syt-disable-old-submch" type="checkbox" checked>
            <span>是否关闭旧子商户号</span>
          </label>
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
          <div class="more-tools">
            <div class="more-tools-title">更多工具</div>
            <div class="more-tools-actions">
              <button id="syt-open-code-plate-transfer" type="button">码牌划转</button>
              <button id="syt-open-change-whitelist" type="button">防切户白名单</button>
            </div>
          </div>
        </div>
        <div id="syt-code-plate-transfer-view" class="body tool-view" aria-labelledby="syt-tool-view-title">
          <div class="transfer-section">
            <div class="transfer-section-title">码牌范围</div>
            <div class="transfer-fields">
              <div class="transfer-field">
                <label for="syt-code-plate-start">码牌开始编号</label>
                <input id="syt-code-plate-start" type="text" autocomplete="off" placeholder="请输入开始编号">
              </div>
              <div class="transfer-field">
                <label for="syt-code-plate-end">码牌结束编号</label>
                <input id="syt-code-plate-end" type="text" autocomplete="off" placeholder="请输入结束编号">
              </div>
            </div>
          </div>
          <div class="transfer-section">
            <div class="transfer-section-title">代理商</div>
            <div class="transfer-fields">
              <div class="transfer-field">
                <label for="syt-code-plate-source-agent">原代理商</label>
                <input id="syt-code-plate-source-agent" type="text" inputmode="numeric" autocomplete="off" placeholder="请输入原代理商编号">
              </div>
              <div class="transfer-field">
                <label for="syt-code-plate-target-agent">新代理商</label>
                <input id="syt-code-plate-target-agent" type="text" inputmode="numeric" autocomplete="off" placeholder="请输入新代理商编号">
              </div>
            </div>
          </div>
          <div id="syt-code-plate-transfer-summary" class="transfer-summary">填写完整后显示本次划转信息</div>
          <div id="syt-code-plate-transfer-error" class="transfer-error" role="alert"></div>
          <div class="transfer-dialog-actions">
            <button id="syt-cancel-code-plate-transfer" type="button">返回</button>
            <button id="syt-confirm-code-plate-transfer" class="primary" type="button">确认划转</button>
          </div>
        </div>
        <div id="syt-change-whitelist-view" class="body tool-view" aria-labelledby="syt-tool-view-title">
          <div class="transfer-section">
            <div class="transfer-section-title">防切户白名单</div>
            <div class="transfer-fields">
              <div class="transfer-field">
                <label for="syt-whitelist-mobile">手机号</label>
                <input id="syt-whitelist-mobile" type="text" inputmode="tel" autocomplete="off" placeholder="选填">
              </div>
              <div class="transfer-field">
                <label for="syt-whitelist-id-card">身份证号</label>
                <input id="syt-whitelist-id-card" type="text" autocomplete="off" placeholder="选填">
              </div>
              <div class="transfer-field">
                <label for="syt-whitelist-business-license">营业执照号</label>
                <input id="syt-whitelist-business-license" type="text" autocomplete="off" placeholder="选填">
              </div>
              <div class="transfer-field">
                <label for="syt-whitelist-settlement-account">结算账号</label>
                <input id="syt-whitelist-settlement-account" type="text" autocomplete="off" placeholder="选填">
              </div>
            </div>
          </div>
          <div id="syt-change-whitelist-summary" class="transfer-summary">至少填写一项，多项将并发提交</div>
          <div id="syt-change-whitelist-error" class="transfer-error" role="alert"></div>
          <div class="transfer-dialog-actions">
            <button id="syt-cancel-change-whitelist" type="button">返回</button>
            <button id="syt-confirm-change-whitelist" class="primary" type="button">确认添加</button>
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
    const disableOldSubMchCheckbox = panel.querySelector('#syt-disable-old-submch');
    const logBox = panel.querySelector('#om-auto-report-log');
    const wechatButton = panel.querySelector('#om-auto-report-wechat');
    const alipayButton = panel.querySelector('#om-auto-report-alipay');
    const allButton = panel.querySelector('#om-auto-report-all');
    const configureMerchantKeyButton = panel.querySelector('#syt-configure-merchant-key');
    const enableOnlineReceiptButton = panel.querySelector('#syt-enable-online-receipt');
    const openCodePlateTransferButton = panel.querySelector('#syt-open-code-plate-transfer');
    const openChangeWhitelistButton = panel.querySelector('#syt-open-change-whitelist');
    const mainToolView = panel.querySelector('#syt-main-tool-view');
    const codePlateTransferView = panel.querySelector('#syt-code-plate-transfer-view');
    const changeWhitelistView = panel.querySelector('#syt-change-whitelist-view');
    const toolViewTitle = panel.querySelector('#syt-tool-view-title');
    const toolViewBackButton = panel.querySelector('#syt-tool-view-back');
    const cancelCodePlateTransferButton = panel.querySelector('#syt-cancel-code-plate-transfer');
    const confirmCodePlateTransferButton = panel.querySelector('#syt-confirm-code-plate-transfer');
    const codePlateStartInput = panel.querySelector('#syt-code-plate-start');
    const codePlateEndInput = panel.querySelector('#syt-code-plate-end');
    const sourceAgentInput = panel.querySelector('#syt-code-plate-source-agent');
    const targetAgentInput = panel.querySelector('#syt-code-plate-target-agent');
    const codePlateTransferSummary = panel.querySelector('#syt-code-plate-transfer-summary');
    const codePlateTransferError = panel.querySelector('#syt-code-plate-transfer-error');
    const cancelChangeWhitelistButton = panel.querySelector('#syt-cancel-change-whitelist');
    const confirmChangeWhitelistButton = panel.querySelector('#syt-confirm-change-whitelist');
    const whitelistMobileInput = panel.querySelector('#syt-whitelist-mobile');
    const whitelistIdCardInput = panel.querySelector('#syt-whitelist-id-card');
    const whitelistBusinessLicenseInput = panel.querySelector('#syt-whitelist-business-license');
    const whitelistSettlementAccountInput = panel.querySelector('#syt-whitelist-settlement-account');
    const changeWhitelistSummary = panel.querySelector('#syt-change-whitelist-summary');
    const changeWhitelistError = panel.querySelector('#syt-change-whitelist-error');
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
    let codePlateTransferBusy = false;
    let changeWhitelistBusy = false;

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
      openCodePlateTransferButton.disabled = busy;
      openChangeWhitelistButton.disabled = busy;
      merchantClearButton.disabled = busy;
      disableOldSubMchCheckbox.disabled = busy;
      refreshProgressRetryability('wechat');
      refreshProgressRetryability('alipay');
    };
    const getCodePlateTransferValues = () => ({
      startCode: codePlateStartInput.value.trim(),
      endCode: codePlateEndInput.value.trim(),
      sourceAgent: sourceAgentInput.value.trim(),
      targetAgent: targetAgentInput.value.trim(),
    });
    const validateCodePlateTransferValues = (values) => {
      try {
        assertCodePlateTransferValues(values);
        return '';
      } catch (error) {
        return error.message;
      }
    };
    const setCodePlateTransferError = (message = '') => {
      codePlateTransferError.textContent = message;
      codePlateTransferError.classList.toggle('visible', Boolean(message));
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
      confirmCodePlateTransferButton.textContent = codePlateTransferBusy ? '处理中...' : '确认划转';
      setBusy(codePlateTransferBusy);
    };
    const refreshCodePlateTransferSummary = () => {
      if (codePlateTransferBusy) return;
      delete codePlateTransferSummary.dataset.state;
      const values = getCodePlateTransferValues();
      if (!values.startCode && !values.endCode && !values.sourceAgent && !values.targetAgent) {
        codePlateTransferSummary.textContent = '填写完整后显示本次划转信息';
        return;
      }
      const range = values.startCode || values.endCode
        ? `${values.startCode || '未填写'} 至 ${values.endCode || '未填写'}`
        : '未填写';
      codePlateTransferSummary.textContent = `码牌 ${range}，从代理商 ${values.sourceAgent || '未填写'} 划转至 ${values.targetAgent || '未填写'}`;
    };
    const getChangeWhitelistValues = () => ({
      mobile: whitelistMobileInput.value.trim(),
      idCard: whitelistIdCardInput.value.trim(),
      businessLicense: whitelistBusinessLicenseInput.value.trim(),
      settlementAccount: whitelistSettlementAccountInput.value.trim(),
    });
    const setChangeWhitelistError = (message = '') => {
      changeWhitelistError.textContent = message;
      changeWhitelistError.classList.toggle('visible', Boolean(message));
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
        whitelistSettlementAccountInput,
      ].forEach((field) => {
        field.disabled = changeWhitelistBusy;
      });
      confirmChangeWhitelistButton.disabled = changeWhitelistBusy;
      confirmChangeWhitelistButton.textContent = changeWhitelistBusy ? '提交中...' : '确认添加';
      setBusy(changeWhitelistBusy);
    };
    const refreshChangeWhitelistSummary = () => {
      if (changeWhitelistBusy) return;
      const items = getMerchantChangeWhitelistItems(getChangeWhitelistValues());
      delete changeWhitelistSummary.dataset.state;
      changeWhitelistSummary.textContent = items.length > 0
        ? `已填写 ${items.length} 项：${items.map((item) => item.label).join('、')}`
        : '至少填写一项，多项将并发提交';
    };
    const showMainToolView = () => {
      mainToolView.classList.add('active');
      codePlateTransferView.classList.remove('active');
      changeWhitelistView.classList.remove('active');
      toolViewBackButton.classList.remove('visible');
      toolViewTitle.textContent = `收银通重置子商户号工具 v${SCRIPT_VERSION}`;
      setCodePlateTransferError('');
      setChangeWhitelistError('');
    };
    const showCodePlateTransferView = () => {
      setCodePlateTransferError('');
      if (!codePlateTransferSummary.dataset.state) refreshCodePlateTransferSummary();
      mainToolView.classList.remove('active');
      changeWhitelistView.classList.remove('active');
      codePlateTransferView.classList.add('active');
      toolViewBackButton.classList.add('visible');
      toolViewTitle.textContent = `码牌划转 v${SCRIPT_VERSION}`;
      codePlateStartInput.focus();
    };
    const showChangeWhitelistView = () => {
      setChangeWhitelistError('');
      if (!changeWhitelistSummary.dataset.state) refreshChangeWhitelistSummary();
      mainToolView.classList.remove('active');
      codePlateTransferView.classList.remove('active');
      changeWhitelistView.classList.add('active');
      toolViewBackButton.classList.add('visible');
      toolViewTitle.textContent = `防切户白名单 v${SCRIPT_VERSION}`;
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
        disableOldSubMch: disableOldSubMchCheckbox.checked,
      };
    };
    const getCopyText = () => {
      const wechatValue = resultInput.value.trim();
      const alipayValue = alipayResultInput.value.trim();
      if (!wechatValue && !alipayValue) return '';
      return [
        `乐刷商户号：${input.value.trim()}`,
        wechatValue ? `微信子商户号：${wechatValue}` : '',
        alipayValue ? `支付宝子商户号：${alipayValue}` : ''
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
      if (status === 'success' || status === 'skipped') {
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
      return shouldDisableOldSubMch(context.reportOptions)
        && context.completedSteps.enable
        && context.failedStep === 'disable';
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
        } else if (stepElement.classList.contains('skipped')) {
          stepElement.title = '已根据设置保留旧子商户号';
        } else {
          stepElement.removeAttribute('title');
        }
      });
    };
    const setProgressStep = (type, step, status) => {
      const target = getProgressContainer(type).querySelector(`[data-step="${step}"]`);
      if (!target) return;
      target.classList.remove('success', 'error', 'running', 'skipped', 'retryable');
      if (status === 'success' || status === 'error' || status === 'running' || status === 'skipped') {
        target.classList.add(status);
      }
      updateRetryContext(type, step, status);
      refreshProgressRetryability(type);
    };
    const resetProgress = (type) => {
      getProgressContainer(type).querySelectorAll('.progress-step').forEach((step) => {
        step.classList.remove('success', 'error', 'running', 'skipped', 'retryable');
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
      if (!shouldDisableOldSubMch(context.reportOptions)) {
        setProgressStep(context.type, 'disable', 'skipped');
        appendLog(`已保留旧${typeName}子商户号，跳过禁用步骤`);
        return;
      }
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

      if (shouldDisableOldSubMch(context.reportOptions)) {
        appendLog(`继续查询并禁用旧${typeName}子商户号`);
        await retryDisableOldMappings(context);
      } else {
        setProgressStep(context.type, 'disable', 'skipped');
        appendLog(`已保留旧${typeName}子商户号，跳过禁用步骤`);
      }
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

    openCodePlateTransferButton.addEventListener('click', showCodePlateTransferView);
    openChangeWhitelistButton.addEventListener('click', showChangeWhitelistView);
    toolViewBackButton.addEventListener('click', showMainToolView);
    cancelCodePlateTransferButton.addEventListener('click', showMainToolView);
    cancelChangeWhitelistButton.addEventListener('click', showMainToolView);
    [codePlateStartInput, codePlateEndInput, sourceAgentInput, targetAgentInput].forEach((field) => {
      field.addEventListener('input', () => {
        setCodePlateTransferError('');
        refreshCodePlateTransferSummary();
      });
    });
    confirmCodePlateTransferButton.addEventListener('click', async () => {
      if (codePlateTransferBusy) return;
      const values = getCodePlateTransferValues();
      const errorMessage = validateCodePlateTransferValues(values);
      if (errorMessage) {
        setCodePlateTransferError(errorMessage);
        return;
      }
      setCodePlateTransferError('');
      setCodePlateTransferBusy(true);
      try {
        const result = await transferCodePlates(values, {
          onLog: appendLog,
          onStatus: setCodePlateTransferStatus,
        });
        console.log('sytAutoReport codePlateTransfer result:', result);
      } catch (error) {
        const message = error.message || String(error);
        setCodePlateTransferError('');
        setCodePlateTransferStatus('failure', message);
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
      whitelistSettlementAccountInput,
    ].forEach((field) => {
      field.addEventListener('input', () => {
        setChangeWhitelistError('');
        refreshChangeWhitelistSummary();
      });
    });
    confirmChangeWhitelistButton.addEventListener('click', async () => {
      if (changeWhitelistBusy) return;
      const values = getChangeWhitelistValues();
      const items = getMerchantChangeWhitelistItems(values);
      if (items.length === 0) {
        setChangeWhitelistError('请至少填写手机号、身份证号、营业执照号或结算账号中的一项');
        return;
      }
      setChangeWhitelistError('');
      setChangeWhitelistBusy(true);
      try {
        const result = await addMerchantChangeWhitelist(values, {
          onLog: appendLog,
          onStatus: setChangeWhitelistStatus,
        });
        console.log('sytAutoReport merchantChangeWhitelist result:', result);
      } catch (error) {
        const message = error.message || String(error);
        setChangeWhitelistStatus('failure', message);
        appendLog(message, true);
        console.error(error);
      } finally {
        setChangeWhitelistBusy(false);
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
      showMainToolView();
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
        showMainToolView();
        panel.classList.add('collapsed');
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape'
        && (codePlateTransferView.classList.contains('active')
          || changeWhitelistView.classList.contains('active'))) {
        showMainToolView();
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
    configureMerchantKey,
    enableOnlineReceipt,
    addMerchantChangeWhitelistItem,
    addMerchantChangeWhitelist,
    createCodePlateTransferFile,
    queryCodePlateTransferMessages,
    submitCodePlateTransfer,
    submitCodePlateTransferViaNativeForm,
    pollCodePlateTransferResult,
    transferCodePlates,
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
