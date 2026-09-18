import type { MerchantReportResult } from '../api/quick-report';
import { channelText, copyText } from './helpers';
import { setButtonLabel } from './icons';

export function copyResultText(results: MerchantReportResult[]): string {
  return results.map((result) => {
    const channels = [
      result.wechat.state !== 'skipped' ? `微信子商户号:${channelText(result.wechat)}` : '',
      result.alipay.state !== 'skipped' ? `支付宝子商户号:${channelText(result.alipay)}` : '',
    ].filter(Boolean);
    return [`乐刷商户号${result.merchantId}`, channels.join(' ')].join('\n');
  }).join('\n');
}

export function resultSummary(result: MerchantReportResult, running: boolean): { label: string; tone: string } {
  const channels = [result.wechat, result.alipay].filter((channel) => channel.state !== 'skipped');
  if (channels.some((channel) => channel.state === 'failure' || channel.error)) return { label: '存在失败项', tone: 'error' };
  if (running || channels.some((channel) => channel.state === 'pending')) return { label: '处理中', tone: 'pending' };
  return channels.length ? { label: '已完成', tone: 'success' } : { label: '未执行', tone: 'muted' };
}

function textElement(tag: string, className: string, text: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

export function renderResultList(container: HTMLElement, results: MerchantReportResult[], running: boolean, onError: (message: string) => void): void {
  container.replaceChildren();
  if (!results.length) {
    container.append(textElement('p', 'empty', running ? '正在等待后台结果...' : '暂无重置结果'));
    return;
  }
  for (const result of results) {
    const item = textElement('article', 'merchant-result', '');
    const heading = textElement('div', 'merchant-heading', '');
    const name = textElement('div', 'merchant-name', '乐刷商户号 ');
    name.append(textElement('strong', '', result.merchantId));
    const status = resultSummary(result, running);
    heading.append(name, textElement('span', `result-status ${status.tone}`, status.label));
    const lineName = result.businessLine === 'lhsd' ? '联合收单' : '收银通';
    item.append(heading, textElement('div', 'result-route', `${lineName} · ${result.route === 'batch' ? '批量重置' : '自定义渠道'}`));
    for (const [key, label] of [['wechat', '微信'], ['alipay', '支付宝']] as const) {
      const channel = result[key];
      if (channel.state === 'skipped') continue;
      const row = textElement('div', 'channel-result', '');
      const content = textElement('div', 'channel-content', '');
      content.append(textElement('span', channel.state === 'failure' ? 'error' : 'submerchant-id', channel.subMchId || channelText(channel)));
      if (channel.subMchId && (channel.error || channel.note)) {
        content.append(textElement('div', channel.error ? 'channel-note error' : 'channel-note', channel.note || `后续流程失败：${channel.error}`));
      }
      row.append(textElement('span', 'channel-name', label), content);
      if (channel.subMchId) {
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'icon-button copy-channel';
        copy.title = `复制${label}子商户号`;
        copy.setAttribute('aria-label', copy.title);
        setButtonLabel(copy, 'copy', '');
        copy.addEventListener('click', async () => {
          try {
            await copyText(channel.subMchId!);
            copy.classList.add('copied');
            setButtonLabel(copy, 'check', '');
            copy.title = '已复制';
            copy.setAttribute('aria-label', '已复制');
          } catch (error) {
            onError(`复制失败: ${error instanceof Error ? error.message : String(error)}`);
          }
        });
        row.append(copy);
      }
      item.append(row);
    }
    container.append(item);
  }
}
