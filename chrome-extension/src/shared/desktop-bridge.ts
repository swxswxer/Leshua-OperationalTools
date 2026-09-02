export const NATIVE_HOST_NAME = 'com.leshuazf.operations_companion';

export type DesktopBusinessLine = 'syt' | 'lhsd';
export type DesktopReportType = 'WECHAT' | 'ALIPAY' | 'ALL';
export type DesktopAction = 'reset' | 'merchant-key';

export interface DesktopOperation {
  action: DesktopAction;
  merchantId: string;
  businessLine?: DesktopBusinessLine;
  reportType?: DesktopReportType;
}

export interface NativeExecuteMessage extends DesktopOperation {
  type: 'operations-companion.execute';
  requestId: string;
}

export interface NativeResultMessage {
  type: 'operations-companion.result';
  requestId: string;
  ok: boolean;
  message: string;
  copied?: boolean;
}
