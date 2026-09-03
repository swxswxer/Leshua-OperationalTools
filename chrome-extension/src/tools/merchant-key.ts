import type { LogHandler } from '../types';
import { configureMerchantKey as configureMerchantKeyRequest } from '../api/merchant-key';

const CONCURRENCY = 5;

export interface MerchantKeyBatchResult {
  merchantId: string;
  ok: boolean;
  error?: string;
}

export function parseMerchantKeyIds(raw: string): string[] {
  const merchantIds = raw.split(';').map((item) => item.trim()).filter(Boolean);
  if (!merchantIds.length) throw new Error('请至少输入一个乐刷商户号');
  const duplicates = merchantIds.filter((item, index) => merchantIds.indexOf(item) !== index);
  if (duplicates.length) throw new Error(`乐刷商户号重复: ${duplicates[0]}`);
  const invalid = merchantIds.find((item) => !/^\d{10}$/.test(item));
  if (invalid) throw new Error(`乐刷商户号必须是 10 位数字: ${invalid}`);
  return merchantIds;
}

export async function configureMerchantKeys(
  merchantIds: string[],
  log: LogHandler,
): Promise<MerchantKeyBatchResult[]> {
  log(`开始批量配置 ${merchantIds.length} 个商户的 key`);
  const results: MerchantKeyBatchResult[] = [];
  let cursor = 0;

  const worker = async () => {
    while (cursor < merchantIds.length) {
      const index = cursor;
      cursor += 1;
      const merchantId = merchantIds[index];
      try {
        await configureMerchantKeyRequest(merchantId);
        results[index] = { merchantId, ok: true };
        log(`商户 ${merchantId} key 配置成功`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results[index] = { merchantId, ok: false, error: message };
        log(`商户 ${merchantId} key 配置失败: ${message}`, true);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, merchantIds.length) }, () => worker()));
  const failures = results.filter((result) => !result.ok);
  if (failures.length) {
    const details = failures.map((result) => `${result.merchantId}: ${result.error}`).join('；');
    throw new Error(`商户 key 批量配置完成，成功 ${results.length - failures.length} 个，失败 ${failures.length} 个。${details}`);
  }
  log(`商户 key 批量配置完成，共成功 ${results.length} 个`);
  return results;
}
