import { getAppealInfo, openReview, queryTask, queryTickets, releaseReview, submitReview, type AppealInfo, type TicketRow, type TicketTask } from '../api/ticket-review';

export function validateTicketQuery(kind: 'merchant' | 'ticket', value: string): string {
  const input = value.trim();
  if (!(kind === 'merchant' ? /^\d{10}$/ : /^RC\d+$/).test(input)) throw new Error(kind === 'merchant' ? '请输入 10 位乐刷商户号' : '请输入 RC 开头的完整工单号');
  return input;
}
export function assertSimpleApproval(info: AppealInfo): void {
  if (!info || !['1', '2'].includes(String(info.merchantAuthenticity)) || !['1', '2'].includes(String(info.merchantTxnType)) || !['1','2','3','4','5','6'].includes(String(info.riskSource)) || info.mtlVerifyStatus == null) throw new Error('工单信息不完整，请在后台完整审核页面处理');
  if (String(info.mtlVerifyStatus) === '6' || (['2', '3'].includes(String(info.riskSource)) && String(info.appealType) !== '3')) throw new Error('此工单涉及额外申诉信息或线下资料，请在后台完整审核页面处理');
}
export class ReviewSession {
  private task?: TicketTask;
  private attempted = false;
  private submitting = false;
  constructor(readonly row: TicketRow) {}
  async prepare(): Promise<void> {
    const current = await queryTickets('ticket', this.row.ticketNumber);
    const row = current.rows.find(row => row.ticketNumber === this.row.ticketNumber);
    if (!row || row.merchantId !== this.row.merchantId || row.state !== '处理中' || row.node !== '运营审核') throw new Error('工单已变更或不处于运营审核，请刷新列表');
    const task = await queryTask(row.ticketNumber);
    await openReview(task);
    this.task = task;
    assertSimpleApproval(await getAppealInfo(row.ticketNumber));
  }
  async submit(approved: boolean, remark: string): Promise<string> {
    if (!approved || !remark.trim()) throw new Error('请勾选资料审核通过并填写备注');
    if (!this.task || this.attempted || this.submitting) throw new Error('本次审核不可重复提交，请刷新工单确认状态');
    this.submitting = true;
    try {
      const latest = await queryTask(this.task.ticketNumber);
      if (JSON.stringify(latest) !== JSON.stringify(this.task)) throw new Error('审核任务已变化，请重新查询');
      const info = await getAppealInfo(this.task.ticketNumber);
      assertSimpleApproval(info);
      this.attempted = true;
      try { await submitReview(this.task, info, remark.trim()); }
      catch (error) { throw new Error(`${error instanceof Error ? error.message : String(error)}。请刷新工单确认结果，勿直接重复审核`); }
      try {
        const { rows } = await queryTickets('ticket', this.task.ticketNumber);
        const current = rows.find(row => row.ticketNumber === this.task!.ticketNumber);
        return `审核提交成功${current ? `；当前状态：${current.state}，节点：${current.node}` : '；未查询到后续状态，请到后台确认'}`;
      } catch { return '审核提交成功；后续状态查询失败，请刷新工单确认'; }
    } finally { this.submitting = false; }
  }
  async close(): Promise<void> {
    if (!this.task || this.submitting) return;
    const task = this.task;
    await releaseReview(task);
    this.task = undefined;
  }
}
