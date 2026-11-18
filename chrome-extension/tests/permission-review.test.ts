import { beforeEach, expect, it, vi } from 'vitest';
import { PermissionReview } from '../src/tools/permission-review';
import * as api from '../src/api/permission-review';

vi.mock('../src/api/permission-review', async original => ({
  ...await original<typeof import('../src/api/permission-review')>(),
  queryPermissionApplications: vi.fn(), getPermissionApprovalTask: vi.fn(), submitPermissionApproval: vi.fn(),
}));
const row: api.PermissionApplication = { applyNo: 'QX2026111616939446', status: '审批中', statusCode: 10, currentStep: '运营审批', submittedAt: '2026-11-16 10:57:50', round: '2', canApprove: true };
const task: api.PermissionApprovalTask = { applyNo: row.applyNo, stepId: 7788, statusCode: 10, stepName: row.currentStep, round: '2' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.queryPermissionApplications).mockResolvedValue([row]);
  vi.mocked(api.getPermissionApprovalTask).mockResolvedValue(task);
  vi.mocked(api.submitPermissionApproval).mockResolvedValue({ accepted: true, message: '审批通过' });
});

it('查询号码必须是完整 QX 申请单号', () => {
  expect(api.normalizePermissionApplyNo(` ${row.applyNo} `)).toBe(row.applyNo);
  expect(() => api.normalizePermissionApplyNo('RC12345')).toThrow('QX');
  expect(() => api.normalizePermissionApplyNo('')).toThrow('QX');
});
it('审核前重新查询列表与动态环节，只提交当前环节一次', async () => {
  const review = new PermissionReview();
  expect(await review.approve(row)).toEqual({ state: 'success', message: '审批通过' });
  expect(api.queryPermissionApplications).toHaveBeenCalledWith(row.applyNo);
  expect(api.getPermissionApprovalTask).toHaveBeenCalledWith(row);
  expect(api.submitPermissionApproval).toHaveBeenCalledExactlyOnceWith(task);
  await expect(review.approve(row)).rejects.toThrow('勿重复审核');
  expect(api.submitPermissionApproval).toHaveBeenCalledTimes(1);
});
it.each([
  { ...row, currentStep: '风控审批' },
  { ...row, round: '3' },
  { ...row, statusCode: 60, status: '已开通' },
  { ...row, canApprove: false },
])('列表状态、环节或轮次变动时不提交审核', async latest => {
  vi.mocked(api.queryPermissionApplications).mockResolvedValue([latest]);
  await expect(new PermissionReview().approve(row)).rejects.toThrow('变更');
  expect(api.submitPermissionApproval).not.toHaveBeenCalled();
});
it('详情获取失败不提交审核，不复用示例 stepId', async () => {
  vi.mocked(api.getPermissionApprovalTask).mockRejectedValue(new Error('无法确定当前环节'));
  await expect(new PermissionReview().approve(row)).rejects.toThrow('无法确定');
  expect(api.submitPermissionApproval).not.toHaveBeenCalled();
});
it('请求超时只记录待确认，不重复提交', async () => {
  vi.mocked(api.submitPermissionApproval).mockRejectedValue(new Error('请求超时'));
  const review = new PermissionReview();
  expect(await review.approve(row)).toMatchObject({ state: 'unknown', message: expect.stringContaining('请求超时') });
  await expect(review.approve(row)).rejects.toThrow('勿重复审核');
  expect(api.submitPermissionApproval).toHaveBeenCalledTimes(1);
});
it('后台明确拒绝会显示原因，用户再次操作时可重新校验', async () => {
  vi.mocked(api.submitPermissionApproval).mockResolvedValueOnce({ accepted: false, message: '不是该环节审批人' });
  const review = new PermissionReview();
  expect(await review.approve(row)).toMatchObject({ state: 'failed', message: expect.stringContaining('不是该环节审批人') });
  expect((await review.approve(row)).state).toBe('success');
});
it('同一申请单进入新环节后，必须由用户再次点击才会提交新环节', async () => {
  const review = new PermissionReview();
  await review.approve(row);
  const next = { ...row, currentStep: '风控审批' };
  vi.mocked(api.queryPermissionApplications).mockResolvedValue([next]);
  vi.mocked(api.getPermissionApprovalTask).mockResolvedValue({ ...task, stepId: 8899, stepName: '风控审批' });
  expect(api.submitPermissionApproval).toHaveBeenCalledTimes(1);
  await review.approve(next);
  expect(api.submitPermissionApproval).toHaveBeenCalledTimes(2);
});
