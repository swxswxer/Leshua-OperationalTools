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
beforeEach(() => vi.resetAllMocks());
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

function successfulResult(merchantId: string): MerchantReportResult {
  return {
    merchantId, route: 'batch',
    wechat: { state: 'success', subMchId: `9${merchantId}` },
    alipay: { state: 'success', subMchId: `2088${merchantId}` },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

it('新接口按 5 个拆分并发提交，每个成功微信号继续绑定', async () => {
  const ids = Array.from({ length: 12 }, (_, index) => String(1000000000 + index));
  vi.mocked(submitQuickReport).mockImplementation(async batchIds => batchIds.map(successfulResult));
  const values = await runBatchReset(ids, 'ALL', { ...options, subAppids: 'wx123' }, vi.fn(), 'COMMON');
  expect(vi.mocked(submitQuickReport).mock.calls).toEqual([
    [ids.slice(0, 5), 'ALL', 'COMMON'],
    [ids.slice(5, 10), 'ALL', 'COMMON'],
    [ids.slice(10), 'ALL', 'COMMON'],
  ]);
  expect(values.map(value => value.merchantId)).toEqual(ids);
  expect(values.every(value => value.businessLine === 'lhsd')).toBe(true);
  expect(bindWechatPaymentConfig).toHaveBeenCalledTimes(12);
  for (const merchantId of ids) {
    expect(bindWechatPaymentConfig).toHaveBeenCalledWith(merchantId, `9${merchantId}`, expect.objectContaining({ subAppids: 'wx123' }));
  }
});

it('各批同时执行，乱序响应与单批请求失败不丢失其他商户的结果', async () => {
  const ids = Array.from({ length: 11 }, (_, index) => String(1000000000 + index));
  const batches = [deferred<MerchantReportResult[]>(), deferred<MerchantReportResult[]>(), deferred<MerchantReportResult[]>()];
  let cursor = 0;
  vi.mocked(submitQuickReport).mockImplementation(() => batches[cursor++].promise);
  const update = vi.fn();
  const task = runBatchReset(ids, 'ALL', options, vi.fn(), 'SYT', update);
  expect(submitQuickReport).toHaveBeenCalledTimes(3);

  batches[2].resolve(ids.slice(10).map(successfulResult));
  await vi.waitFor(() => expect(update.mock.calls.at(-1)?.[0][10].wechat.state).toBe('success'));
  expect(update.mock.calls.at(-1)?.[0].map((value: MerchantReportResult) => value.merchantId)).toEqual(ids);
  expect(update.mock.calls.at(-1)?.[0][0].wechat.state).toBe('pending');

  batches[1].reject(new Error('请求超时'));
  batches[0].resolve(ids.slice(0, 5).map(successfulResult));
  const values = await task;
  expect(values.map(value => value.merchantId)).toEqual(ids);
  expect(values.slice(0, 5).every(value => value.wechat.state === 'success')).toBe(true);
  expect(values.slice(5, 10).every(value => value.wechat.error?.includes('请求超时') && value.alipay.state === 'failure')).toBe(true);
  expect(values[10].wechat.state).toBe('success');
});

it('失败批次只标记用户选择的通道，其他批次仍可补充失败原因', async () => {
  const ids = Array.from({ length: 6 }, (_, index) => String(1000000000 + index));
  vi.mocked(submitQuickReport).mockRejectedValueOnce(new Error('网络中断')).mockResolvedValueOnce([
    { merchantId: ids[5], route: 'batch', wechat: { state: 'skipped' }, alipay: { state: 'failure', error: '上报失败' } },
  ]);
  vi.mocked(queryLatestReportFailure).mockResolvedValue({ reason: '类目不符', time: '2026-10-23' });
  const values = await runBatchReset(ids, 'ALIPAY', options, vi.fn());
  expect(values.every(value => value.wechat.state === 'skipped')).toBe(true);
  expect(values[5].alipay.error).toContain('类目不符');
  expect(queryLatestReportFailure).toHaveBeenCalledExactlyOnceWith(ids[5], 'alipay');
});
