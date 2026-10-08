import { ORIGIN, USER_CENTER, assertMerchantId, buildFormBody, detectHtmlError, normalizeText, requestMultipartText, requestText } from './http';

export interface CupsSubmissionResult {
  state: 'accepted' | 'unknown';
  message: string;
}

export interface CupsRecord {
  importStatus: string;
  failureReason: string;
  merchantId: string;
  cupsId: string;
  channelMerchantStatus: string;
  leshuaMerchantStatus: string;
}

export function parseCupsRecords(html: string): CupsRecord[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style').forEach(node => node.remove());
  if (doc.querySelector('input[type="password"]') || /登录|login/i.test(doc.title)) throw new Error('登录已失效，请先登录运营后台');
  const required = ['导入状态', '上报失败原因', '商户编号', 'cupsID', '通道商户状态', '商户乐刷状态'];
  const table = Array.from(doc.querySelectorAll('table')).find(candidate => {
    const headings = Array.from(candidate.querySelectorAll('thead th')).map(th => normalizeText(th.textContent));
    return required.every(heading => headings.includes(heading));
  });
  if (!table) {
    const body = normalizeText(doc.body.textContent);
    if (/没有该项操作权限|权限不足|无权访问/.test(body)) throw new Error('当前账号没有查询 CUPS 记录的权限');
    throw new Error(detectHtmlError(html) || '后台返回未知页面，无法读取 CUPS 记录');
  }
  const headings = Array.from(table.querySelectorAll('thead th')).map(th => normalizeText(th.textContent));
  const value = (cells: Element[], heading: string) => {
    const cell = cells[headings.indexOf(heading)];
    if (!cell) return '';
    return cell.querySelector<HTMLElement>('[title]')?.title.trim() || normalizeText(cell.textContent);
  };
  const rows: CupsRecord[] = [];
  table.querySelectorAll('tbody tr').forEach(tr => {
    const cells = Array.from(tr.children);
    const row = {
      importStatus: value(cells, '导入状态'),
      failureReason: value(cells, '上报失败原因'),
      merchantId: value(cells, '商户编号'),
      cupsId: value(cells, 'cupsID'),
      channelMerchantStatus: value(cells, '通道商户状态'),
      leshuaMerchantStatus: value(cells, '商户乐刷状态'),
    };
    if (row.merchantId) rows.push(row);
  });
  return rows;
}

export async function queryCupsRecords(rawMerchantId: string): Promise<CupsRecord[]> {
  const merchantId = rawMerchantId.trim();
  assertMerchantId(merchantId);
  const body = buildFormBody({
    channelTimeRange: '', status: '', merchantId, cupsId: '', license: '', agentId1g: '', spId: '', agentClass: '',
    state: '', flag: '', merchantStatus: '', mccCode: '', merchantNature: '', reportType: '', isReuseMerchant: '',
    addressSearch: '', province: '', city: '', area: '', beginLevel: '', endLevel: '', tradeStatus: '', pageSize: 20,
  });
  const html = await requestText(`${ORIGIN}/lspos/cups.do?method=channelCupsList`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body,
  });
  const rows = parseCupsRecords(html);
  if (rows.some(row => row.merchantId !== merchantId)) throw new Error('后台返回了其他商户的 CUPS 记录，请核对查询条件');
  return rows;
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
