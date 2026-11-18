import { PermissionReview, normalizePermissionApplyNo, permissionRowKey, queryPermissionApplications, type PermissionApplication, type PermissionApprovalOutcome } from '../tools/permission-review';
import type { LogHandler } from '../types';

export const permissionReviewView = `<section id="syt-view-permission-review" class="view">
  <form id="permission-form"><label for="permission-query">权限工单号</label><input id="permission-query" autocomplete="off" placeholder="QX 开头的申请单号" required><button id="permission-search" class="primary" type="submit">查询权限工单</button></form>
  <div class="permission-table-wrap"><table class="permission-table"><thead><tr><th>申请单号</th><th>当前环节</th><th>操作</th></tr></thead><tbody id="permission-rows"></tbody></table></div>
  <div id="permission-status" class="status" role="status" aria-live="polite"></div>
</section>`;

export function initializePermissionReview(root: HTMLElement, log: LogHandler): void {
  const el = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#permission-${id}`)!;
  const review = new PermissionReview();
  const outcomes = new Map<string, PermissionApprovalOutcome>();
  let rows: PermissionApplication[] = [];
  let busy = false;
  let query = '';
  const status = (message: string, error = false) => {
    el('status').textContent = message;
    el('status').className = `status${error ? ' error' : ''}`;
    log(`权限工单：${message}`, error);
  };
  const render = () => {
    el<HTMLInputElement>('query').disabled = busy;
    el<HTMLButtonElement>('search').disabled = busy;
    el('rows').replaceChildren();
    if (!rows.length && query && !busy) {
      const cell = document.createElement('td'); cell.colSpan = 3; cell.textContent = '未查询到权限工单';
      const tr = document.createElement('tr'); tr.append(cell); el('rows').append(tr);
    }
    for (const row of rows) {
      const tr = document.createElement('tr');
      for (const text of [row.applyNo, row.currentStep]) {
        const td = document.createElement('td'); td.textContent = text || '-'; tr.append(td);
      }
      const action = document.createElement('td');
      const outcome = outcomes.get(permissionRowKey(row));
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = outcome?.state === 'success' ? '已通过' : outcome?.state === 'unknown' ? '待确认' : '审核通过';
      button.disabled = busy || !row.canApprove || outcome?.state === 'success' || outcome?.state === 'unknown';
      if (!row.canApprove) button.title = '该单当前不可审核或账号没有审核权限';
      button.addEventListener('click', () => void run(async () => {
        status(`正在核对 ${row.applyNo} 的当前审批环节...`);
        const result = await review.approve(row);
        outcomes.set(permissionRowKey(row), result);
        status(`${row.applyNo}：${result.message}`, result.state !== 'success');
        if (result.state === 'success') {
          try { rows = await queryPermissionApplications(query); }
          catch (error) { status(`${row.applyNo} 审批已通过；列表刷新失败：${error instanceof Error ? error.message : String(error)}`, true); }
        }
      }));
      action.append(button);
      if (outcome) {
        const note = document.createElement('p'); note.textContent = outcome.message;
        note.className = outcome.state === 'success' ? 'success' : 'error'; action.append(note);
      }
      tr.append(action); el('rows').append(tr);
    }
  };
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    busy = true; render();
    try { await action(); }
    catch (error) { status(error instanceof Error ? error.message : String(error), true); }
    finally { busy = false; render(); }
  };
  el<HTMLInputElement>('query').addEventListener('input', () => { rows = []; query = ''; el('status').textContent = ''; render(); });
  el('form').addEventListener('submit', event => {
    event.preventDefault();
    void run(async () => {
      rows = []; query = '';
      const number = normalizePermissionApplyNo(el<HTMLInputElement>('query').value);
      status('正在查询权限工单...');
      rows = await queryPermissionApplications(number);
      query = number;
      status(rows.length ? `查询到 ${rows.length} 条权限工单` : '未查询到权限工单');
    });
  });
}
