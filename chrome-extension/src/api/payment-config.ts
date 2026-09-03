import { ORIGIN, SAAS, assertMerchantId, buildFormBody, getDateRange, normalizeText, requestJson, requestText, summarizeHtml } from './http';

export interface PaymentConfigValues {
  subAppids: string;
  jsapiPaths: string;
}

interface ConfigRow {
  fId?: string | number;
  fMerchantId?: string | number;
  fWxSubMchId?: string | number;
  fCreateTime?: string;
}

interface ConfigListResponse {
  rows?: ConfigRow[];
}

function createdAt(value: string | undefined): number {
  return new Date(String(value || '').replace(/\.0$/, '').replace(' ', 'T')).getTime() || 0;
}

async function queryConfigRows(merchantId: string, wxSubMchId: string): Promise<ConfigRow[]> {
  assertMerchantId(merchantId);
  if (!/^\d+$/.test(wxSubMchId)) throw new Error('微信子商户号不能为空，且必须为数字');
  const range = getDateRange({ years: 5 });
  const response = await requestJson<ConfigListResponse>(`${SAAS}/wxsubmch.do?method=list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Origin: ORIGIN },
    referrer: `${SAAS}/wxsubmch.do?method=page`,
    body: buildFormBody({
      fCreateTimeStart: range.createStartTime, fCreateTimeEnd: range.createEndTime,
      fChannelType: '', fPayType: '', fStatus: '', fCanTrade: '', fUpdateTimeStart: '', fUpdateTimeEnd: '',
      fChannelId: '', fWxSubMchId: wxSubMchId, fAgentId1g: '', fMerchantId: merchantId,
      fAuthorizeState: '', fInUse: '', syncPlatform: '', page: '1', rows: '15',
    }),
  });
  return (Array.isArray(response.rows) ? response.rows : []).filter((row) =>
    normalizeText(row.fMerchantId) === merchantId && normalizeText(row.fWxSubMchId) === wxSubMchId,
  );
}

export async function bindWechatPaymentConfig(
  merchantId: string,
  wxSubMchId: string,
  values: PaymentConfigValues,
): Promise<{ id: string; wxSubMchId: string }> {
  const row = (await queryConfigRows(merchantId, wxSubMchId))
    .sort((left, right) => createdAt(right.fCreateTime) - createdAt(left.fCreateTime))[0];
  if (!row?.fId) throw new Error(`未查询到微信子商户号 ${wxSubMchId} 对应的配置记录 id`);
  const id = String(row.fId);
  const html = await requestText(`${SAAS}/wxsubmch.do?method=configReport`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN },
    referrer: `${SAAS}/wxsubmch.do?method=getByReportConfigId&reportConfigId=0&id=${encodeURIComponent(id)}`,
    body: buildFormBody({ subAppids: values.subAppids, jsapiPaths: values.jsapiPaths, id, isSubmitted: '1' }),
  });
  const summary = summarizeHtml(html);
  if (/没有该项操作权限|失败|错误|异常/.test(summary)) throw new Error(`微信支付参数绑定失败: ${summary}`);
  return { id, wxSubMchId: normalizeText(row.fWxSubMchId) };
}
