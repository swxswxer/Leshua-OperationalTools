import type { LogHandler, ReportOptions } from '../types';
import { bindWechatPaymentConfig } from '../api/payment-config';
import { resolveAlipayChannel, resolveWechatChannel, submitCustomAlipayReport, submitCustomWechatReport } from '../api/report';
import {
  confirmAlipayEnabled, confirmWechatEnabled,
  disableOldAlipayMappings, disableOldWechatMappings,
} from '../api/notification-status';
import { isRequested, skippedChannel, type MerchantReportResult, type ReportType } from '../api/quick-report';

type ResultUpdateHandler = (results: MerchantReportResult[]) => void;
const LEGACY_BATCH_SIZE = 4;

function pendingChannel() {
  return { state: 'pending' as const };
}

function completeChannel(result: MerchantReportResult, channel: 'wechat' | 'alipay', subMchId: string, update: () => void): void {
  result[channel] = { state: 'success', subMchId };
  update();
}

function failChannel(result: MerchantReportResult, channel: 'wechat' | 'alipay', error: unknown, update: () => void): void {
  const message = error instanceof Error ? error.message : String(error);
  const current = result[channel];
  result[channel] = current.state === 'success' && current.subMchId
    ? { ...current, error: message, note: `后续流程失败：${message}` }
    : { state: 'failure', error: message };
  update();
}

async function resetWechat(merchantId: string, options: ReportOptions, result: MerchantReportResult, update: () => void, log: LogHandler): Promise<void> {
  try {
    const channel = resolveWechatChannel(options);
    log(`开始微信自定义渠道上报: ${channel.id} ${channel.name}`);
    const subMchId = await submitCustomWechatReport(merchantId, options);
    completeChannel(result, 'wechat', subMchId, update);
    log(`微信上报成功，新子商户号: ${subMchId}`);
    await confirmWechatEnabled(merchantId, subMchId);
    log(`微信子商户号 ${subMchId} 已确认启用`);
    if (options.disableOldSubMch !== false) {
      const changed = await disableOldWechatMappings(merchantId, subMchId);
      log(`旧微信子商户号关闭完成，处理 ${changed} 个分组`);
    }
    if (options.subAppids || options.jsapiPaths) {
      await bindWechatPaymentConfig(merchantId, subMchId, options);
      log(`微信子商户号 ${subMchId} 支付参数绑定完成`);
    }
  } catch (error) {
    failChannel(result, 'wechat', error, update);
  }
}

async function resetAlipay(merchantId: string, options: ReportOptions, result: MerchantReportResult, update: () => void, log: LogHandler): Promise<void> {
  try {
    const channel = resolveAlipayChannel(options);
    log(`开始支付宝自定义渠道上报: ${channel.id} ${channel.name}`);
    const subMchId = await submitCustomAlipayReport(merchantId, options);
    completeChannel(result, 'alipay', subMchId, update);
    log(`支付宝上报成功，新子商户号: ${subMchId}`);
    await confirmAlipayEnabled(merchantId, subMchId);
    log(`支付宝子商户号 ${subMchId} 已确认启用`);
    if (options.disableOldSubMch !== false) {
      const changed = await disableOldAlipayMappings(merchantId, subMchId);
      log(`旧支付宝子商户号关闭完成，处理 ${changed} 个分组`);
    }
  } catch (error) {
    failChannel(result, 'alipay', error, update);
  }
}

export async function runCustomChannelReset(
  merchantIds: string[], reportType: ReportType, options: ReportOptions,
  log: LogHandler, onResultUpdate: ResultUpdateHandler, businessLine: 'syt' | 'lhsd',
): Promise<MerchantReportResult[]> {
  const output: MerchantReportResult[] = merchantIds.map((merchantId) => ({
    merchantId, route: 'custom', businessLine,
    wechat: isRequested(reportType, 'wechat') ? pendingChannel() : skippedChannel(),
    alipay: isRequested(reportType, 'alipay') ? pendingChannel() : skippedChannel(),
  }));
  const update = () => onResultUpdate([...output]);
  update();
  const batchCount = Math.ceil(output.length / LEGACY_BATCH_SIZE);
  for (let offset = 0; offset < output.length; offset += LEGACY_BATCH_SIZE) {
    const batch = output.slice(offset, offset + LEGACY_BATCH_SIZE);
    const batchNumber = offset / LEGACY_BATCH_SIZE + 1;
    log(`旧流程重置第 ${batchNumber}/${batchCount} 批开始，商户: ${batch.map(result => result.merchantId).join('；')}`);
    await Promise.all(batch.map(async (result) => {
      const tasks: Promise<void>[] = [];
      if (isRequested(reportType, 'wechat')) tasks.push(resetWechat(result.merchantId, options, result, update, log));
      if (isRequested(reportType, 'alipay')) tasks.push(resetAlipay(result.merchantId, options, result, update, log));
      await Promise.all(tasks);
    }));
    log(`旧流程重置第 ${batchNumber}/${batchCount} 批处理完成`);
  }
  return output;
}
