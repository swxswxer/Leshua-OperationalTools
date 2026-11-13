import { beforeEach, expect, it, vi } from 'vitest';
import { applyAuthorizationAgent, queryAuthorizationAgents, issueAuthorizationCode, assertAuthorizationIssued } from '../src/api/sn-authorization';
import { authorizationAgentIssueError, querySnAuthorizationAgents, sendSnAuthorization, submitAgentContact } from '../src/tools/sn-authorization';

vi.mock('../src/api/sn-authorization', async original => ({
  ...await original<typeof import('../src/api/sn-authorization')>(),
  applyAuthorizationAgent: vi.fn(), queryAuthorizationAgents: vi.fn(), issueAuthorizationCode: vi.fn(),
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
it('未选择记录不能发送，也不自动查询或提交代理信息', async () => {
  await expect(sendSnAuthorization('123', '00ABC', null, vi.fn())).rejects.toThrow('查询并选择');
  expect(queryAuthorizationAgents).not.toHaveBeenCalled();
  expect(issueAuthorizationCode).not.toHaveBeenCalled();
});
it('查询仅传入规范化的代理编号，并保留多条记录供选择', async () => {
  const result = { records: [
    { id: '1', agentId: '123', email: 'one@example.com', status: '已生效' },
    { id: '2', agentId: '123', email: 'two@example.com', status: '已生效' },
  ], hasMore: false };
  vi.mocked(queryAuthorizationAgents).mockResolvedValue(result);
  await expect(querySnAuthorizationAgents(' 123 ')).resolves.toEqual(result);
  expect(queryAuthorizationAgents).toHaveBeenCalledExactlyOnceWith('123');
});
it('查询失败不发送，不自动新增', async () => {
  vi.mocked(queryAuthorizationAgents).mockRejectedValue(new Error('权限不足'));
  await expect(querySnAuthorizationAgents('123')).rejects.toThrow('权限不足');
  expect(applyAuthorizationAgent).not.toHaveBeenCalled();
  expect(issueAuthorizationCode).not.toHaveBeenCalled();
});
it('非法 SN 不查询代理', async () => {
  await expect(sendSnAuthorization('123', 'a;b', null, vi.fn())).rejects.toThrow('SN');
  expect(queryAuthorizationAgents).not.toHaveBeenCalled();
});
it('代理编号改变后不能沿用旧查询的选择记录', async () => {
  await expect(sendSnAuthorization('456', '00ABC', { id: '1', agentId: '123', email: 'one@example.com', status: '已生效' }, vi.fn())).rejects.toThrow('代理编号已变更');
  expect(issueAuthorizationCode).not.toHaveBeenCalled();
});
it('只允许选择已生效且具有明确发送 ID 和完整邮箱的记录', () => {
  const agent = { id: '1', agentId: '123', email: 'one@example.com', status: '已生效' };
  expect(authorizationAgentIssueError(agent)).toBe('');
  expect(authorizationAgentIssueError({ ...agent, status: '待审核' })).toContain('未生效');
  expect(authorizationAgentIssueError({ ...agent, id: '' })).toContain('发送 ID');
  expect(authorizationAgentIssueError({ ...agent, email: 'a***@example.com' })).toContain('已脱敏');
});
it('只认明确的发送成功，保留失败原因', () => {
  expect(() => assertAuthorizationIssued('{"code":0,"msg":"成功","data":null,"success":true}')).not.toThrow();
  expect(() => assertAuthorizationIssued('{"code":1,"success":false,"msg":"SN不存在"}')).toThrow('SN不存在');
  expect(() => assertAuthorizationIssued('{}')).toThrow('未确认成功');
});
