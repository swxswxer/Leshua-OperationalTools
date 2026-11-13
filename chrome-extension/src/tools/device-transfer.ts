import {
  queryNewDeviceAgent as queryNewDeviceAgentRequest,
  queryOldDeviceAgent as queryOldDeviceAgentRequest,
  submitLhsdDeviceTransfer as submitLhsdDeviceTransferRequest,
  submitDeviceTransfer as submitDeviceTransferRequest,
  normalizeDeviceQuantity,
  type DeviceAgent,
  type DeviceTransferValues,
  type LhsdDeviceTransferResult,
  type LhsdDeviceTransferValues,
} from '../api/device-transfer';

export type { DeviceAgent, DeviceTransferValues, LhsdDeviceTransferResult, LhsdDeviceTransferValues };

export interface DeviceSnRange { sn: string; endSn: string; quantity: string }

function normalizeSn(value: string): string {
  const sn = value.trim();
  if (!/^[A-Za-z0-9]+$/.test(sn)) throw new Error('乐刷 SN 不能为空，且只能包含英文字母和数字');
  return sn;
}

export function deviceRangeFromQuantity(snInput: string, quantityInput: string): DeviceSnRange {
  const sn = normalizeSn(snInput);
  const quantity = normalizeDeviceQuantity(quantityInput);
  if (quantity === '1') return { sn, endSn: sn, quantity };
  const suffix = sn.match(/^(.*?)(\d+)$/);
  if (!suffix) throw new Error('批量划拨的 SN 必须以数字结尾');
  const end = (BigInt(suffix[2]) + BigInt(quantity) - 1n).toString().padStart(suffix[2].length, '0');
  return { sn, endSn: `${suffix[1]}${end}`, quantity };
}

export function deviceRangeFromEndSn(snInput: string, endInput: string): DeviceSnRange {
  const sn = normalizeSn(snInput);
  const endSn = normalizeSn(endInput);
  if (sn === endSn) return { sn, endSn, quantity: '1' };
  const start = sn.match(/^(.*?)(\d+)$/);
  const end = endSn.match(/^(.*?)(\d+)$/);
  if (!start || !end || start[1] !== end[1]) throw new Error('起始 SN 与末 SN 的固定前缀必须相同，且均以数字结尾');
  if (BigInt(end[2]) < BigInt(start[2])) throw new Error('末 SN 不能小于起始 SN');
  const quantity = (BigInt(end[2]) - BigInt(start[2]) + 1n).toString();
  if (deviceRangeFromQuantity(sn, quantity).endSn !== endSn) throw new Error('末 SN 的位数或编号格式与起始 SN 不一致');
  return { sn, endSn, quantity };
}

export const queryOldDeviceAgent = (sn: string, quantity = '1'): Promise<DeviceAgent> => queryOldDeviceAgentRequest(sn, quantity);

export const queryNewDeviceAgent = (sn: string, oldAgentId: string, newAgentId: string): Promise<DeviceAgent> =>
  queryNewDeviceAgentRequest(sn, oldAgentId, newAgentId);

export const submitDeviceTransfer = (values: DeviceTransferValues, onStep?: (message: string) => void): Promise<void> =>
  submitDeviceTransferRequest(values, onStep);

export const submitLhsdDeviceTransfer = (
  values: LhsdDeviceTransferValues,
): Promise<LhsdDeviceTransferResult> => submitLhsdDeviceTransferRequest(values);
