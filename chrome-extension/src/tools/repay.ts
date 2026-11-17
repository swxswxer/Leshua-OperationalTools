import { applyRepay, applyRepayWithRoute, parseRepayRouteId, queryRepayPage, repayDateRange, type RepayRoute, type RepayRow, type Settlement } from '../api/repay';
import { assertMerchantId } from '../api/http';

export const repayKey = (row: RepayRow) => `${row.type}:${row.billId}`;
export function canRepayWithRoute(row: RepayRow): boolean {
  if (!row.routeId) return false;
  try {
    const id = parseRepayRouteId(row.type, row.routeId);
    return id.billId === row.billId && id.merchantId === row.merchantId;
  } catch { return false; }
}
export async function queryRepayChannel(type: Settlement, merchantId: string, range: string): Promise<RepayRow[]> {
  const rows: RepayRow[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= 100; page++) {
    const result = await queryRepayPage(type, merchantId, page, range);
    if (result.page !== page && !(page === 1 && result.pages === 0 && !result.rows.length)) throw new Error('后台分页与请求不一致，已停止查询');
    for (const row of result.rows) {
      if (seen.has(row.billId)) throw new Error('后台分页出现重复打款单，请重新查询');
      seen.add(row.billId); rows.push(row);
    }
    if (page >= result.pages) return rows;
    if (!result.rows.length) throw new Error('后台分页数据不完整，请重新查询');
  }
  throw new Error('记录超过 100 页，请在后台缩小查询范围');
}
export async function searchRepay(merchantId: string, range = repayDateRange()) {
  const id = merchantId.trim(); assertMerchantId(id);
  const results = await Promise.allSettled((['T0', 'T1'] as const).map(type => queryRepayChannel(type, id, range)));
  const rows: RepayRow[] = []; const errors: string[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') rows.push(...result.value);
    else errors.push(`${i === 0 ? 'T0' : 'T1'} 查询失败：${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
  });
  return { rows, errors, range, merchantId: id };
}
export interface RepayOutcome { type: Settlement; ids: string[]; state: 'accepted' | 'failed' | 'unknown'; message: string }
export async function submitSelectedRepay(rows: RepayRow[], merchantId: string, onResult: (result: RepayOutcome) => void = () => {}, route: RepayRoute = 'AUTO'): Promise<RepayOutcome[]> {
  assertMerchantId(merchantId);
  if (!rows.length || rows.some(row => !row.selectable || row.merchantId !== merchantId || !['T0','T1'].includes(row.type) || !/^\d+$/.test(row.billId))) throw new Error('所选记录不属于当前商户或不可申请，请重新查询');
  if (new Set(rows.map(repayKey)).size !== rows.length) throw new Error('存在重复打款单');
  if (route !== 'AUTO' && route !== 'EPCC') throw new Error('未知重出通道');
  if (route === 'EPCC' && rows.some(row => !canRepayWithRoute(row))) throw new Error('所选记录缺少指定网联重出所需的完整标识，或标识与商户、打款单不一致，请重新查询');
  const results: RepayOutcome[] = [];
  for (const type of ['T0', 'T1'] as const) {
    const group = rows.filter(row => row.type === type);
    const ids = group.map(row => row.billId);
    if (!ids.length) continue;
    let result: RepayOutcome;
    try {
      const response = route === 'EPCC'
        ? await applyRepayWithRoute(type, group.map(row => row.routeId!))
        : await applyRepay(type, ids);
      result = { type, ids, state: response.accepted ? 'accepted' : 'failed', message: response.accepted ? '申请已受理，等待后台处理' : `申请失败：${response.message}` };
    } catch (error) { result = { type, ids, state: 'unknown', message: `申请结果待确认：${error instanceof Error ? error.message : String(error)}；请到后台核对，勿重复申请` }; }
    if (route === 'EPCC') result.message = `指定网联（EPCC）：${result.message}`;
    results.push(result); onResult(result);
  }
  return results;
}
