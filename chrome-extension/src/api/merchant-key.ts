import { SAAS, assertMerchantId, buildFormBody, detectHtmlError, getHtmlMessage, requestText, summarizeHtml } from './http';

export async function configureMerchantKey(merchantId: string): Promise<void> {
  assertMerchantId(merchantId);
  const html = await requestText(`${SAAS}/merchant-key-info.do?method=add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    referrer: `${SAAS}/merchant-key-info.do?method=addPage`,
    body: buildFormBody({ merchants: merchantId, submit: '确认提交' }),
  });
  const htmlError = detectHtmlError(html);
  if (htmlError) throw new Error(htmlError);
  const message = getHtmlMessage(html);
  const successMatch = message.match(/新增成功\s*[：:]\s*(\d+)\s*个/);
  const failureMatch = message.match(/新增失败\s*[：:]\s*(\d+)\s*个/);
  if (!successMatch || !failureMatch) throw new Error(`无法确认商户 key 配置结果: ${summarizeHtml(html)}`);
  const successCount = Number(successMatch[1]);
  const failureCount = Number(failureMatch[1]);
  if (successCount < 1 || failureCount > 0) throw new Error(`商户 key 配置失败，新增成功 ${successCount} 个，新增失败 ${failureCount} 个`);
}
