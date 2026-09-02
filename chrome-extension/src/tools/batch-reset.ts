import type { LegacyApi, LogHandler, ReportOptions } from '../content/contracts';
import { isRequested } from '../content/helpers';
import { type MerchantReportResult, type ReportMode, type ReportType, submitQuickReport } from '../content/quick-report';

async function bindWechatPaymentConfigs(
  api: LegacyApi,
  results: MerchantReportResult[],
  options: ReportOptions,
  log: LogHandler,
): Promise<void> {
  if (!options.subAppids && !options.jsapiPaths) return;
  for (const result of results) {
    if (result.wechat.state !== 'success' || !result.wechat.subMchId) continue;
    try {
      log(`开始绑定商户 ${result.merchantId} 的微信支付参数`);
      await api.bindWechatPaymentConfig(result.merchantId, result.wechat.subMchId, options);
      log(`商户 ${result.merchantId} 微信支付参数绑定完成`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.wechat.note = `微信支付参数绑定失败：${message}`;
      log(`商户 ${result.merchantId} ${result.wechat.note}`, true);
    }
  }
}

/** Executes the new backend batch endpoint and its optional WeChat payment setup. */
export async function runBatchReset(
  api: LegacyApi,
  merchantIds: string[],
  reportType: ReportType,
  options: ReportOptions,
  log: LogHandler,
  reportMode: ReportMode = 'SYT',
): Promise<MerchantReportResult[]> {
  const results = await submitQuickReport(merchantIds, reportType, reportMode);
  results.forEach((result) => { result.businessLine = reportMode === 'COMMON' ? 'lhsd' : 'syt'; });
  if (isRequested(reportType, 'wechat')) {
    await bindWechatPaymentConfigs(api, results, options, log);
  }
  return results;
}
