import { describe, expect, it } from 'vitest';
import { parseMerchantKeyIds } from '../src/tools/merchant-key';

describe('parseMerchantKeyIds', () => {
  it('支持英文分号分隔且没有 5 个数量限制', () => {
    const ids = Array.from({ length: 6 }, (_, index) => `${index + 1}`.padStart(10, '0'));
    expect(parseMerchantKeyIds(ids.join(';'))).toEqual(ids);
  });

  it('忽略空项并拒绝重复商户号', () => {
    expect(parseMerchantKeyIds('1234567890;;2345678901;')).toEqual(['1234567890', '2345678901']);
    expect(() => parseMerchantKeyIds('1234567890;1234567890')).toThrow('重复');
  });

  it('拒绝非 10 位数字商户号', () => {
    expect(() => parseMerchantKeyIds('123')).toThrow('10 位数字');
    expect(() => parseMerchantKeyIds('123456789a')).toThrow('10 位数字');
  });
});
