import { SYT_OMS, requestJson } from './http';

interface ResponsePayload { error_code?: string | number; error_msg?: string }

export type WhitelistDataType = '1' | '2' | '3' | '4';

export async function addMerchantChangeWhitelist(dataType: WhitelistDataType, dataValue: string): Promise<void> {
  const response = await requestJson<ResponsePayload>(`${SYT_OMS}/merchantChange/addMerchantChangeWhitelist`, {
    method: 'POST', timeoutMs: 15000,
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    body: JSON.stringify({ dataType, dataValue }),
  });
  if (String(response.error_code) !== '0') throw new Error(response.error_msg || '防切户白名单添加失败');
}
