import { SYT_OMS, assertMerchantId, requestJson } from './http';

interface MerchantPaidAdResponse {
  returnCode?: string | number;
  returnDesc?: string | null;
  data?: unknown;
}

export async function closeMerchantPaidAd(merchantId: string): Promise<string> {
  assertMerchantId(merchantId);
  let response: MerchantPaidAdResponse;
  try {
    response = await requestJson<MerchantPaidAdResponse>(`${SYT_OMS}/merchantPaidAd/batchAdd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      body: JSON.stringify({ merchantIds: merchantId }),
      timeoutMs: 20000,
    });
  } catch (error) {
    throw new Error(`关闭广告请求结果待确认，请先核实商户 ${merchantId} 状态，勿直接重复提交：${error instanceof Error ? error.message : String(error)}`);
  }

  const message = String(response?.returnDesc || '').trim();
  if (String(response?.returnCode) !== '0') {
    throw new Error(message || `后台拒绝请求，returnCode=${String(response?.returnCode ?? '缺失')}`);
  }

  const successCount = message.match(/成功条数\s*[：:]\s*(\d+)/)?.[1];
  const failureCount = message.match(/失败条数\s*[：:]\s*(\d+)/)?.[1];
  if (failureCount != null && Number(failureCount) > 0) {
    throw new Error(`${message || '后台处理失败'}；失败文件详情请查看下载中心`);
  }
  if (successCount != null && Number(successCount) < 1) {
    throw new Error(`${message || '后台未确认成功条数'}；请到后台核实处理结果`);
  }
  if (!message) throw new Error('后台未返回操作说明，请到后台核实处理结果');
  return message;
}
