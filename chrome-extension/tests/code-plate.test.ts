import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitCodePlateTransfer } from '../src/api/code-plate';
import { detectHtmlError, requestMultipartText } from '../src/api/http';

vi.mock('../src/api/http', async original => ({
  ...await original<typeof import('../src/api/http')>(),
  isOperationsBackendPage: () => false,
  requestMultipartText: vi.fn(),
  detectHtmlError: vi.fn(),
}));

const values = { startCode: '0001', endCode: '0002', sourceAgent: '123', targetAgent: '456' };
const file = new File([], 'test.xlsx');

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requestMultipartText).mockResolvedValue('<title>操作提示</title>');
  vi.mocked(detectHtmlError).mockReturnValue('');
});

describe('码牌划转上传', () => {
  it('没有受理文案的正常响应也允许继续查询结果', async () => {
    await expect(submitCodePlateTransfer(values, { file })).resolves.toBeUndefined();
  });

  it('上传请求报错时停止流程', async () => {
    vi.mocked(requestMultipartText).mockRejectedValue(new Error('请求超时'));
    await expect(submitCodePlateTransfer(values, { file })).rejects.toThrow('请求超时');
  });

  it('优先显示已识别的权限错误', async () => {
    vi.mocked(detectHtmlError).mockReturnValue('没有该项操作权限');
    await expect(submitCodePlateTransfer(values, { file })).rejects.toThrow('没有该项操作权限');
  });
});
