export interface MerchantIdParseOptions {
  maxCount?: number;
  maxCountMessage?: string;
}

export function parseMerchantIdList(raw: string, options: MerchantIdParseOptions = {}): string[] {
  const merchantIds = raw.split(/[;；,，\s]+/).map((item) => item.trim()).filter(Boolean);
  if (merchantIds.length === 0) throw new Error('请至少输入一个乐刷商户号');
  if (options.maxCount != null && merchantIds.length > options.maxCount) {
    throw new Error(options.maxCountMessage || `一次最多处理 ${options.maxCount} 个乐刷商户号`);
  }

  const duplicates = merchantIds.find((item, index) => merchantIds.indexOf(item) !== index);
  if (duplicates) throw new Error(`乐刷商户号重复: ${duplicates}`);

  const invalid = merchantIds.find((item) => !/^\d{10}$/.test(item));
  if (invalid) throw new Error(`乐刷商户号必须是 10 位数字: ${invalid}`);
  return merchantIds;
}
