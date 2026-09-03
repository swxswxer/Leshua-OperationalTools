export interface DeviceTransferValues {
  sn: string;
  quantity: '1';
  oldAgentId: string;
  oldAgentName: string;
  oldAgentType: string;
  newAgentId: string;
  newAgentName: string;
  newAgentType: string;
}

export interface DeviceAgent {
  id: string;
  name: string;
  type: string;
}

interface DeviceTransferResponse<T> {
  code?: number | string;
  msg?: string | null;
  success?: boolean;
  data?: T | null;
}

interface AgentResponseData {
  oldAgentId?: string | number;
  agentName?: string;
  agentClassName?: string;
}

const ENDPOINT = '/base-business/pinpad/newTerminal.do';

function trim(value: string): string {
  return value.trim();
}

function assertSuccess<T>(payload: DeviceTransferResponse<T>): T {
  if (Number(payload?.code) === 0 && payload?.success === true) return payload.data as T;
  throw new Error(payload?.msg || '后台未返回成功结果');
}

async function request<T>(method: string, values: Record<string, string>, fetchImpl: typeof fetch = fetch): Promise<T> {
  const body = new URLSearchParams(values);
  const response = await fetchImpl(`${ENDPOINT}?method=${encodeURIComponent(method)}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`请求失败 ${response.status}: ${text.slice(0, 200)}`);
  try {
    return assertSuccess<T>(JSON.parse(text) as DeviceTransferResponse<T>);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`接口返回非 JSON 内容: ${text.slice(0, 200)}`);
    throw error;
  }
}

function toAgent(data: AgentResponseData, id: string): DeviceAgent {
  const name = trim(String(data?.agentName || ''));
  const type = trim(String(data?.agentClassName || ''));
  if (!name || !type) throw new Error('接口未返回完整代理商信息');
  return { id, name, type };
}

export function validateDeviceTransfer(values: DeviceTransferValues): void {
  if (!trim(values.sn)) throw new Error('请输入乐刷 SN 始');
  if (values.quantity !== '1') throw new Error('机具划拨数量固定为 1');
  if (!trim(values.oldAgentId) || !trim(values.newAgentId)) throw new Error('请先查询旧代理商和新代理商信息');
  if (trim(values.oldAgentId) === trim(values.newAgentId)) throw new Error('新旧代理商编号不能相同');
}

export async function queryOldDeviceAgent(sn: string, fetchImpl: typeof fetch = fetch): Promise<DeviceAgent> {
  const deviceSn = trim(sn);
  if (!deviceSn) throw new Error('请输入乐刷 SN 始');
  const data = await request<AgentResponseData>('changeAgentCheckSn', {
    pinpadUuidStart: deviceSn,
    pinpadUuidTotal: '1',
  }, fetchImpl);
  const id = trim(String(data?.oldAgentId || ''));
  if (!id) throw new Error('接口未返回旧代理商编号');
  return toAgent(data, id);
}

export async function queryNewDeviceAgent(
  sn: string,
  oldAgentId: string,
  newAgentId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DeviceAgent> {
  const deviceSn = trim(sn);
  const oldId = trim(oldAgentId);
  const newId = trim(newAgentId);
  if (!deviceSn || !oldId || !newId) throw new Error('请先填写 SN、新代理商编号并查询旧代理商');
  const data = await request<AgentResponseData>('changeAgentCheckAgent', {
    pinpadUuid: deviceSn,
    oldAgentId: oldId,
    newAgentId: newId,
  }, fetchImpl);
  return toAgent(data, newId);
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export async function submitDeviceTransfer(
  values: DeviceTransferValues,
  onStep?: (message: string) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  validateDeviceTransfer(values);
  const requestValues = {
    pinpadUuidStart: trim(values.sn),
    pinpadUuidTotal: '1',
    oldAgentId: trim(values.oldAgentId),
    newAgentId: trim(values.newAgentId),
  };
  await request<null>('changeAgentBeforeSubmit', requestValues, fetchImpl);
  onStep?.('校验通过，0.5 秒后发起正式划拨');
  await wait(500);
  await request<null>('changeAgent', requestValues, fetchImpl);
}
