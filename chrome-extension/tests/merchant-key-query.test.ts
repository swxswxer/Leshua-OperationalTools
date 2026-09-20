import { beforeEach, expect, it, vi } from 'vitest';
import { configureMerchantKey, queryMerchantKey } from '../src/api/merchant-key';
import { configureMerchantKeys } from '../src/tools/merchant-key';

vi.mock('../src/api/merchant-key', () => ({ configureMerchantKey: vi.fn(), queryMerchantKey: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
it('配置成功后查询，不在日志输出 key', async () => {
  vi.mocked(queryMerchantKey).mockResolvedValue('mock-secret');
  const log = vi.fn();
  const results = await configureMerchantKeys(['1234567890'], log);
  expect(results[0]).toEqual({ merchantId: '1234567890', ok: true, key: 'mock-secret' });
  expect(vi.mocked(configureMerchantKey).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(queryMerchantKey).mock.invocationCallOrder[0]);
  expect(JSON.stringify(log.mock.calls)).not.toContain('mock-secret');
});
it('配置失败仍查询已有 key，保留两个结果', async () => {
  vi.mocked(configureMerchantKey).mockRejectedValue(new Error('已存在'));
  vi.mocked(queryMerchantKey).mockResolvedValue('existing-secret');
  expect((await configureMerchantKeys(['1234567890'], vi.fn()))[0]).toEqual({
    merchantId: '1234567890', ok: false, error: '已存在', key: 'existing-secret',
  });
});
it('查询失败不会丢失配置结果或其他商户结果', async () => {
  vi.mocked(queryMerchantKey).mockRejectedValueOnce(new Error('权限不足')).mockResolvedValueOnce('key-2');
  const results = await configureMerchantKeys(['1234567890', '2345678901'], vi.fn());
  expect(results[0]).toMatchObject({ ok: true, queryError: '权限不足' });
  expect(results[1]).toMatchObject({ merchantId: '2345678901', key: 'key-2' });
});
