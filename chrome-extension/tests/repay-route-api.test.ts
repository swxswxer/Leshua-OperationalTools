import { beforeEach, expect, it, vi } from 'vitest';
import { applyRepay, applyRepayWithRoute } from '../src/api/repay';
import { requestText } from '../src/api/http';

vi.mock('../src/api/http', async original => ({ ...await original<typeof import('../src/api/http')>(), requestText: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requestText).mockResolvedValue(JSON.stringify(JSON.stringify({ code: '0000', msg: '成功' })));
});

it.each([
  ['T0', ['20261113108000010736_9160917736_1_1353419', '20261113100000005736_9160917736_1_1353418']],
  ['T1', ['20261108005000075770_0254714770_4695761']],
] as const)('%s 指定网联请求完全保留复合 ID，发送 channelId=EPCC', async (type, ids) => {
  await expect(applyRepayWithRoute(type, [...ids])).resolves.toEqual({ accepted: true, message: '成功' });
  const [url, options] = vi.mocked(requestText).mock.calls[0];
  expect(url).toBe(`https://om.leshuazf.com/lspos/new${type}Repay.do?method=applyAutoRepayWithRoute`);
  expect(options?.method).toBe('POST');
  const body = options?.body as URLSearchParams;
  expect(body.toString()).toBe(new URLSearchParams({ ids: ids.join(','), channelId: 'EPCC' }).toString());
});

it('普通重出接口仍只发送打款单号', async () => {
  await applyRepay('T0', ['20261113108000010736']);
  const [url, options] = vi.mocked(requestText).mock.calls[0];
  expect(url).toContain('method=applyAutoRepay');
  expect((options?.body as URLSearchParams).toString()).toBe('ids=20261113108000010736');
});

it('完整 ID 缺失、结算类型格式不符或重复时不发起请求', async () => {
  await expect(applyRepayWithRoute('T0', ['20261113108000010736'])).rejects.toThrow('完整记录标识');
  await expect(applyRepayWithRoute('T1', ['20261113108000010736_9160917736_1_1353419'])).rejects.toThrow('完整记录标识');
  await expect(applyRepayWithRoute('T0', ['1_9160917736_1_2', '1_9160917736_1_2'])).rejects.toThrow('重复');
  expect(requestText).not.toHaveBeenCalled();
});
