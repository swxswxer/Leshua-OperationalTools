import {
  queryNewDeviceAgent as queryNewDeviceAgentRequest,
  queryOldDeviceAgent as queryOldDeviceAgentRequest,
  submitDeviceTransfer as submitDeviceTransferRequest,
  type DeviceAgent,
  type DeviceTransferValues,
} from '../api/device-transfer';

export type { DeviceAgent, DeviceTransferValues };

export const queryOldDeviceAgent = (sn: string): Promise<DeviceAgent> => queryOldDeviceAgentRequest(sn);

export const queryNewDeviceAgent = (sn: string, oldAgentId: string, newAgentId: string): Promise<DeviceAgent> =>
  queryNewDeviceAgentRequest(sn, oldAgentId, newAgentId);

export const submitDeviceTransfer = (values: DeviceTransferValues, onStep?: (message: string) => void): Promise<void> =>
  submitDeviceTransferRequest(values, onStep);
