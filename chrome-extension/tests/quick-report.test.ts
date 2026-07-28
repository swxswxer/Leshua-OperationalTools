import { describe, expect, it } from 'vitest';
import { parseMerchantIds, parseQuickReportResponse } from '../src/content/quick-report';

describe('parseMerchantIds', () => {
  it('keeps the semicolon input order and removes empty entries', () => {
    expect(parseMerchantIds('1234567890;;2345678901;')).toEqual(['1234567890', '2345678901']);
  });

  it('rejects duplicates, invalid IDs and batches over five', () => {
    expect(() => parseMerchantIds('1234567890;1234567890')).toThrow('重复');
    expect(() => parseMerchantIds('123')).toThrow('10 位');
    expect(() => parseMerchantIds('1234567890;2234567890;3234567890;4234567890;5234567890;6234567890')).toThrow('最多');
  });
});

describe('parseQuickReportResponse', () => {
  it('parses successful WeChat and Alipay results even when the top-level code is 1', () => {
    const results = parseQuickReportResponse({
      code: 1,
      success: true,
      data: { respCode: '0', data: [{ merchantId: '1234567890', results: [
        { channel: '微信', respCode: '0', data: { result: 0, wxMchId: '910867628' } },
        { channel: '支付宝', respCode: '0', data: { result: 0, zfbSubMch: '2088780849572424' } },
      ] }] },
    }, ['1234567890'], 'ALL');
    expect(results[0].wechat).toMatchObject({ state: 'success', subMchId: '910867628' });
    expect(results[0].alipay).toMatchObject({ state: 'success', subMchId: '2088780849572424' });
  });

  it('retains a per-channel backend failure', () => {
    const results = parseQuickReportResponse({
      success: true,
      data: { respCode: '0', data: [{ merchantId: '1234567890', results: [
        { channel: '支付宝', respCode: '1', respMsg: 'merchantId不存在', data: null },
      ] }] },
    }, ['1234567890'], 'ALIPAY');
    expect(results[0].alipay).toMatchObject({ state: 'failure', error: 'merchantId不存在' });
    expect(results[0].wechat.state).toBe('skipped');
  });
});
