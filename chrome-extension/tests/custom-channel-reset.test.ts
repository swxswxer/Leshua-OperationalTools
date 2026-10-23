import { beforeEach, expect, it, vi } from 'vitest';
import { runCustomChannelReset } from '../src/tools/custom-channel-reset';
import { submitCustomAlipayReport, submitCustomWechatReport } from '../src/api/report';
import { confirmAlipayEnabled, confirmWechatEnabled, disableOldAlipayMappings, disableOldWechatMappings } from '../src/api/notification-status';
import { bindWechatPaymentConfig } from '../src/api/payment-config';
import type { ReportOptions } from '../src/types';
import type { MerchantReportResult } from '../src/api/quick-report';

vi.mock('../src/api/report', async original => ({
  ...await original<typeof import('../src/api/report')>(),
  submitCustomWechatReport: vi.fn(), submitCustomAlipayReport: vi.fn(),
}));
vi.mock('../src/api/notification-status', () => ({
  confirmWechatEnabled: vi.fn(), confirmAlipayEnabled: vi.fn(),
  disableOldWechatMappings: vi.fn(), disableOldAlipayMappings: vi.fn(),
}));
vi.mock('../src/api/payment-config', () => ({ bindWechatPaymentConfig: vi.fn() }));

const options: ReportOptions = {
  channelId: '', channelName: '', sourcePid: '', sourceName: '',
  subAppids: 'wx123', jsapiPaths: '', disableOldSubMch: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(submitCustomWechatReport).mockImplementation(async id => `9${id}`);
  vi.mocked(submitCustomAlipayReport).mockImplementation(async id => `2088${id}`);
  vi.mocked(confirmWechatEnabled).mockResolvedValue([]);
  vi.mocked(confirmAlipayEnabled).mockResolvedValue([]);
  vi.mocked(disableOldWechatMappings).mockResolvedValue(1);
  vi.mocked(disableOldAlipayMappings).mockResolvedValue(1);
});

it('旧流程每批最多 4 个商户并发，每个商户的微信支付宝仍并行，并即时显示新号', async () => {
  const ids = Array.from({ length: 9 }, (_, index) => String(1000000000 + index));
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  const first = new Promise<void>(resolve => { releaseFirst = resolve; });
  const second = new Promise<void>(resolve => { releaseSecond = resolve; });
  const waitForBatch = async (id: string) => {
    await (ids.indexOf(id) < 4 ? first : ids.indexOf(id) < 8 ? second : Promise.resolve());
    return [];
  };
  vi.mocked(confirmWechatEnabled).mockImplementation(waitForBatch);
  vi.mocked(confirmAlipayEnabled).mockImplementation(waitForBatch);
  const update = vi.fn();
  const task = runCustomChannelReset(ids, 'ALL', options, vi.fn(), update, 'lhsd');
  await vi.waitFor(() => expect(confirmAlipayEnabled).toHaveBeenCalledTimes(4));
  expect(confirmWechatEnabled).toHaveBeenCalledTimes(4);
  expect(vi.mocked(submitCustomWechatReport).mock.calls.map(call => call[0])).toEqual(ids.slice(0, 4));
  expect(disableOldWechatMappings).not.toHaveBeenCalled();
  const preview = update.mock.calls.at(-1)?.[0] as MerchantReportResult[];
  expect(preview.map(value => value.merchantId)).toEqual(ids);
  expect(preview[0].wechat.subMchId).toBe(`9${ids[0]}`);
  expect(preview[4].wechat.state).toBe('pending');

  releaseFirst();
  await vi.waitFor(() => expect(confirmAlipayEnabled).toHaveBeenCalledTimes(8));
  expect(submitCustomWechatReport).toHaveBeenCalledTimes(8);
  expect(bindWechatPaymentConfig).toHaveBeenCalledTimes(4);
  releaseSecond();
  const values = await task;
  expect(submitCustomWechatReport).toHaveBeenCalledTimes(9);
  expect(submitCustomAlipayReport).toHaveBeenCalledTimes(9);
  expect(values.map(value => value.merchantId)).toEqual(ids);
  expect(values.every(value => value.wechat.state === 'success' && value.alipay.state === 'success')).toBe(true);
  expect(disableOldWechatMappings).toHaveBeenCalledTimes(9);
  expect(disableOldAlipayMappings).toHaveBeenCalledTimes(9);
  expect(bindWechatPaymentConfig).toHaveBeenCalledTimes(9);
});

it('单商户失败后继续后续批次，取消禁用旧号时所有商户均跳过关闭步骤', async () => {
  const ids = Array.from({ length: 5 }, (_, index) => String(1000000000 + index));
  vi.mocked(submitCustomWechatReport).mockImplementation(async id => {
    if (id === ids[1]) throw new Error('上报失败');
    return `9${id}`;
  });
  const values = await runCustomChannelReset(ids, 'WECHAT', { ...options, disableOldSubMch: false }, vi.fn(), vi.fn(), 'syt');
  expect(submitCustomWechatReport).toHaveBeenCalledTimes(5);
  expect(submitCustomAlipayReport).not.toHaveBeenCalled();
  expect(values[1].wechat).toMatchObject({ state: 'failure', error: '上报失败' });
  expect(values[4].wechat.state).toBe('success');
  expect(values.every(value => value.alipay.state === 'skipped')).toBe(true);
  expect(disableOldWechatMappings).not.toHaveBeenCalled();
  expect(disableOldAlipayMappings).not.toHaveBeenCalled();
  expect(bindWechatPaymentConfig).toHaveBeenCalledTimes(4);
});
