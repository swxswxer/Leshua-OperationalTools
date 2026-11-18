import { getPermissionApprovalTask, queryPermissionApplications, submitPermissionApproval, type PermissionApplication } from '../api/permission-review';
export { normalizePermissionApplyNo, queryPermissionApplications, type PermissionApplication } from '../api/permission-review';

export interface PermissionApprovalOutcome { state: 'success' | 'failed' | 'unknown'; message: string }
export const permissionRowKey = (row: PermissionApplication) => `${row.applyNo}|${row.round}|${row.statusCode}|${row.currentStep}`;

export class PermissionReview {
  private busy = false;
  private attempted = new Set<string>();

  async approve(row: PermissionApplication): Promise<PermissionApprovalOutcome> {
    if (this.busy) throw new Error('正在处理权限工单，请稍候');
    if (!row.canApprove || ![10, 30].includes(row.statusCode ?? -1)) throw new Error('当前申请单不可审核或没有审核权限');
    this.busy = true;
    try {
      const latest = (await queryPermissionApplications(row.applyNo)).find(item => item.applyNo === row.applyNo);
      if (!latest?.canApprove || permissionRowKey(latest) !== permissionRowKey(row)) throw new Error('申请单状态、环节或轮次已变更，请重新查询');
      const task = await getPermissionApprovalTask(latest);
      const key = task.stepId == null
        ? `${permissionRowKey(latest)}|legacy`
        : `${task.applyNo}|${task.stepId}`;
      if (this.attempted.has(key)) throw new Error('本环节已提交或结果待确认，请查询或到后台核实，勿重复审核');
      this.attempted.add(key);
      try {
        const response = await submitPermissionApproval(task);
        if (!response.accepted) {
          this.attempted.delete(key);
          return { state: 'failed', message: `审批失败：${response.message}` };
        }
        return { state: 'success', message: response.message };
      } catch (error) {
        return { state: 'unknown', message: `审批结果待确认：${error instanceof Error ? error.message : String(error)}；请到后台核实，勿重复审核` };
      }
    } finally { this.busy = false; }
  }
}
