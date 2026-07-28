import type { LegacyApi, LogHandler, ReportOptions } from '../content/contracts';
import { isRequested, skippedChannel } from '../content/helpers';
import type { MerchantReportResult, ReportType } from '../content/quick-report';

/** Runs the previous 收银通 flow serially when custom channel parameters are present. */
export async function runLegacyReset(
  api: LegacyApi,
  merchantIds: string[],
  reportType: ReportType,
  options: ReportOptions,
  log: LogHandler,
): Promise<MerchantReportResult[]> {
  const output: MerchantReportResult[] = [];
  for (const merchantId of merchantIds) {
    const result: MerchantReportResult = {
      merchantId,
      route: 'legacy',
      wechat: skippedChannel(),
      alipay: skippedChannel(),
    };
    log(`商户 ${merchantId} 使用自定义渠道旧流程处理`);
    if (isRequested(reportType, 'wechat')) {
      try {
        const response = await api.wechatAutoReport(merchantId, options);
        result.wechat = { state: 'success', subMchId: response.newWxSubMchId };
      } catch (error) {
        result.wechat = { state: 'failure', error: error instanceof Error ? error.message : String(error) };
      }
    }
    if (isRequested(reportType, 'alipay')) {
      try {
        const response = await api.alipayAutoReport(merchantId, options);
        result.alipay = { state: 'success', subMchId: response.newZfbSubMchId };
      } catch (error) {
        result.alipay = { state: 'failure', error: error instanceof Error ? error.message : String(error) };
      }
    }
    output.push(result);
  }
  return output;
}
