import type { LegacyApi, LogHandler } from '../content/contracts';

export async function enableOnlineReceipt(api: LegacyApi, merchantId: string, log: LogHandler): Promise<void> {
  log(`开始开通商户 ${merchantId} 的在线收款单`);
  await api.enableOnlineReceipt(merchantId, { onLog: log });
  log('在线收款单开通完成');
}
