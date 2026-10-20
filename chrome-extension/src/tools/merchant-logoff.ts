import { assertMerchantId } from '../api/http';
import { logOffMerchant as sendMerchantLogoff } from '../api/merchant-logoff';

export function validateMerchantLogoffId(rawMerchantId: string): string {
  const merchantId = rawMerchantId.trim();
  assertMerchantId(merchantId);
  return merchantId;
}

export function logOffMerchant(merchantId: string): Promise<string> {
  return sendMerchantLogoff(validateMerchantLogoffId(merchantId));
}

export interface MerchantLogoffBatchResult {
  merchantId: string;
  ok: boolean;
  message?: string;
  error?: string;
}

export async function logOffMerchants(
  merchantIds: string[],
  onResult?: (result: MerchantLogoffBatchResult, completed: number, total: number) => void,
): Promise<MerchantLogoffBatchResult[]> {
  const validatedIds = merchantIds.map(validateMerchantLogoffId);
  const results: MerchantLogoffBatchResult[] = [];

  for (const merchantId of validatedIds) {
    let result: MerchantLogoffBatchResult;
    try {
      result = { merchantId, ok: true, message: await sendMerchantLogoff(merchantId) };
    } catch (error) {
      result = { merchantId, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    results.push(result);
    onResult?.(result, results.length, validatedIds.length);
  }

  return results;
}
