import type { LegacyApi, LogHandler } from '../content/contracts';

export async function configureMerchantKey(api: LegacyApi, merchantId: string, log: LogHandler): Promise<void> {
  log(`开始配置商户 ${merchantId} 的 key`);
  await api.configureMerchantKey(merchantId);
  log('商户 key 配置完成');
}
