import type { ReportOptions } from '../types';
import { getDateRange } from '../api/http';
import { queryWechatMappings } from '../api/mapping';
import { bindWechatPaymentConfig } from '../api/payment-config';

function createdAt(value: string | undefined): number {
  return new Date(String(value || '').replace(' ', 'T')).getTime() || 0;
}

/** Binds payment parameters to the newest WeChat mapping for one merchant. */
export async function bindLatestWechatPaymentConfig(
  merchantId: string,
  options: ReportOptions,
) {
  const rows = await queryWechatMappings(merchantId, getDateRange({ years: 5 }));
  const row = rows
    .filter((item) => String(item.merchantId || '') === merchantId && item.wxSubMchId)
    .sort((left, right) => createdAt(right.createTime) - createdAt(left.createTime))[0];
  if (!row?.wxSubMchId) throw new Error('未查询到可绑定的最新微信子商户号');
  return bindWechatPaymentConfig(merchantId, row.wxSubMchId, options);
}
