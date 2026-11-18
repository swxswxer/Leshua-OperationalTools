import { SAAS, buildFormBody, normalizeText, requestJson, requestText } from './http';

const ENDPOINT = `${SAAS}/permissionApply.do`;
const FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' };
const STATUS_CODES = new Map([['草稿', 0], ['审批中', 10], ['已驳回', 20], ['待风控复审（存量）', 30], ['已开通', 60], ['已撤销', 70]]);

export interface PermissionApplication {
  applyNo: string;
  status: string;
  statusCode: number | null;
  currentStep: string;
  submittedAt: string;
  round: string;
  canApprove: boolean;
}
export interface PermissionApprovalTask {
  applyNo: string;
  stepId: number | null;
  statusCode: number;
  stepName: string;
  round: string;
}
interface PermissionDetail {
  respCode?: number | string;
  respMsg?: string;
  data?: {
    apply?: { applyNo?: string; status?: number | string; curStepName?: string; round?: number | string };
    steps?: { id?: number | string; status?: number | string; stepName?: string }[] | null;
  };
}

export function normalizePermissionApplyNo(raw: string): string {
  const applyNo = raw.trim();
  if (!/^QX\d+$/.test(applyNo)) throw new Error('请输入 QX 开头的完整权限申请单号');
  return applyNo;
}

export function parsePermissionApplications(html: string, applyNo: string): PermissionApplication[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style').forEach(node => node.remove());
  if (doc.querySelector('input[type="password"]') || /登录|login/i.test(doc.title)) throw new Error('登录已失效，请先登录运营后台');
  if (/没有该项操作权限|权限不足|无权访问/.test(doc.body.textContent || '')) throw new Error('当前账号没有权限工单查询或审核权限');
  const required = ['申请单号', '状态', '当前环节', '提交时间'];
  const table = Array.from(doc.querySelectorAll('table')).find(item => {
    const names = Array.from(item.querySelectorAll('thead th')).map(th => normalizeText(th.textContent));
    return required.every(name => names.includes(name));
  });
  if (!table) throw new Error('未识别到权限申请列表，请到后台核对');
  const headers = Array.from(table.querySelectorAll('thead th')).map(th => normalizeText(th.textContent));
  const rows: PermissionApplication[] = [];
  for (const tr of Array.from(table.querySelectorAll('tbody > tr'))) {
    const cells = Array.from(tr.children);
    const value = (name: string) => normalizeText(cells[headers.indexOf(name)]?.textContent);
    const number = value('申请单号');
    if (!/^QX\d+$/.test(number)) continue;
    if (number !== applyNo) throw new Error('后台返回了不匹配的申请单，请核对查询条件');
    const status = value('状态');
    const statusCode = STATUS_CODES.get(status) ?? null;
    const operation = cells[headers.indexOf('操作')];
    const canApprove = Array.from(operation?.querySelectorAll<HTMLAnchorElement>('a[onclick]') || []).some(link => {
      if (link.style.display === 'none' || link.closest('[hidden]')) return false;
      const match = (link.getAttribute('onclick') || '').match(/^\s*openAudit\(\s*(['"])(QX\d+)\1\s*,\s*(10|30)\s*\)\s*;?\s*$/);
      return !!match && match[2] === number && Number(match[3]) === statusCode;
    });
    rows.push({ applyNo: number, status, statusCode, currentStep: value('当前环节'), submittedAt: value('提交时间'), round: value('轮次'), canApprove });
  }
  if (rows.length > 1) throw new Error('同一申请单返回了多条记录，请到后台核对');
  return rows;
}

export async function queryPermissionApplications(raw: string): Promise<PermissionApplication[]> {
  const applyNo = normalizePermissionApplyNo(raw);
  const html = await requestText(`${ENDPOINT}?method=list`, {
    method: 'POST', headers: FORM_HEADERS, timeoutMs: 15000,
    body: buildFormBody({ applyNo, agentNo: '', applyType: '', status: '', curStepCode: '', agentClass: '', pageSize: 20 }),
  });
  return parsePermissionApplications(html, applyNo);
}

export function parsePermissionApprovalTask(response: PermissionDetail, row: PermissionApplication): PermissionApprovalTask {
  if (String(response?.respCode) !== '0') throw new Error(response?.respMsg || '权限工单详情查询失败');
  const apply = response.data?.apply;
  if (!apply || apply.applyNo !== row.applyNo || ![10, 30].includes(Number(apply.status)) || Number(apply.status) !== row.statusCode) {
    throw new Error('申请单已变更或不处于审批中，请重新查询');
  }
  const round = normalizeText(apply.round || 1);
  if (row.round && round !== row.round) throw new Error('申请单轮次已变更，请重新查询');
  const stepName = normalizeText(apply.curStepName);
  if (stepName && stepName !== row.currentStep) throw new Error('当前审批环节已变更，请重新查询');
  const steps = response.data?.steps;
  if (steps != null && !Array.isArray(steps)) throw new Error('详情未返回有效的审批环节信息');
  let stepId: number | null = null;
  if (steps?.length) {
    const current = steps.filter(step => String(step.status) === '0' && normalizeText(step.stepName) === stepName);
    if (!stepName || current.length !== 1 || !/^\d+$/.test(String(current[0].id))) throw new Error('无法确定唯一的当前审批环节，请到后台核对');
    stepId = Number(current[0].id);
    if (!Number.isSafeInteger(stepId) || stepId <= 0) throw new Error('当前审批环节 ID 无效，请到后台核对');
  }
  return { applyNo: row.applyNo, stepId, statusCode: Number(apply.status), stepName: stepName || row.currentStep, round };
}

export async function getPermissionApprovalTask(row: PermissionApplication): Promise<PermissionApprovalTask> {
  const response = await requestJson<PermissionDetail>(`${ENDPOINT}?method=detail&${buildFormBody({ applyNo: normalizePermissionApplyNo(row.applyNo) })}`, { timeoutMs: 15000 });
  return parsePermissionApprovalTask(response, row);
}

export async function submitPermissionApproval(task: PermissionApprovalTask): Promise<{ accepted: boolean; message: string }> {
  normalizePermissionApplyNo(task.applyNo);
  if (task.stepId !== null && (!Number.isSafeInteger(task.stepId) || task.stepId <= 0)) throw new Error('无效的审批环节 ID');
  const response = await requestJson<{ respCode?: number | string; respMsg?: string }>(`${ENDPOINT}?method=audit`, {
    method: 'POST', timeoutMs: 20000,
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    body: JSON.stringify({ applyNo: task.applyNo, stepId: task.stepId, pass: true, comment: '' }),
  });
  if (response?.respCode == null) throw new Error('后台未返回审批结果码');
  return { accepted: String(response.respCode) === '0', message: response.respMsg || '后台未提供审批说明' };
}
