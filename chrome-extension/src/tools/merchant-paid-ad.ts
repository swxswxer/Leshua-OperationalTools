import { assertMerchantId } from '../api/http';
import { closeMerchantPaidAd as submitCloseMerchantPaidAd } from '../api/merchant-paid-ad';

export interface MerchantPaidAdResult {
  merchantId: string;
  ok: boolean;
  message?: string;
  error?: string;
}

export async function closeMerchantPaidAds(
  merchantIds: string[],
  onResult?: (result: MerchantPaidAdResult, completed: number, total: number) => void,
): Promise<MerchantPaidAdResult[]> {
  merchantIds.forEach(assertMerchantId);
  const results: MerchantPaidAdResult[] = [];

  for (const merchantId of merchantIds) {
    let result: MerchantPaidAdResult;
    try {
      result = { merchantId, ok: true, message: await submitCloseMerchantPaidAd(merchantId) };
    } catch (error) {
      result = { merchantId, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    results.push(result);
    onResult?.(result, results.length, merchantIds.length);
  }

  return results;
}
