import { beforeEach, expect, it, vi } from 'vitest';
import { ReviewSession, assertSimpleApproval, validateTicketQuery } from '../src/tools/ticket-review';
import * as api from '../src/api/ticket-review';
vi.mock('../src/api/ticket-review', () => ({ queryTickets: vi.fn(), queryTask: vi.fn(), openReview: vi.fn(), getAppealInfo: vi.fn(), releaseReview: vi.fn(), submitReview: vi.fn() }));
const row = { ticketNumber: 'RC20260001', merchantId: '0123456789', merchantName: '测试商户', state: '处理中', node: '运营审核' };
const task = { ticketNumber: row.ticketNumber, formKey: 'riskchecks_operation_manager_check', flowTaskId: '123', upcomingProcessId: '456' };
const info = { riskSource: 2, appealType: 3, mtlVerifyStatus: 2, merchantAuthenticity: 1, merchantTxnType: 2 };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.queryTickets).mockResolvedValue({ rows: [row], more: false });
  vi.mocked(api.queryTask).mockResolvedValue(task);
  vi.mocked(api.getAppealInfo).mockResolvedValue(info);
});
it('商户号保留前导零，拒绝无效查询', () => {
  expect(validateTicketQuery('merchant', ' 0123456789 ')).toBe('0123456789');
  expect(() => validateTicketQuery('merchant', '123')).toThrow();
  expect(() => validateTicketQuery('ticket', 'x')).toThrow();
});
it('只开放信息完整的简化通过场景', () => {
  expect(() => assertSimpleApproval(info)).not.toThrow();
  for (const appealType of [1, 2, null]) expect(() => assertSimpleApproval({ ...info, appealType })).toThrow('后台完整');
  expect(() => assertSimpleApproval({ ...info, mtlVerifyStatus: 6 })).toThrow();
  expect(() => assertSimpleApproval({ ...info, merchantTxnType: '' })).toThrow();
});
it('通过后确认状态并释放本次锁', async () => {
  const session = new ReviewSession(row); await session.prepare();
  expect(await session.submit(true, ' 已核验 ')).toContain('审核提交成功');
  expect(api.submitReview).toHaveBeenCalledWith(task, info, '已核验');
  await session.close(); expect(api.releaseReview).toHaveBeenCalledWith(task);
  await expect(session.submit(true, '再次')).rejects.toThrow();
});
it('必须主动勾选并填写备注', async () => {
  const session = new ReviewSession(row); await session.prepare();
  await expect(session.submit(false, '备注')).rejects.toThrow();
  await expect(session.submit(true, ' ')).rejects.toThrow();
  expect(api.submitReview).not.toHaveBeenCalled();
});
it('任务变更不提交', async () => {
  const session = new ReviewSession(row); await session.prepare();
  vi.mocked(api.queryTask).mockResolvedValue({ ...task, flowTaskId: '999' });
  await expect(session.submit(true, '备注')).rejects.toThrow('已变化');
  expect(api.submitReview).not.toHaveBeenCalled();
});
it('超时不重试，仍可释放锁', async () => {
  const session = new ReviewSession(row); await session.prepare();
  vi.mocked(api.submitReview).mockRejectedValue(new Error('请求超时'));
  await expect(session.submit(true, '备注')).rejects.toThrow('勿直接重复');
  await expect(session.submit(true, '备注')).rejects.toThrow('不可重复');
  expect(api.submitReview).toHaveBeenCalledTimes(1);
  await session.close(); expect(api.releaseReview).toHaveBeenCalledTimes(1);
});
it('读取特殊申诉后仍释放已取得的锁，无法打开页面时不乱解锁', async () => {
  const session = new ReviewSession(row);
  vi.mocked(api.getAppealInfo).mockResolvedValue({ ...info, appealType: 1 });
  await expect(session.prepare()).rejects.toThrow();
  await session.close(); expect(api.releaseReview).toHaveBeenCalledTimes(1);
  vi.mocked(api.releaseReview).mockClear();
  vi.mocked(api.openReview).mockRejectedValue(new Error('被占用'));
  const blocked = new ReviewSession(row); await expect(blocked.prepare()).rejects.toThrow();
  await blocked.close(); expect(api.releaseReview).not.toHaveBeenCalled();
});
it('后台确认成功后查询失败，不误报审核失败', async () => {
  const session = new ReviewSession(row); await session.prepare();
  vi.mocked(api.queryTickets).mockRejectedValue(new Error('网络故障'));
  expect(await session.submit(true, '备注')).toContain('审核提交成功；后续状态查询失败');
});
