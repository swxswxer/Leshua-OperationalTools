import { ORIGIN, SAAS, assertMerchantId, buildFormBody, getDateRange, normalizeText, requestText } from './http';

export type MappingType = 'wechat' | 'alipay';

export interface MappingQueryOptions {
  createStartTime?: string;
  createEndTime?: string;
  payType?: string;
  status?: string;
  isDefault?: string;
  source?: string;
  channelType?: string;
  updateStartTime?: string;
  updateEndTime?: string;
  agentId1g?: string;
  wxSubMchId?: string;
  zfbSubMchId?: string;
  nuccwxMchId?: string;
  nuccZfbMchId?: string;
  pageSize?: string;
}

export interface MappingRow {
  merchantId: string;
  wxSubMchId: string;
  zfbSubMchId: string;
  subMchId: string;
  channel: string;
  noticeStatus: string;
  createTime: string;
  payType: string;
  [key: string]: string;
}

const PAY_TYPE_CODES: Record<string, string> = {
  线上: '1', 线下: '2', 公缴: '3', 公益: '4', 保险: '5', 绿洲: '6',
  高校食堂: '7', 私立中小幼: '8', 服饰日化: '9', 线上批发: '10',
};

function extractPayType(onclick: string): string {
  return onclick.match(/payType=\+'([^']*)'/)?.[1] || '';
}

export function parseMappingHtml(html: string, type: MappingType): MappingRow[] {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const subMchHeader = type === 'alipay' ? '支付宝商户号' : '微信商户号';
  const table = Array.from(document.querySelectorAll<HTMLTableElement>('table.tablesorter'))
    .find((item) => normalizeText(item.textContent).includes(subMchHeader) && normalizeText(item.textContent).includes('通知状态'));
  if (!table) return [];
  const headers = Array.from(table.querySelectorAll('thead th')).map((item) => normalizeText(item.textContent));
  return Array.from(table.querySelectorAll('tbody tr')).map((tableRow) => {
    const cells = Array.from(tableRow.querySelectorAll('td'));
    const values: Record<string, string> = {};
    headers.forEach((header, index) => { values[header] = normalizeText(cells[index]?.textContent); });
    const onclick = cells[0]?.querySelector<HTMLAnchorElement>('a[onclick*="getSetTradeStatusPage"]')?.getAttribute('onclick') || '';
    const wxSubMchId = values['微信商户号'] || '';
    const zfbSubMchId = values['支付宝商户号'] || '';
    return {
      ...values,
      merchantId: values['乐刷商户号'] || '',
      wxSubMchId,
      zfbSubMchId,
      subMchId: type === 'alipay' ? zfbSubMchId : wxSubMchId,
      channel: values['通道'] || '',
      noticeStatus: values['通知状态'] || '',
      createTime: values['创建时间'] || '',
      payType: extractPayType(onclick) || PAY_TYPE_CODES[normalizeText(values['费率类型'])] || '2',
    };
  }).filter((row) => row.merchantId || row.subMchId);
}

async function queryMappings(type: MappingType, merchantId: string, options: MappingQueryOptions = {}): Promise<MappingRow[]> {
  assertMerchantId(merchantId);
  const range = getDateRange({ days: 1 });
  const isAlipay = type === 'alipay';
  const body = buildFormBody({
    createStartTime: options.createStartTime || range.createStartTime,
    createEndTime: options.createEndTime || range.createEndTime,
    payType: options.payType || '2', status: options.status || '', isDefault: options.isDefault || '',
    source: options.source || '', channelType: options.channelType || '', updateStartTime: options.updateStartTime || '',
    updateEndTime: options.updateEndTime || '', agentId1g: options.agentId1g || '', merchantId,
    [isAlipay ? 'zfbSubMchId' : 'wxSubMchId']: isAlipay ? options.zfbSubMchId || '' : options.wxSubMchId || '',
    [isAlipay ? 'nuccZfbMchId' : 'nuccwxMchId']: isAlipay ? options.nuccZfbMchId || '' : options.nuccwxMchId || '',
    pageSize: options.pageSize || '200',
  });
  const endpoint = isAlipay ? 'alipayMappingInfo.do' : 'wechatMappingInfo.do';
  const html = await requestText(`${SAAS}/${endpoint}?method=page`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN },
    referrer: `${SAAS}/${endpoint}?method=page`,
    body,
  });
  return parseMappingHtml(html, type);
}

export const queryWechatMappings = (merchantId: string, options?: MappingQueryOptions) => queryMappings('wechat', merchantId, options);
export const queryAlipayMappings = (merchantId: string, options?: MappingQueryOptions) => queryMappings('alipay', merchantId, options);
