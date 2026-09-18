import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeviceBindConfig, queryDeviceBindConfig, updateDeviceBindConfig } from '../src/api/device-bind-config';
import { normalizeDeviceBindConfig, saveDeviceBindConfig } from '../src/tools/device-bind-config';

vi.mock('../src/api/device-bind-config', () => ({
  createDeviceBindConfig: vi.fn(), queryDeviceBindConfig: vi.fn(), updateDeviceBindConfig: vi.fn(),
}));

beforeEach(() => { vi.resetAllMocks(); });

describe('设备换绑配置', () => {
  it('保留 SN 前导零，空白次数使用默认值', () => {
    expect(normalizeDeviceBindConfig({ sn: ' 00ABC123 ', perDayBindTimes: ' ' })).toEqual({
      sn: '00ABC123', perDayBindTimes: '3', perMonthBindTimes: '3', whiteList: '1',
    });
  });
  it('支持自定义次数和否选项', () => {
    expect(normalizeDeviceBindConfig({ sn: 'ABC', perDayBindTimes: '5', perMonthBindTimes: '12', whiteList: '0' }))
      .toMatchObject({ perDayBindTimes: '5', perMonthBindTimes: '12', whiteList: '0' });
  });
  it.each(['-1', '1.5', 'abc', '9007199254740992'])('拒绝非法次数 %s', (value) => {
    expect(() => normalizeDeviceBindConfig({ sn: 'ABC', perDayBindTimes: value })).toThrow('非负整数');
  });
  it('必填 SN 校验前不发送查询', async () => {
    await expect(saveDeviceBindConfig({ sn: ' ' }, vi.fn())).rejects.toThrow('请输入');
    expect(queryDeviceBindConfig).not.toHaveBeenCalled();
  });
  it('无记录时只新增', async () => {
    vi.mocked(queryDeviceBindConfig).mockResolvedValue(null);
    expect(await saveDeviceBindConfig({ sn: '001' }, vi.fn())).toBe('created');
    expect(createDeviceBindConfig).toHaveBeenCalledWith({ sn: '001', perDayBindTimes: '3', perMonthBindTimes: '3', whiteList: '1' });
    expect(updateDeviceBindConfig).not.toHaveBeenCalled();
  });
  it('有记录时只修改并传递原累计限制', async () => {
    const record = { id: '123', maxBindMchCount: '10', maxBindCount: '20' };
    vi.mocked(queryDeviceBindConfig).mockResolvedValue(record);
    expect(await saveDeviceBindConfig({ sn: '001' }, vi.fn())).toBe('updated');
    expect(updateDeviceBindConfig).toHaveBeenCalledWith(record, expect.objectContaining({ sn: '001' }));
    expect(createDeviceBindConfig).not.toHaveBeenCalled();
  });
  it('查询失败不能按无记录新增', async () => {
    vi.mocked(queryDeviceBindConfig).mockRejectedValue(new Error('没有权限'));
    await expect(saveDeviceBindConfig({ sn: '001' }, vi.fn())).rejects.toThrow('没有权限');
    expect(createDeviceBindConfig).not.toHaveBeenCalled();
    expect(updateDeviceBindConfig).not.toHaveBeenCalled();
  });
  it('保存失败不记录成功、不自动重试', async () => {
    const log = vi.fn();
    vi.mocked(queryDeviceBindConfig).mockResolvedValue(null);
    vi.mocked(createDeviceBindConfig).mockRejectedValue(new Error('存在相同维度的配置'));
    await expect(saveDeviceBindConfig({ sn: '001' }, log)).rejects.toThrow('相同维度');
    expect(createDeviceBindConfig).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.some(([message]) => message.includes('成功'))).toBe(false);
  });
});
