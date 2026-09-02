export type ReportType = 'WECHAT' | 'ALIPAY' | 'ALL';
export type ChannelName = 'wechat' | 'alipay';
export type ReportMode = 'SYT' | 'COMMON';

export interface ChannelResult {
  state: 'pending' | 'success' | 'failure' | 'skipped';
  subMchId?: string;
  error?: string;
  note?: string;
}

export interface MerchantReportResult {
  merchantId: string;
  route: 'batch' | 'legacy';
  businessLine?: 'syt' | 'lhsd';
  wechat: ChannelResult;
  alipay: ChannelResult;
}

interface QuickReportChannelResponse {
  channel?: string;
  respCode?: string | number;
  respMsg?: string | null;
  data?: string | number | {
    result?: number | string;
    msg?: string | null;
    wxMchId?: string | number;
    zfbSubMch?: string | number;
  } | null;
}

interface QuickReportMerchantResponse {
  merchantId?: string | number;
  results?: QuickReportChannelResponse[];
}

interface QuickReportResponse {
  success?: boolean;
  errMsg?: string | null;
  data?: {
    respCode?: string | number;
    respMsg?: string | null;
    data?: QuickReportMerchantResponse[];
  } | null;
}

export function parseMerchantIds(raw: string): string[] {
  const merchantIds = raw.split(';').map((item) => item.trim()).filter(Boolean);
  if (merchantIds.length === 0) throw new Error('请至少输入一个乐刷商户号');
  if (merchantIds.length > 5) throw new Error('一次最多重置 5 个乐刷商户号');
  const duplicates = merchantIds.filter((item, index) => merchantIds.indexOf(item) !== index);
  if (duplicates.length > 0) throw new Error(`乐刷商户号重复: ${duplicates[0]}`);
  const invalid = merchantIds.find((item) => !/^\d{10}$/.test(item));
  if (invalid) throw new Error(`乐刷商户号必须是 10 位数字: ${invalid}`);
  return merchantIds;
}

function requested(type: ReportType, channel: ChannelName): boolean {
  return type === 'ALL' || (type === 'WECHAT' && channel === 'wechat') || (type === 'ALIPAY' && channel === 'alipay');
}

function skipped(): ChannelResult {
  return { state: 'skipped' };
}

function failure(error: string): ChannelResult {
  return { state: 'failure', error };
}

function readChannelResult(channel: ChannelName, response: QuickReportChannelResponse | undefined): ChannelResult {
  if (!response) return failure(`接口未返回${channel === 'wechat' ? '微信' : '支付宝'}处理结果`);
  const data = response.data;
  const structuredData = typeof data === 'object' && data !== null ? data : null;
  const success = String(response.respCode) === '0'
    && (structuredData ? Number(structuredData.result) === 0 : Boolean(data));
  const id = structuredData
    ? channel === 'wechat' ? structuredData.wxMchId : structuredData.zfbSubMch
    : data;
  if (!success) return failure(String(response.respMsg || structuredData?.msg || '上报失败'));
  if (!id || !/^\d+$/.test(String(id))) return failure('上报成功但未返回子商户号');
  return { state: 'success', subMchId: String(id) };
}

function isChannel(response: QuickReportChannelResponse, channel: ChannelName): boolean {
  return channel === 'wechat' ? response.channel === '微信' : response.channel === '支付宝';
}

export function parseQuickReportResponse(payload: unknown, merchantIds: string[], reportType: ReportType): MerchantReportResult[] {
  const response = payload as QuickReportResponse;
  const globalError = response?.success === false
    ? String(response.errMsg || response.data?.respMsg || '批量重置请求失败')
    : String(response?.data?.respCode) !== '0'
      ? String(response?.data?.respMsg || '批量重置请求失败')
      : '';
  const rows = Array.isArray(response?.data?.data) ? response.data.data : [];
  return merchantIds.map((merchantId) => {
    const row = rows.find((item) => String(item.merchantId) === merchantId);
    const noRowError = globalError || '接口未返回该商户的处理结果';
    const results = row?.results || [];
    const wechat = requested(reportType, 'wechat')
      ? row
        ? readChannelResult('wechat', results.find((item) => isChannel(item, 'wechat')))
        : failure(noRowError)
      : skipped();
    const alipay = requested(reportType, 'alipay')
      ? row
        ? readChannelResult('alipay', results.find((item) => isChannel(item, 'alipay')))
        : failure(noRowError)
      : skipped();
    return {
      merchantId,
      route: 'batch',
      wechat,
      alipay,
    };
  });
}

export async function submitQuickReport(
  merchantIds: string[],
  reportType: ReportType,
  reportMode: ReportMode = 'SYT',
  fetchImpl: typeof fetch = fetch,
): Promise<MerchantReportResult[]> {
  const body = new URLSearchParams({
    merchantIds: merchantIds.join(';'),
    reportType,
    reportMode,
  });
  const response = await fetchImpl('/lspos/atBatchTask.do?method=quickManualReport', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`批量重置请求失败 ${response.status}: ${text.slice(0, 200)}`);
  try {
    return parseQuickReportResponse(JSON.parse(text), merchantIds, reportType);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`批量重置接口返回非 JSON 内容: ${text.slice(0, 200)}`);
    throw error;
  }
}
