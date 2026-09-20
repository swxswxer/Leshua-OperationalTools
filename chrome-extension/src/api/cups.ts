import { ORIGIN, USER_CENTER, detectHtmlError, requestMultipartText, requestText } from './http';

export interface CupsSubmissionResult {
  state: 'accepted' | 'unknown';
  message: string;
}

export async function getCupsApplicant(): Promise<string> {
  const html = await requestText(`${USER_CENTER}/userInfo.do?method=loaddata`, { cache: 'no-store', timeoutMs: 15000 });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const account = doc.querySelector<HTMLInputElement>('input[name="usercode"]')?.value.trim();
  if (!account) throw new Error(detectHtmlError(html) || '无法获取当前登录账号，请先登录运营后台');
  return account;
}

export function parseCupsResponse(text: string): CupsSubmissionResult {
  let response: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    response = value as Record<string, unknown>;
  } catch {
    const error = detectHtmlError(text);
    if (error) throw new Error(error);
    return { state: 'unknown', message: '请求已发送，但无法确认后台是否受理，请到后台核实，勿重复提交' };
  }
  const message = [response.error_msg, response.errMsg, response.respMsg, response.message, response.msg]
    .find((value) => typeof value === 'string' && value.trim()) as string | undefined;
  // 后台成功示例为 code: 1、success: true，不能把 code: 1 当作失败。
  if (response.success === false || response.fail === true
    || (response.error_code != null && String(response.error_code) !== '0')) {
    throw new Error(message || '后台拒绝了 CUPS 上报申请');
  }
  if (response.success === true) {
    return { state: 'accepted', message: `CUPS 上报申请已受理${message ? `：${message}` : ''}（不代表最终上报完成）` };
  }
  return { state: 'unknown', message: `请求已发送，但受理状态待确认${message ? `：${message}` : ''}。请到后台核实，勿重复提交` };
}

export async function submitCupsApplication(file: File, applicant: string): Promise<CupsSubmissionResult> {
  if (!applicant.trim()) throw new Error('缺少申请人账号');
  let response: string;
  try {
    response = await requestMultipartText(`${ORIGIN}/lspos/cups.do?method=batchGenerateAndBind`, {
      applicant, reason: '1', channelType: '1', merchantType: 'undefined',
    }, 'file', file, 30000, { Accept: 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' });
  } catch (error) {
    throw new Error(`提交请求异常，受理状态未知，请先到后台核实，勿重复提交：${error instanceof Error ? error.message : String(error)}`);
  }
  return parseCupsResponse(response);
}
