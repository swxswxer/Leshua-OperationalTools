import type { ChannelResult, ReportType } from './quick-report';
import type { ReportOptions } from './contracts';

export function channelText(result: ChannelResult): string {
  if (result.state === 'success') return `${result.subMchId}${result.note ? `（${result.note}）` : ''}`;
  if (result.state === 'pending') return '处理中';
  if (result.state === 'skipped') return '未执行';
  return `失败：${result.error || '未知错误'}`;
}

export function validateChannels(options: ReportOptions): void {
  if (Boolean(options.channelId) !== Boolean(options.channelName)) {
    throw new Error('微信渠道号与渠道号主体必须同时填写');
  }
  if (Boolean(options.sourcePid) !== Boolean(options.sourceName)) {
    throw new Error('支付宝渠道号与渠道号主体必须同时填写');
  }
}

export function hasCustomChannel(options: ReportOptions): boolean {
  return Boolean(options.channelId || options.channelName || options.sourcePid || options.sourceName);
}

export function isRequested(type: ReportType, channel: 'wechat' | 'alipay'): boolean {
  return type === 'ALL' || (type === 'WECHAT' && channel === 'wechat') || (type === 'ALIPAY' && channel === 'alipay');
}

export function skippedChannel(): ChannelResult {
  return { state: 'skipped' };
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some browsers reject asynchronous clipboard writes; use the legacy fallback below.
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('浏览器拒绝复制权限');
}
