import { createDeviceBindConfig, queryDeviceBindConfig, updateDeviceBindConfig, type DeviceBindConfig } from '../api/device-bind-config';
import type { LogHandler } from '../types';

export interface DeviceBindConfigInput {
  sn: string;
  perDayBindTimes?: string;
  perMonthBindTimes?: string;
  whiteList?: '1' | '0';
}

export function normalizeDeviceBindConfig(input: DeviceBindConfigInput): DeviceBindConfig {
  const sn = input.sn.trim();
  if (!sn) throw new Error('请输入乐刷 SN');
  const count = (raw: string | undefined, label: string): string => {
    const value = raw?.trim() || '3';
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`${label}必须是非负整数`);
    return String(Number(value));
  };
  const whiteList = input.whiteList ?? '1';
  if (whiteList !== '1' && whiteList !== '0') throw new Error('请选择是否启用结算主体白名单');
  return { sn, perDayBindTimes: count(input.perDayBindTimes, '单日最大绑定次数'), perMonthBindTimes: count(input.perMonthBindTimes, '单月最大绑定次数'), whiteList };
}

export async function saveDeviceBindConfig(input: DeviceBindConfigInput, log: LogHandler): Promise<'created' | 'updated'> {
  const values = normalizeDeviceBindConfig(input);
  log(`查询设备 ${values.sn} 的换绑配置`);
  const record = await queryDeviceBindConfig(values.sn);
  if (record) {
    log(`找到设备换绑配置 ${record.id}，正在修改`);
    await updateDeviceBindConfig(record, values);
  } else {
    log('未找到该 SN 的配置，正在新增');
    await createDeviceBindConfig(values);
  }
  log(`设备 ${values.sn} 换绑配置${record ? '修改' : '新增'}成功`);
  return record ? 'updated' : 'created';
}
