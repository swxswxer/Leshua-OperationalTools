import type { LegacyApi, LogHandler, ReportOptions } from '../content/contracts';
import { isRequested, skippedChannel } from '../content/helpers';
import type { MerchantReportResult, ReportType } from '../content/quick-report';

type ResultUpdateHandler = (results: MerchantReportResult[]) => void;

function pendingChannel() {
  return { state: 'pending' as const };
}

function completeChannel(
  result: MerchantReportResult,
  channel: 'wechat' | 'alipay',
  subMchId: string,
  onUpdate: ResultUpdateHandler,
): void {
  result[channel] = { state: 'success', subMchId };
  onUpdate([result]);
}

function failChannel(
  result: MerchantReportResult,
  channel: 'wechat' | 'alipay',
  error: unknown,
  onUpdate: ResultUpdateHandler,
): void {
  const message = error instanceof Error ? error.message : String(error);
  const current = result[channel];
  if (current.state === 'success' && current.subMchId) {
    result[channel] = {
      ...current,
      error: message,
      note: `后续流程失败：${message}`,
    };
  } else {
    result[channel] = { state: 'failure', error: message };
  }
  onUpdate([result]);
}

/** Runs the previous flow serially by merchant, but WeChat and Alipay run together for each merchant. */
export async function runLegacyReset(
  api: LegacyApi,
  merchantIds: string[],
  reportType: ReportType,
  options: ReportOptions,
  log: LogHandler,
  onResultUpdate: ResultUpdateHandler,
): Promise<MerchantReportResult[]> {
  const output: MerchantReportResult[] = [];
  for (const merchantId of merchantIds) {
    const result: MerchantReportResult = {
      merchantId,
      route: 'legacy',
      wechat: isRequested(reportType, 'wechat') ? pendingChannel() : skippedChannel(),
      alipay: isRequested(reportType, 'alipay') ? pendingChannel() : skippedChannel(),
    };
    output.push(result);
    log(`商户 ${merchantId} 使用自定义渠道旧流程处理`);
    const reportOptions: ReportOptions = {
      ...options,
      onReportedSubMchId: (type, subMchId) => {
        if (type === 'wechat' && isRequested(reportType, 'wechat')) {
          completeChannel(result, 'wechat', subMchId, () => onResultUpdate([...output]));
        }
        if (type === 'alipay' && isRequested(reportType, 'alipay')) {
          completeChannel(result, 'alipay', subMchId, () => onResultUpdate([...output]));
        }
      },
    };
    const tasks: Promise<void>[] = [];
    if (isRequested(reportType, 'wechat')) {
      tasks.push((async () => {
      try {
          const response = await api.wechatAutoReport(merchantId, reportOptions);
          if (result.wechat.state !== 'success') {
            completeChannel(result, 'wechat', response.newWxSubMchId, () => onResultUpdate([...output]));
          }
      } catch (error) {
          failChannel(result, 'wechat', error, () => onResultUpdate([...output]));
      }
      })());
    }
    if (isRequested(reportType, 'alipay')) {
      tasks.push((async () => {
      try {
          const response = await api.alipayAutoReport(merchantId, reportOptions);
          if (result.alipay.state !== 'success') {
            completeChannel(result, 'alipay', response.newZfbSubMchId, () => onResultUpdate([...output]));
          }
      } catch (error) {
          failChannel(result, 'alipay', error, () => onResultUpdate([...output]));
      }
      })());
    }
    await Promise.all(tasks);
  }
  return output;
}
