import { beforeEach, expect, it, vi } from 'vitest';
import { runBatchReset } from '../src/tools/batch-reset';
import { submitQuickReport, type MerchantReportResult } from '../src/api/quick-report';
import { queryLatestReportFailure } from '../src/api/report';
import { bindWechatPaymentConfig } from '../src/api/payment-config';
import type { ReportOptions } from '../src/types';

vi.mock('../src/api/quick-report', async original => ({
  ...await original<typeof import('../src/api/quick-report')>(), submitQuickReport: vi.fn(),
}));
vi.mock('../src/api/report', () => ({ queryLatestReportFailure: vi.fn() }));
vi.mock('../src/api/payment-config', () => ({ bindWechatPaymentConfig: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
const options = {} as ReportOptions;
function result(): MerchantReportResult {
  return { merchantId: '5269812733', route: 'batch', wechat: { state: 'success', subMchId: '123' }, alipay: { state: 'failure', error: '上报失败' } };
}
it('只查询失败通道，原因进入结果用于展示和复制', async () => {
  vi.mocked(submitQuickReport).mockResolvedValue([result()]);
  vi.mocked(queryLatestReportFailure).mockResolvedValue({ reason: '类目不符', time: '2026-09-20' });
  const [value] = await runBatchReset(['5269812733'], 'ALL', options, vi.fn(), 'COMMON');
  expect(queryLatestReportFailure).toHaveBeenCalledExactlyOnceWith('5269812733', 'alipay');
  expect(value.alipay.error).toContain('类目不符');
  expect(value.wechat.state).toBe('success');
  expect(value.businessLine).toBe('lhsd');
});
it('查询失败仍返回批量结果并继续成功微信号的绑定', async () => {
  vi.mocked(submitQuickReport).mockResolvedValue([result()]);
  vi.mocked(queryLatestReportFailure).mockRejectedValue(new Error('权限不足'));
  const [value] = await runBatchReset(['5269812733'], 'ALL', { ...options, subAppids: 'wx123' }, vi.fn());
  expect(value.alipay.error).toContain('上报失败；失败原因查询异常：权限不足');
  expect(bindWechatPaymentConfig).toHaveBeenCalled();
});
it('成功和未执行通道不额外查询', async () => {
  const value = result(); value.alipay = { state: 'skipped' };
  vi.mocked(submitQuickReport).mockResolvedValue([value]);
  await runBatchReset(['5269812733'], 'WECHAT', options, vi.fn());
  expect(queryLatestReportFailure).not.toHaveBeenCalled();
});
