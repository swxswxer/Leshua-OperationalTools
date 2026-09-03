import { SAAS, assertMerchantId, normalizeText, requestJson } from './http';

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
