import type { CodePlateValues, LogHandler, StatusHandler } from '../types';
import {
  createCodePlateTransferFile,
  pollCodePlateTransferResult,
  queryCodePlateTransferMessages,
  submitCodePlateTransfer,
  summarizeCodePlateMessageValues,
} from '../api/code-plate';

export async function transferCodePlates(
  values: CodePlateValues,
  log: LogHandler,
  onStatus: StatusHandler,
): Promise<void> {
  onStatus('generating', '正在生成 Excel');
  log(`开始生成码牌划转 Excel: ${values.startCode} 至 ${values.endCode}`);
  const file = await createCodePlateTransferFile(values);
  log(`Excel 生成完成: ${file.name}（${file.size} 字节）`);

  onStatus('preparing', '正在读取消息中心基线');
  log('正在记录消息中心基线');
  const baselineMessages = await queryCodePlateTransferMessages();
  const baselineMessageIds = new Set(baselineMessages.map((message: { id: string | number }) => String(message.id)));

  onStatus('submitting', '正在提交后台');
  log(`开始提交码牌划转: ${values.sourceAgent} -> ${values.targetAgent}`);
  await submitCodePlateTransfer(values, { file });
  onStatus('waiting', '已提交，正在等待消息中心处理结果');
  log('码牌划转上传请求已返回，开始查询消息中心');

  const outcome = await pollCodePlateTransferResult(values, {
    baselineMessageIds,
    pollIntervalMs: 2000,
    pollTimeoutMs: 60000,
    onLog: log,
  });
  if (outcome.timeout) {
    const unmatchedMessage = outcome.unmatchedMessages?.[0];
    const message = unmatchedMessage
      ? `发现新消息，但参数与本次提交不匹配，请到消息中心确认。${summarizeCodePlateMessageValues(unmatchedMessage)}`
      : '已提交，但未收到本次划转结果，请到消息中心确认';
    onStatus('timeout', message);
    log(message);
    return;
  }
  onStatus('success', '码牌划转成功');
  log(`码牌划转成功，消息ID: ${outcome.result.id}`);
}
