import { ORIGIN, assertMerchantId, buildFormBody, requestJson } from './http';

interface MerchantLogoffResponse {
  code?: number | string;
  respCode?: number | string;
  success?: boolean;
  fail?: boolean;
  errMsg?: string | null;
  error_msg?: string | null;
  respMsg?: string | null;
  msg?: string | null;
}

function responseMessage(response: MerchantLogoffResponse): string {
  return [response.errMsg, response.error_msg, response.respMsg, response.msg]
    .find((value) => typeof value === 'string' && value.trim())?.trim() || '';
}

export async function logOffMerchant(rawMerchantId: string): Promise<string> {
  const merchantId = rawMerchantId.trim();
  assertMerchantId(merchantId);

  let response: MerchantLogoffResponse;
  try {
    response = await requestJson<MerchantLogoffResponse>(`${ORIGIN}/lspos/merchantInfoManager.do?method=merchantLogOff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: buildFormBody({ merchantId, reason: '1' }),
      timeoutMs: 20000,
    });
  } catch (error) {
    throw new Error(`注销结果待确认，请先到后台核实商户 ${merchantId} 的状态，勿直接重复提交：${error instanceof Error ? error.message : String(error)}`);
  }

  const message = responseMessage(response);
  if (response.fail === true || response.success === false
    || (response.code != null && !['1', '0'].includes(String(response.code)))
    || (response.respCode != null && String(response.respCode) !== '0')) {
    throw new Error(message || '后台拒绝了商户注销请求');
  }
  if (response.success === true || String(response.code) === '1' || String(response.respCode) === '0'
    || /注销成功|操作成功/.test(message)) {
    return message || '后台已确认注销成功';
  }
  if (String(response.code) === '0') throw new Error(message || '后台注销失败');
  throw new Error(`后台响应未明确确认注销结果，请到后台核实商户 ${merchantId} 状态：${message || '响应缺少成功标记'}`);
}
