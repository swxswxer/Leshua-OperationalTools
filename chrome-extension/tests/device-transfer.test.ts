import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  queryOldDeviceAgent,
  submitDeviceTransfer,
  submitLhsdDeviceTransfer,
  validateDeviceTransfer,
  validateLhsdDeviceTransfer,
} from '../src/api/device-transfer';
import { deviceRangeFromEndSn, deviceRangeFromQuantity } from '../src/tools/device-transfer';

afterEach(() => vi.unstubAllGlobals());

describe('device transfer', () => {
  it('reads old-agent details from the SN lookup response', async () => {
    const fetchMock: typeof fetch = async (_input, init) => {
      expect(String(init?.body)).toContain('pinpadUuidStart=9790020104');
      expect(String(init?.body)).toContain('pinpadUuidTotal=3');
      return new Response(JSON.stringify({
        code: 0,
        success: true,
        data: { oldAgentId: '263207289', agentName: '郭秀祥', agentClassName: 'SAAS代理商' },
      }));
    };
    await expect(queryOldDeviceAgent('9790020104', '3', fetchMock)).resolves.toEqual({
      id: '263207289', name: '郭秀祥', type: 'SAAS代理商',
    });
  });

  it('rejects incomplete values and an unchanged agent', () => {
    const values = {
      sn: '9790020104', quantity: '1' as const, oldAgentId: '263207289', oldAgentName: '旧代理', oldAgentType: 'SAAS代理商',
      newAgentId: '263207289', newAgentName: '新代理', newAgentType: 'SAAS代理商',
    };
    expect(() => validateDeviceTransfer(values)).toThrow('不能相同');
    expect(() => validateDeviceTransfer({ ...values, sn: '', newAgentId: '1136569' })).toThrow('SN');
  });

  it('submits a 联合收单 device transfer and keeps backend errors', async () => {
    const values = { sn: '3440000917', oldAgentId: '1231123', newAgentId: '123141231' };
    const successFetch: typeof fetch = async (_input, init) => {
      expect(String(init?.body)).toContain('sn=3440000917');
      expect(String(init?.body)).toContain('oldAgentId=1231123');
      expect(String(init?.body)).toContain('newAgentId=123141231');
      return new Response(JSON.stringify({ error_code: '0', error_msg: 'success', count: 1, fail: false, success: true }));
    };
    await expect(submitLhsdDeviceTransfer(values, successFetch)).resolves.toEqual({ count: 1, message: 'success' });

    const failureFetch: typeof fetch = async () => new Response(JSON.stringify({
      error_code: '111', error_msg: '旧代理商编号有误', count: 0, fail: true, success: false,
    }));
    await expect(submitLhsdDeviceTransfer(values, failureFetch)).rejects.toThrow('旧代理商编号有误');
  });

  it('validates 联合收单 agent identifiers', () => {
    expect(() => validateLhsdDeviceTransfer({ sn: '', oldAgentId: '1', newAgentId: '2' })).toThrow('SN');
    expect(() => validateLhsdDeviceTransfer({ sn: '3440000917', oldAgentId: '1', newAgentId: '1' })).toThrow('不能相同');
  });

  it('预校验及最终划拨都发送用户计算的数量', async () => {
    vi.stubGlobal('window', { setTimeout });
    const calls: string[] = [];
    const fetchMock: typeof fetch = async (url, init) => {
      calls.push(String(url));
      const params = new URLSearchParams(String(init?.body));
      expect(params.get('pinpadUuidStart')).toBe('000100');
      expect(params.get('pinpadUuidTotal')).toBe('3');
      return new Response(JSON.stringify({ code: 0, success: true, data: null }));
    };
    await submitDeviceTransfer({ sn: '000100', quantity: '3', oldAgentId: '1', newAgentId: '2', oldAgentName: '旧代理', oldAgentType: '代理商', newAgentName: '新代理', newAgentType: '代理商' }, undefined, fetchMock);
    expect(calls.map(url => new URL(url).searchParams.get('method'))).toEqual(['changeAgentBeforeSubmit', 'changeAgent']);
  });

  it.each(['', '0', '-1', '1.5', 'a'])('不能提交非法数量 %s', quantity => {
    expect(() => validateDeviceTransfer({ sn: '000100', quantity, oldAgentId: '1', newAgentId: '2', oldAgentName: '', oldAgentType: '', newAgentName: '', newAgentType: '' })).toThrow('正整数');
  });
});

describe('机具 SN 范围计算', () => {
  it('数量包含起止 SN 并保留前导零', () => {
    expect(deviceRangeFromQuantity('000100', '3')).toEqual({ sn: '000100', endSn: '000102', quantity: '3' });
    expect(deviceRangeFromEndSn('000100', '000102')).toEqual({ sn: '000100', endSn: '000102', quantity: '3' });
    expect(deviceRangeFromQuantity('ABC0099', '2').endSn).toBe('ABC0100');
    expect(deviceRangeFromEndSn('ABC0099', 'ABC0100').quantity).toBe('2');
  });

  it('长数字 SN 使用整数精确计算，不丢失尾数', () => {
    expect(deviceRangeFromQuantity('SN900719925474099300', '4').endSn).toBe('SN900719925474099303');
    expect(deviceRangeFromEndSn('SN900719925474099300', 'SN900719925474099303').quantity).toBe('4');
  });

  it('单台可用非数字尾号，多台必须有数字尾号', () => {
    expect(deviceRangeFromQuantity('ABC', '1').endSn).toBe('ABC');
    expect(deviceRangeFromEndSn('ABC', 'ABC').quantity).toBe('1');
    expect(() => deviceRangeFromQuantity('ABC', '2')).toThrow('数字结尾');
  });

  it('拒绝倒序、不同前缀和丢失前导零的末 SN', () => {
    expect(() => deviceRangeFromEndSn('ABC0100', 'ABC0099')).toThrow('不能小于');
    expect(() => deviceRangeFromEndSn('ABC0100', 'ABD0102')).toThrow('前缀必须相同');
    expect(() => deviceRangeFromEndSn('000100', '102')).toThrow('格式');
  });
});
