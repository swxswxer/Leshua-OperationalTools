import type { LogHandler, ReportOptions } from '../types';
import {
  isRequested, type MerchantReportResult, type ReportMode, type ReportType, submitQuickReport,
} from '../api/quick-report';
import { bindWechatPaymentConfig } from '../api/payment-config';
import { queryLatestReportFailure } from '../api/report';

async function supplementFailureReasons(results: MerchantReportResult[], log: LogHandler): Promise<void> {
  for (const result of results) {
    await Promise.all((['wechat', 'alipay'] as const).map(async (channel) => {
      const outcome = result[channel];
      if (outcome.state !== 'failure') return;
      const label = channel === 'wechat' ? '微信' : '支付宝';
      log(`商户 ${result.merchantId} ${label}重置失败，正在查询最新上报记录`);
      try {
        const failure = await queryLatestReportFailure(result.merchantId, channel);
        if (failure) {
          outcome.error = `${outcome.error || '上报失败'}；最新上报记录（${failure.time}，供参考）：${failure.reason}`;
        } else {
          outcome.error = `${outcome.error || '上报失败'}；最新记录未提供可用失败原因，请到后台核实`;
        }
      } catch (error) {
        outcome.error = `${outcome.error || '上报失败'}；失败原因查询异常：${error instanceof Error ? error.message : String(error)}`;
      }
      log(`商户 ${result.merchantId} ${label}：${outcome.error}`, true);
    }));
  }
}

async function bindWechatPaymentConfigs(
  results: MerchantReportResult[],
  options: ReportOptions,
  log: LogHandler,
): Promise<void> {
  if (!options.subAppids && !options.jsapiPaths) return;
  for (const result of results) {
    if (result.wechat.state !== 'success' || !result.wechat.subMchId) continue;
    try {
      log(`开始绑定商户 ${result.merchantId} 的微信支付参数`);
      await bindWechatPaymentConfig(result.merchantId, result.wechat.subMchId, options);
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
  merchantIds: string[],
  reportType: ReportType,
  options: ReportOptions,
  log: LogHandler,
  reportMode: ReportMode = 'SYT',
): Promise<MerchantReportResult[]> {
  const results = await submitQuickReport(merchantIds, reportType, reportMode);
  results.forEach((result) => { result.businessLine = reportMode === 'COMMON' ? 'lhsd' : 'syt'; });
  await supplementFailureReasons(results, log);
  if (isRequested(reportType, 'wechat')) {
    await bindWechatPaymentConfigs(results, options, log);
  }
  return results;
}
