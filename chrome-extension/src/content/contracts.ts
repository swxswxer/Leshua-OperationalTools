import type { MerchantReportResult, ReportType } from './quick-report';

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
  onLog?: LogHandler;
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

export interface LegacyApi {
  configureMerchantKey(merchantId: string): Promise<unknown>;
  enableOnlineReceipt(merchantId: string, options?: { onLog?: LogHandler }): Promise<unknown>;
  transferCodePlates(values: CodePlateValues, options?: { onLog?: LogHandler; onStatus?: StatusHandler }): Promise<unknown>;
  addMerchantChangeWhitelist(values: WhitelistValues, options?: { onLog?: LogHandler; onStatus?: StatusHandler }): Promise<unknown>;
  wechatAutoReport(merchantId: string, options: ReportOptions): Promise<{ newWxSubMchId: string }>;
  alipayAutoReport(merchantId: string, options: ReportOptions): Promise<{ newZfbSubMchId: string }>;
  bindWechatPaymentConfig(merchantId: string, wxSubMchId: string, options: ReportOptions): Promise<unknown>;
}

export interface ResetExecution {
  merchantIds: string[];
  reportType: ReportType;
  options: ReportOptions;
  log: LogHandler;
}
