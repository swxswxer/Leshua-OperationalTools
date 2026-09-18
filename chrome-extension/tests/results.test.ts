import { describe, expect, it } from 'vitest';
import { copyResultText, resultSummary } from '../src/sidepanel/results';
import type { MerchantReportResult } from '../src/api/quick-report';

const result: MerchantReportResult = {
  merchantId: '1234567890', route: 'batch', businessLine: 'syt',
  wechat: { state: 'success', subMchId: '918920026' },
  alipay: { state: 'skipped' },
};

describe('侧边栏结果展示', () => {
  it('复制不包含未执行通道', () => {
    expect(copyResultText([result])).toBe('乐刷商户号1234567890\n微信子商户号:918920026');
  });
  it('保持商户顺序、失败说明及原复制格式', () => {
    const second: MerchantReportResult = { ...result, merchantId: '0987654321', wechat: { state: 'failure', error: '无权限' }, alipay: { state: 'success', subMchId: '2088880607964435' } };
    expect(copyResultText([result, second])).toBe('乐刷商户号1234567890\n微信子商户号:918920026\n乐刷商户号0987654321\n微信子商户号:失败：无权限 支付宝子商户号:2088880607964435');
  });
  it('后续流程未结束时不显示已完成', () => {
    expect(resultSummary(result, true).label).toBe('处理中');
    expect(resultSummary(result, false).label).toBe('已完成');
  });
  it('有子商户号但后续流程失败时显示失败状态且复制保留说明', () => {
    const failed = { ...result, wechat: { ...result.wechat, error: '关闭旧号失败', note: '后续流程失败：关闭旧号失败' } };
    expect(resultSummary(failed, false).tone).toBe('error');
    expect(copyResultText([failed])).toContain('918920026（后续流程失败：关闭旧号失败）');
  });
  it('等待通道结果时不能误报成功', () => {
    expect(resultSummary({ ...result, alipay: { state: 'pending' } }, false).tone).toBe('pending');
  });
});
