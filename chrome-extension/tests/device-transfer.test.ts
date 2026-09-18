import { describe, expect, it } from 'vitest';
import {
  queryOldDeviceAgent,
  submitLhsdDeviceTransfer,
  validateDeviceTransfer,
  validateLhsdDeviceTransfer,
} from '../src/api/device-transfer';

describe('device transfer', () => {
  it('reads old-agent details from the SN lookup response', async () => {
    const fetchMock: typeof fetch = async (_input, init) => {
      expect(String(init?.body)).toContain('pinpadUuidStart=9790020104');
      expect(String(init?.body)).toContain('pinpadUuidTotal=1');
      return new Response(JSON.stringify({
        code: 0,
        success: true,
        data: { oldAgentId: '263207289', agentName: '郭秀祥', agentClassName: 'SAAS代理商' },
      }));
    };
    await expect(queryOldDeviceAgent('9790020104', fetchMock)).resolves.toEqual({
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
});
