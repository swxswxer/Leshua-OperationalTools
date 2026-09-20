import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { applyAuthorizationAgent, queryAuthorizationAgent, issueAuthorizationCode, type AgentContact } from '../api/sn-authorization';

export function normalizeAgentId(value: string): string {
  const id = value.trim();
  if (!/^\d+$/.test(id)) throw new Error('请填写纯数字代理编号');
  return id;
}

export async function submitAgentContact(input: AgentContact): Promise<void> {
  const values = { agentId: normalizeAgentId(input.agentId), phone: input.phone.trim(), receiver: input.receiver.trim(), email: input.email.trim() };
  if (!/^1\d{10}$/.test(values.phone)) throw new Error('请填写 11 位手机号');
  if (!values.receiver) throw new Error('请填写发送人');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) throw new Error('请填写有效邮箱');
  await applyAuthorizationAgent(values);
}

export function createSnAuthorizationFile(bytes: Uint8Array, sn: string): File {
  if (!/^[A-Za-z0-9]+$/.test(sn)) throw new Error('乐刷 SN 只能包含英文字母和数字');
  const entries = unzipSync(bytes);
  const path = 'xl/worksheets/sheet1.xml';
  if (!entries[path]) throw new Error('SN 官方模板缺少工作表');
  const doc = new DOMParser().parseFromString(strFromU8(entries[path]), 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('SN 官方模板格式错误');
  const cell = doc.querySelector('c[r="A2"]');
  if (!cell) throw new Error('SN 官方模板缺少 A2');
  const inline = doc.createElementNS(doc.documentElement.namespaceURI, 'is');
  const text = doc.createElementNS(doc.documentElement.namespaceURI, 't');
  text.textContent = sn;
  inline.append(text);
  cell.setAttribute('t', 'inlineStr');
  cell.replaceChildren(inline);
  entries[path] = strToU8(new XMLSerializer().serializeToString(doc));
  return new File([new Uint8Array(zipSync(entries)).buffer], 'SN授权码下发模板.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function sendSnAuthorization(agentInput: string, snInput: string, progress: (message: string) => void): Promise<string> {
  const agentId = normalizeAgentId(agentInput);
  const sn = snInput.trim();
  if (!/^[A-Za-z0-9]+$/.test(sn)) throw new Error('请填写乐刷 SN，只支持英文字母和数字');
  progress('正在查询代理记录...');
  const agent = await queryAuthorizationAgent(agentId);
  if (!agent) throw new Error('未查询到已生效代理记录，请先提交代理商信息');
  progress('正在生成 SN 授权码 Excel...');
  const response = await fetch(chrome.runtime.getURL('assets/sn_authorization_template.xlsx'), { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('无法加载 SN 官方模板，请重新加载完整插件');
  const file = createSnAuthorizationFile(new Uint8Array(await response.arrayBuffer()), sn);
  progress(`正在向 ${agent.email} 发送授权码...`);
  try { await issueAuthorizationCode(file, agent.id); } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}；重新发送前请先核实后台及邮箱`);
  }
  return agent.email;
}
