import type { LogHandler, ReportOptions } from '../types';
import {
  isRequested, QUICK_REPORT_BATCH_SIZE, skippedChannel, type MerchantReportResult, type ReportMode, type ReportType, submitQuickReport,
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

/** Runs batches concurrently while keeping results in the original merchant order. */
export async function runBatchReset(
  merchantIds: string[],
  reportType: ReportType,
  options: ReportOptions,
  log: LogHandler,
  reportMode: ReportMode = 'SYT',
  onResultUpdate?: (results: MerchantReportResult[]) => void,
): Promise<MerchantReportResult[]> {
  const businessLine = reportMode === 'COMMON' ? 'lhsd' : 'syt';
  const results: MerchantReportResult[] = merchantIds.map((merchantId) => ({
    merchantId, route: 'batch', businessLine,
    wechat: isRequested(reportType, 'wechat') ? { state: 'pending' } : skippedChannel(),
    alipay: isRequested(reportType, 'alipay') ? { state: 'pending' } : skippedChannel(),
  }));
  const update = () => onResultUpdate?.([...results]);
  update();

  const batches: Promise<void>[] = [];
  const batchCount = Math.ceil(merchantIds.length / QUICK_REPORT_BATCH_SIZE);
  for (let offset = 0; offset < merchantIds.length; offset += QUICK_REPORT_BATCH_SIZE) {
    const batchIds = merchantIds.slice(offset, offset + QUICK_REPORT_BATCH_SIZE);
    const batchNumber = offset / QUICK_REPORT_BATCH_SIZE + 1;
    const run = async () => {
      log(`批量重置第 ${batchNumber}/${batchCount} 批开始，商户: ${batchIds.join('；')}`);
      let batchResults: MerchantReportResult[];
      try {
        batchResults = await submitQuickReport(batchIds, reportType, reportMode);
      } catch (error) {
        const message = `批次请求失败，结果待确认：${error instanceof Error ? error.message : String(error)}`;
        batchIds.forEach((_, index) => {
          const result = results[offset + index];
          if (isRequested(reportType, 'wechat')) result.wechat = { state: 'failure', error: message };
          if (isRequested(reportType, 'alipay')) result.alipay = { state: 'failure', error: message };
        });
        update();
        log(`批量重置第 ${batchNumber}/${batchCount} 批：${message}`, true);
        return;
      }

      batchResults.forEach((result, index) => {
        result.businessLine = businessLine;
        results[offset + index] = result;
      });
      update();
      await supplementFailureReasons(batchResults, log);
      if (isRequested(reportType, 'wechat')) {
        await bindWechatPaymentConfigs(batchResults, options, log);
      }
      update();
      log(`批量重置第 ${batchNumber}/${batchCount} 批处理完成`);
    };
    batches.push(run());
  }
  await Promise.all(batches);
  return results;
}
