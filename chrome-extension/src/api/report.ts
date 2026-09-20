import { SAAS, assertMerchantId, buildFormBody, formatDateTime, normalizeText, requestJson } from './http';
import type { ChannelName } from './quick-report';

export interface ReportRecord {
  fId?: string | number;
  fMerchantId?: string | number;
  fStatus?: string | number;
  fCreateTime?: string;
  fUpdateTime?: string;
  fWxMsg?: string;
  fZfbMsg?: string;
}

function recordTime(row: ReportRecord): number {
  return Date.parse((row.fCreateTime || '').replace(' ', 'T')) || 0;
}

export function latestReportFailure(rows: ReportRecord[], merchantId: string, channel: ChannelName): { reason: string; time: string } | null {
  // 先取最新记录再判断失败，避免跳过最新成功记录而取到历史失败。
  const latest = rows.filter(row => String(row.fMerchantId) === merchantId)
    .sort((a, b) => recordTime(b) - recordTime(a) || Number(b.fId || 0) - Number(a.fId || 0))[0];
  if (!latest || String(latest.fStatus) !== '3') return null;
  const reason = normalizeText(channel === 'wechat' ? latest.fWxMsg : latest.fZfbMsg);
  if (!reason || /^(success|上报成功|成功)$/i.test(reason)) return null;
  return { reason, time: latest.fUpdateTime || latest.fCreateTime || '时间未知' };
}

export async function queryLatestReportFailure(merchantId: string, channel: ChannelName): Promise<{ reason: string; time: string } | null> {
  assertMerchantId(merchantId);
  const endpoint = channel === 'wechat' ? 'wxsubmch' : 'zfbsubmch';
  const records: ReportRecord[] = [];
  const end = formatDateTime(new Date());
  // 不假设后端默认排序，读取完整分页后再选最新记录；超出上限不返回可能错误的历史原因。
  for (let page = 1; page <= 10; page += 1) {
    const response = await requestJson<{ total?: number | string; rows?: ReportRecord[] }>(`${SAAS}/${endpoint}.do?method=list`, {
      method: 'POST', timeoutMs: 10000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: buildFormBody({
        fCreateTimeStart: '2018-01-01 00:00:00', fCreateTimeEnd: end,
        fChannelType: '', fPayType: '', fStatus: '', fInUse: '', fUpdateTimeStart: '', fUpdateTimeEnd: '',
        fAgentId1g: '', fMerchantId: merchantId,
        ...(channel === 'wechat'
          ? { fCanTrade: '', fChannelId: '', fWxSubMchId: '', fAuthorizeState: '', syncPlatform: '' }
          : { fSourcePid: '', fZfbSubMchId: '', fZfbSubMchLevel: '', fUpgradeStatus: '', fMchStatus: '' }),
        page, rows: 100,
      }),
    });
    if (!Array.isArray(response?.rows)) throw new Error('上报记录接口未返回有效的 rows');
    records.push(...response.rows);
    const total = response.total == null ? NaN : Number(response.total);
    if (Number.isFinite(total) && total >= 0 && records.length >= total) return latestReportFailure(records, merchantId, channel);
    if (!Number.isFinite(total) && response.rows.length < 100) return latestReportFailure(records, merchantId, channel);
    if (!response.rows.length) throw new Error('上报记录分页不完整');
  }
  throw new Error('上报记录超过查询上限，请到后台查看最新记录');
}

export interface WechatChannelOptions {
  channelId: string;
  channelName: string;
}

export interface AlipayChannelOptions {
  sourcePid: string;
  sourceName: string;
}

const DEFAULT_WECHAT_CHANNEL_ID = '209096974';
const DEFAULT_WECHAT_CHANNEL_NAME = '深圳市前海扫扫科技有限公司';
const DEFAULT_ALIPAY_CHANNEL_ID = '2088621549599695';
const DEFAULT_ALIPAY_CHANNEL_NAME = '乐刷支付科技有限公司';

interface ReportPayload {
  respCode?: string | number;
  respMsg?: string;
  data?: string | number | {
    result?: string | number;
    msg?: string;
    wxMchId?: string | number;
    zfbSubMch?: string | number;
  };
  wxMchId?: string | number;
  zfbSubMch?: string | number;
}

function readReportData(response: ReportPayload): Exclude<ReportPayload['data'], string | number | undefined> {
  return typeof response.data === 'object' && response.data !== null ? response.data : {};
}

function assertReportSuccess(response: ReportPayload, label: string): void {
  if (Number(response.respCode) !== 0) throw new Error(`${label}失败: ${response.respMsg || JSON.stringify(response)}`);
  const data = readReportData(response);
  if (data.result != null && Number(data.result) !== 0) throw new Error(`${label}失败: ${data.msg || response.respMsg || JSON.stringify(response)}`);
}

export function resolveWechatChannel(options: WechatChannelOptions): { id: string; name: string } {
  return { id: options.channelId || DEFAULT_WECHAT_CHANNEL_ID, name: options.channelName || DEFAULT_WECHAT_CHANNEL_NAME };
}

export function resolveAlipayChannel(options: AlipayChannelOptions): { id: string; name: string } {
  return { id: options.sourcePid || DEFAULT_ALIPAY_CHANNEL_ID, name: options.sourceName || DEFAULT_ALIPAY_CHANNEL_NAME };
}

export async function submitCustomWechatReport(merchantId: string, options: WechatChannelOptions): Promise<string> {
  assertMerchantId(merchantId);
  const channel = resolveWechatChannel(options);
  const params = new URLSearchParams({
    method: 'posreport',
    merchantId,
    channelId: channel.id,
    channelName: channel.name,
    notice: '1',
    mchId: '1502075691',
    configType: '1',
    payType: '2',
  });
  const response = await requestJson<ReportPayload>(`${SAAS}/wxsubmch.do?${params}`, {
    method: 'GET',
    referrer: `${SAAS}/wxsubmch.do?method=page`,
  });
  assertReportSuccess(response, '微信自定义渠道上报');
  const data = readReportData(response);
  const subMchId = normalizeText(data.wxMchId || response.wxMchId || response.data);
  if (!/^\d+$/.test(subMchId)) throw new Error(`微信上报成功但未返回子商户号: ${JSON.stringify(response)}`);
  return subMchId;
}

export async function submitCustomAlipayReport(merchantId: string, options: AlipayChannelOptions): Promise<string> {
  assertMerchantId(merchantId);
  const channel = resolveAlipayChannel(options);
  const params = new URLSearchParams({
    method: 'posreport',
    merchantId,
    sourcePid: channel.id,
    sourceName: channel.name,
    report4M3Flag: '2',
    configType: '',
    notice: '1',
  });
  const response = await requestJson<ReportPayload>(`${SAAS}/zfbsubmch.do?${params}`, {
    method: 'GET',
    referrer: `${SAAS}/zfbsubmch.do?method=page`,
  });
  assertReportSuccess(response, '支付宝自定义渠道上报');
  const data = readReportData(response);
  const subMchId = normalizeText(data.zfbSubMch || response.zfbSubMch || response.data);
  if (!/^\d+$/.test(subMchId)) throw new Error(`支付宝上报成功但未返回子商户号: ${JSON.stringify(response)}`);
  return subMchId;
}
