import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCupsResponse, submitCupsApplication } from '../src/api/cups';
import { requestMultipartText } from '../src/api/http';
import { reportCups } from '../src/tools/cups-report';

vi.mock('../src/api/http', async (original) => ({
  ...await original<typeof import('../src/api/http')>(),
  requestMultipartText: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());

describe('CUPS 申请响应', () => {
  it('code=1、success=true 表示申请已受理', () => {
    expect(parseCupsResponse('{"code":1,"errMsg":null,"data":null,"success":true}')).toMatchObject({ state: 'accepted' });
  });
  it('明确失败保留后台原因', () => {
    expect(() => parseCupsResponse('{"code":0,"success":false,"errMsg":"商户不存在"}')).toThrow('商户不存在');
  });
  it('未知 JSON 不能视为成功', () => {
    expect(parseCupsResponse('{"code":1}').state).toBe('unknown');
  });
  it('冲突的失败字段优先，不能误报成功', () => {
    expect(() => parseCupsResponse('{"success":true,"error_code":"1081","error_msg":"格式错误"}')).toThrow('格式错误');
  });
  it('准确传递文件、账号和固定 multipart 字段', async () => {
    const file = new File(['test'], 'cups_generate_template.xlsx');
    vi.mocked(requestMultipartText).mockResolvedValue('{"success":true}');
    await submitCupsApplication(file, 'operator_test');
    expect(requestMultipartText).toHaveBeenCalledWith(
      'https://om.leshuazf.com/lspos/cups.do?method=batchGenerateAndBind',
      { applicant: 'operator_test', reason: '1', channelType: '1', merchantType: 'undefined' },
      'file', file, 30000, expect.objectContaining({ 'X-Requested-With': 'XMLHttpRequest' }),
    );
  });
  it('提交异常不自动重试，提示先核实后台', async () => {
    vi.mocked(requestMultipartText).mockRejectedValue(new Error('timeout'));
    await expect(submitCupsApplication(new File([], 'test.xlsx'), 'operator_test')).rejects.toThrow('受理状态未知');
    expect(requestMultipartText).toHaveBeenCalledTimes(1);
  });
  it('空账号不提交', async () => {
    await expect(submitCupsApplication(new File([], 'test.xlsx'), '')).rejects.toThrow('申请人');
    expect(requestMultipartText).not.toHaveBeenCalled();
  });
  it('非法或多个商户号在查询账号前拦截', async () => {
    await expect(reportCups('123;456', vi.fn())).rejects.toThrow('10 位数字');
    expect(requestMultipartText).not.toHaveBeenCalled();
  });
});
