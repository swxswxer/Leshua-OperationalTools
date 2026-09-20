export type LogHandler = (message: string, isError?: boolean) => void;
export type StatusHandler = (state: string, message: string) => void;

export interface BackendTextRequest {
  kind: 'text';
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  cache?: RequestCache;
  timeoutMs?: number;
}

export interface BackendMultipartRequest {
  headers?: Record<string, string>;
  kind: 'multipart';
  url: string;
  fields: Record<string, string>;
  fileField: string;
  fileName: string;
  fileType: string;
  fileBase64: string;
  timeoutMs?: number;
}

export type BackendRequest = BackendTextRequest | BackendMultipartRequest;

export interface BackendRequestMessage {
  type: 'operations:backend-request';
  request: BackendRequest;
}

export interface BackendResponseMessage {
  ok: boolean;
  status: number;
  text: string;
  error?: string;
}

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
