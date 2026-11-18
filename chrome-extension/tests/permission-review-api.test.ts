import { beforeEach, expect, it, vi } from 'vitest';
import { parsePermissionApprovalTask, submitPermissionApproval, type PermissionApplication } from '../src/api/permission-review';
import { requestJson } from '../src/api/http';

vi.mock('../src/api/http', async original => ({ ...await original<typeof import('../src/api/http')>(), requestJson: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
const row: PermissionApplication = { applyNo: 'QX2026111616939446', status: '审批中', statusCode: 10, currentStep: '运营审批', submittedAt: '', round: '2', canApprove: true };
const detail = () => ({ respCode: 0, data: { apply: { applyNo: row.applyNo, status: 10, curStepName: '运营审批', round: 2 }, steps: [
  { id: 9001, status: 1, stepName: '业务审批' }, { id: 9002, status: 0, stepName: '运营审批' }, { id: 9003, status: 0, stepName: '风控审批' },
] } });

it('从当前未处理环节取动态 ID，忽略已通过和后续环节', () => {
  expect(parsePermissionApprovalTask(detail(), row)).toMatchObject({ applyNo: row.applyNo, stepId: 9002 });
});
it('当前环节不唯一、缺失或已处理时拒绝审核', () => {
  const value = detail();
  value.data.steps.push({ id: 9004, status: 0, stepName: '运营审批' });
  expect(() => parsePermissionApprovalTask(value, row)).toThrow('唯一');
  value.data.steps = [{ id: 9002, status: 1, stepName: '运营审批' }];
  expect(() => parsePermissionApprovalTask(value, row)).toThrow('唯一');
});
it('详情的申请单、状态、环节和轮次必须与本次列表一致', () => {
  for (const apply of [
    { ...detail().data.apply, applyNo: 'QX99999' },
    { ...detail().data.apply, status: 60 },
    { ...detail().data.apply, curStepName: '风控审批' },
    { ...detail().data.apply, round: 3 },
  ]) expect(() => parsePermissionApprovalTask({ ...detail(), data: { ...detail().data, apply } }, row)).toThrow('变更');
});
it('存量单没有环节实例时按后台约定传 null', () => {
  const value = detail(); value.data.steps = [];
  expect(parsePermissionApprovalTask(value, row).stepId).toBeNull();
});
it('审核 JSON 只提交所查动态 stepId、pass=true 和空意见', async () => {
  vi.mocked(requestJson).mockResolvedValue({ respCode: 0, respMsg: '审批通过' });
  const task = parsePermissionApprovalTask(detail(), row);
  expect(await submitPermissionApproval(task)).toEqual({ accepted: true, message: '审批通过' });
  const [url, options] = vi.mocked(requestJson).mock.calls[0];
  expect(url).toBe('https://om.leshuazf.com/saasadmin/permissionApply.do?method=audit');
  expect(options?.method).toBe('POST');
  expect(JSON.parse(String(options?.body))).toEqual({ applyNo: row.applyNo, stepId: 9002, pass: true, comment: '' });
});
it('只有 respCode=0 确认成功，保留后台拒绝原因和未知响应', async () => {
  const task = parsePermissionApprovalTask(detail(), row);
  vi.mocked(requestJson).mockResolvedValueOnce({ respCode: 1, respMsg: '不是当前审批人' });
  expect(await submitPermissionApproval(task)).toEqual({ accepted: false, message: '不是当前审批人' });
  vi.mocked(requestJson).mockResolvedValueOnce({});
  await expect(submitPermissionApproval(task)).rejects.toThrow('结果码');
});
