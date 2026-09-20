import { beforeEach, expect, it, vi } from 'vitest';
import { applyAuthorizationAgent, queryAuthorizationAgent, issueAuthorizationCode, assertAuthorizationIssued } from '../src/api/sn-authorization';
import { sendSnAuthorization, submitAgentContact } from '../src/tools/sn-authorization';

vi.mock('../src/api/sn-authorization', async original => ({
  ...await original<typeof import('../src/api/sn-authorization')>(),
  applyAuthorizationAgent: vi.fn(), queryAuthorizationAgent: vi.fn(), issueAuthorizationCode: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());
it('提交时准确映射 receiver 且清理前后空格', async () => {
  await submitAgentContact({ agentId: ' 00123 ', phone: '13800000000', receiver: '测试人 ', email: 'demo@example.com' });
  expect(applyAuthorizationAgent).toHaveBeenCalledWith({ agentId: '00123', phone: '13800000000', receiver: '测试人', email: 'demo@example.com' });
});
it('信息不全不能提交', async () => {
  await expect(submitAgentContact({ agentId: '123', phone: '1', receiver: '', email: '' })).rejects.toThrow('手机号');
  expect(applyAuthorizationAgent).not.toHaveBeenCalled();
});
it('无代理记录提示先提交信息，不能发送', async () => {
  vi.mocked(queryAuthorizationAgent).mockResolvedValue(null);
  await expect(sendSnAuthorization('123', '00ABC', vi.fn())).rejects.toThrow('先提交代理商信息');
  expect(issueAuthorizationCode).not.toHaveBeenCalled();
});
it('查询失败不发送，不自动新增', async () => {
  vi.mocked(queryAuthorizationAgent).mockRejectedValue(new Error('权限不足'));
  await expect(sendSnAuthorization('123', '00ABC', vi.fn())).rejects.toThrow('权限不足');
  expect(applyAuthorizationAgent).not.toHaveBeenCalled();
  expect(issueAuthorizationCode).not.toHaveBeenCalled();
});
it('非法 SN 不查询代理', async () => {
  await expect(sendSnAuthorization('123', 'a;b', vi.fn())).rejects.toThrow('SN');
  expect(queryAuthorizationAgent).not.toHaveBeenCalled();
});
it('只认明确的发送成功，保留失败原因', () => {
  expect(() => assertAuthorizationIssued('{"code":0,"msg":"成功","data":null,"success":true}')).not.toThrow();
  expect(() => assertAuthorizationIssued('{"code":1,"success":false,"msg":"SN不存在"}')).toThrow('SN不存在');
  expect(() => assertAuthorizationIssued('{}')).toThrow('未确认成功');
});
