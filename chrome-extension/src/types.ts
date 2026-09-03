export type LogHandler = (message: string, isError?: boolean) => void;
export type StatusHandler = (state: string, message: string) => void;

export interface ReportOptions {
  channelId: string;
  channelName: string;
  sourcePid: string;
  sourceName: string;
  subAppids: string;
  jsapiPaths: string;
  disableOldSubMch: boolean;
}

export interface CodePlateValues {
  startCode: string;
  endCode: string;
  sourceAgent: string;
  targetAgent: string;
}

export interface WhitelistValues {
  mobile: string;
  idCard: string;
  businessLicense: string;
  settlementAccount: string;
}
