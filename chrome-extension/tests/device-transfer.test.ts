import { describe, expect, it } from 'vitest';
import { queryOldDeviceAgent, validateDeviceTransfer } from '../src/tools/device-transfer';

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
});
