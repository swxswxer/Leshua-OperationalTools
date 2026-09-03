import { ORIGIN, SAAS, assertMerchantId, buildFormBody, getDateRange, getHtmlMessage, normalizeText, requestText, sleep } from './http';
import { type MappingRow, queryAlipayMappings, queryWechatMappings } from './mapping';

type ChannelStatusField = 'unionStatus' | 'nuccStatus' | 'interconnectionStatus';
type StatusParams = Partial<Record<ChannelStatusField, '0' | '1'>>;

interface StatusGroup {
  merchantId: string;
  subMchId: string;
  wxSubMchId: string;
  zfbSubMchId: string;
  payType: string;
  rows: MappingRow[];
  statusParams: StatusParams;
}

const CHANNEL_STATUS_FIELD: Record<string, ChannelStatusField> = {
  银联: 'unionStatus', 网联: 'nuccStatus', 网联互联互通: 'interconnectionStatus',
};
const FIELD_CHANNEL: Record<ChannelStatusField, string> = {
  unionStatus: '银联', nuccStatus: '网联', interconnectionStatus: '网联互联互通',
};

function groupRows(rows: MappingRow[], target: '0' | '1', key: 'wxSubMchId' | 'zfbSubMchId'): StatusGroup[] {
  const groups = new Map<string, StatusGroup>();
  rows.forEach((row) => {
    const subMchId = row[key] || row.subMchId;
    const field = CHANNEL_STATUS_FIELD[normalizeText(row.channel)];
    if (!subMchId || !field) return;
    const groupKey = `${subMchId}__${row.payType || '2'}`;
    const group = groups.get(groupKey) || {
      merchantId: row.merchantId, subMchId, wxSubMchId: row.wxSubMchId,
      zfbSubMchId: row.zfbSubMchId, payType: row.payType || '2', rows: [], statusParams: {},
    };
    group.rows.push(row);
    group.statusParams[field] = target;
    groups.set(groupKey, group);
  });
  return Array.from(groups.values()).filter((group) => Object.keys(group.statusParams).length > 0);
}

function parseStatusResult(html: string, statusParams: StatusParams): { ok: boolean; message: string; html: string } {
  const message = getHtmlMessage(html);
  const targets = Object.entries(statusParams).map(([field, status]) => `${FIELD_CHANNEL[field as ChannelStatusField]}:${status === '1' ? '启用' : '禁用'}成功`);
  return { ok: targets.length > 0 && targets.every((target) => message.includes(target)), message, html };
}

async function setTradeStatus(
  type: 'wechat' | 'alipay', merchantId: string, subMchId: string,
  payType: string, statusParams: StatusParams,
): Promise<{ ok: boolean; message: string; html: string }> {
  assertMerchantId(merchantId);
  if (!/^\d+$/.test(subMchId)) throw new Error(`${type === 'wechat' ? '微信' : '支付宝'}商户号不能为空，且必须为数字`);
  if (!Object.keys(statusParams).length) throw new Error('至少需要传入一个通道状态参数');
  const endpoint = type === 'wechat' ? 'wechatMappingInfo.do' : 'alipayMappingInfo.do';
  const parameter = type === 'wechat' ? 'wxSubMchId' : 'zfbSubMchId';
  const body = buildFormBody({ merchantId, [parameter]: subMchId, payType, ...statusParams, submit: '提 交' });
  const html = await requestText(`${SAAS}/${endpoint}?method=setTradeStatus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN },
    referrer: `${SAAS}/${endpoint}?method=getSetTradeStatusPage&merchantId=${encodeURIComponent(merchantId)}&${parameter}=${encodeURIComponent(subMchId)}&payType=${encodeURIComponent(payType)}`,
    body,
  });
  return parseStatusResult(html, statusParams);
}

async function setGroups(type: 'wechat' | 'alipay', merchantId: string, groups: StatusGroup[]): Promise<StatusGroup[]> {
  const changed: StatusGroup[] = [];
  for (const group of groups) {
    const result = await setTradeStatus(type, merchantId, group.subMchId, group.payType, group.statusParams);
    if (!result.ok) throw new Error(`设置${type === 'wechat' ? '微信' : '支付宝'}子商户号 ${group.subMchId} 未确认成功: ${result.message}`);
    changed.push(group);
  }
  return changed;
}

export async function confirmWechatEnabled(merchantId: string, wxSubMchId: string): Promise<MappingRow[]> {
  await sleep(3000);
  for (let attempt = 0; attempt <= 3; attempt += 1) {
    if (attempt) await sleep(2000);
    const rows = await queryWechatMappings(merchantId, { ...getDateRange({ days: 1 }), wxSubMchId });
    const enabled = rows.filter((row) => normalizeText(row.noticeStatus) === '启用');
    if (enabled.length) return enabled;
  }
  throw new Error(`轮询超时，未查询到微信子商户号 ${wxSubMchId} 的启用映射记录`);
}

export async function confirmAlipayEnabled(merchantId: string, zfbSubMchId: string): Promise<MappingRow[]> {
  const startedAt = Date.now();
  let firstEnabledAt = 0;
  let previousChannels = '';
  let stableCount = 0;
  let latest: MappingRow[] = [];
  await sleep(1000);
  while (Date.now() - startedAt <= 30000) {
    const rows = await queryAlipayMappings(merchantId, { ...getDateRange({ days: 1 }), zfbSubMchId });
    latest = rows.filter((row) => normalizeText(row.noticeStatus) === '启用');
    if (latest.length) {
      const channels = latest.map((row) => normalizeText(row.channel)).filter(Boolean).sort().join('|');
      if (!firstEnabledAt) firstEnabledAt = Date.now();
      stableCount = channels === previousChannels ? stableCount + 1 : 1;
      previousChannels = channels;
      if (Date.now() - firstEnabledAt >= 2000 && stableCount >= 2) return latest;
    }
    await sleep(2000);
  }
  if (latest.length) return latest;
  throw new Error(`轮询超时，未查询到支付宝子商户号 ${zfbSubMchId} 的启用映射记录`);
}

export async function disableOldWechatMappings(merchantId: string, newSubMchId: string): Promise<number> {
  const rows = await queryWechatMappings(merchantId, { ...getDateRange({ years: 5 }), wxSubMchId: '' });
  const enabled = rows.filter((row) => row.wxSubMchId !== newSubMchId && normalizeText(row.noticeStatus) === '启用');
  return (await setGroups('wechat', merchantId, groupRows(enabled, '0', 'wxSubMchId'))).length;
}

export async function disableOldAlipayMappings(merchantId: string, newSubMchId: string): Promise<number> {
  const rows = await queryAlipayMappings(merchantId, { ...getDateRange({ years: 5 }), zfbSubMchId: '' });
  const enabled = rows.filter((row) => row.zfbSubMchId !== newSubMchId && normalizeText(row.noticeStatus) === '启用');
  return (await setGroups('alipay', merchantId, groupRows(enabled, '0', 'zfbSubMchId'))).length;
}
