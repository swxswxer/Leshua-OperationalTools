import type { LogHandler, StatusHandler, WhitelistValues } from '../types';
import { addMerchantChangeWhitelist, type WhitelistDataType } from '../api/whitelist';

const FIELDS = [
  { key: 'mobile', type: '1', label: '手机号' },
  { key: 'idCard', type: '2', label: '身份证号' },
  { key: 'businessLicense', type: '3', label: '营业执照号' },
  { key: 'settlementAccount', type: '4', label: '结算账号' },
] as const;

export async function addChangeWhitelist(
  values: WhitelistValues,
  log: LogHandler,
  onStatus: StatusHandler,
): Promise<void> {
  const items = FIELDS
    .map((field) => ({ ...field, value: values[field.key].trim() }))
    .filter((field) => field.value);
  if (!items.length) throw new Error('请至少填写手机号、身份证号、营业执照号或结算账号中的一项');
  onStatus('submitting', `正在并发提交 ${items.length} 项白名单`);
  log(`开始添加防切户白名单，共 ${items.length} 项`);
  const results = await Promise.all(items.map(async (item) => {
    try {
      await addMerchantChangeWhitelist(item.type as WhitelistDataType, item.value);
      return { label: item.label, ok: true, error: '' };
    } catch (error) {
      return { label: item.label, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }));
  results.forEach((result) => log(`${result.label}防切户白名单添加${result.ok ? '成功' : `失败: ${result.error}`}`, !result.ok));
  const failures = results.filter((result) => !result.ok);
  if (failures.length) {
    const message = failures.map((item) => `${item.label}: ${item.error}`).join('；');
    onStatus('failure', message);
    throw new Error(`防切户白名单添加存在失败项：${message}`);
  }
  onStatus('success', '防切户白名单添加完成');
}
