import {
  queryNewDeviceAgent as queryNewDeviceAgentRequest,
  queryOldDeviceAgent as queryOldDeviceAgentRequest,
  submitLhsdDeviceTransfer as submitLhsdDeviceTransferRequest,
  submitDeviceTransfer as submitDeviceTransferRequest,
  type DeviceAgent,
  type DeviceTransferValues,
  type LhsdDeviceTransferResult,
  type LhsdDeviceTransferValues,
} from '../api/device-transfer';

export type { DeviceAgent, DeviceTransferValues, LhsdDeviceTransferResult, LhsdDeviceTransferValues };

export const queryOldDeviceAgent = (sn: string): Promise<DeviceAgent> => queryOldDeviceAgentRequest(sn);

export const queryNewDeviceAgent = (sn: string, oldAgentId: string, newAgentId: string): Promise<DeviceAgent> =>
  queryNewDeviceAgentRequest(sn, oldAgentId, newAgentId);

export const submitDeviceTransfer = (values: DeviceTransferValues, onStep?: (message: string) => void): Promise<void> =>
  submitDeviceTransferRequest(values, onStep);

export const submitLhsdDeviceTransfer = (
  values: LhsdDeviceTransferValues,
): Promise<LhsdDeviceTransferResult> => submitLhsdDeviceTransferRequest(values);
