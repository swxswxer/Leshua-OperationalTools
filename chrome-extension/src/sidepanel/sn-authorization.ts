import { authorizationAgentIssueError, querySnAuthorizationAgents, sendSnAuthorization, submitAgentContact, type AuthorizationAgent } from '../tools/sn-authorization';
import type { LogHandler } from '../types';

export const snAuthorizationView = `
  <section id="syt-view-sn-authorization" class="view">
    <label>代理编号<input id="syt-sn-agent" inputmode="numeric" autocomplete="off"></label>
    <button id="syt-sn-query" type="button">查询代理记录</button>
    <label>手机号<input id="syt-sn-phone" type="tel" autocomplete="off"></label>
    <label>发送人<input id="syt-sn-receiver" autocomplete="off" title="对应后台的接收人字段 receiver"></label>
    <label>邮箱<input id="syt-sn-email" type="email" autocomplete="off"></label>
    <button id="syt-sn-apply" type="button">提交代理商信息</button>
    <div id="syt-sn-records" class="sn-agent-records"></div>
    <div class="section-title">授权码下发</div>
    <label>乐刷 SN<input id="syt-sn-value" autocomplete="off"></label>
    <button id="syt-sn-send" type="button" class="primary" disabled>发送授权码</button>
    <div id="syt-sn-status" class="status" role="status" aria-live="polite"></div>
  </section>`;

export function initializeSnAuthorization(root: HTMLElement, log: LogHandler): void {
  const view = root.querySelector<HTMLElement>('#syt-view-sn-authorization')!;
  const status = view.querySelector<HTMLElement>('#syt-sn-status')!;
  const recordsView = view.querySelector<HTMLElement>('#syt-sn-records')!;
  const agentInput = view.querySelector<HTMLInputElement>('#syt-sn-agent')!;
  const send = view.querySelector<HTMLButtonElement>('#syt-sn-send')!;
  const value = (id: string) => view.querySelector<HTMLInputElement>(`#syt-sn-${id}`)!.value;
  let busy = false;
  let selected: AuthorizationAgent | null = null;

  const update = (message: string, error = false) => {
    status.textContent = message;
    status.className = `status${error ? ' error' : ''}`;
    log(message, error);
  };
  const updateControls = () => {
    view.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach(control => {
      control.disabled = busy || control.dataset.unavailable === 'true';
    });
    send.disabled = busy || !selected;
  };
  const clearRecords = () => {
    selected = null;
    recordsView.replaceChildren();
    updateControls();
  };
  const renderRecords = (records: AuthorizationAgent[]) => {
    recordsView.replaceChildren();
    if (!records.length) return;
    const table = document.createElement('table');
    table.className = 'sn-agent-table';
    const caption = document.createElement('caption');
    caption.className = 'sr-only';
    caption.textContent = '选择授权码接收记录';
    table.append(caption);
    const header = table.createTHead().insertRow();
    for (const label of ['选择', '代理编号', '邮箱', '记录状态']) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      header.append(th);
    }
    const body = table.createTBody();
    records.forEach((record, index) => {
      const row = body.insertRow();
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'syt-sn-selected-record';
      radio.value = String(index);
      radio.setAttribute('aria-label', `选择代理 ${record.agentId}，邮箱 ${record.email}，状态 ${record.status}`);
      const issueError = authorizationAgentIssueError(record);
      radio.disabled = !!issueError;
      radio.dataset.unavailable = String(!!issueError);
      if (issueError) radio.title = issueError;
      radio.addEventListener('change', () => {
        if (!radio.checked || busy) return;
        selected = record;
        body.querySelectorAll('tr').forEach(item => item.classList.toggle('selected', item === row));
        updateControls();
        update(`已选择代理 ${record.agentId}，接收邮箱：${record.email}`);
      });
      row.insertCell().append(radio);
      for (const text of [record.agentId, record.email, record.status]) row.insertCell().textContent = text || '-';
      if (issueError) { row.className = 'muted'; row.title = issueError; }
    });
    recordsView.append(table);
  };

  agentInput.addEventListener('input', () => {
    clearRecords();
    status.textContent = '';
  });
  for (const action of ['apply', 'query', 'send'] as const) {
    view.querySelector<HTMLButtonElement>(`#syt-sn-${action}`)!.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      updateControls();
      try {
        if (action === 'apply') {
          update('正在提交代理商信息...');
          await submitAgentContact({ agentId: value('agent'), phone: value('phone'), receiver: value('receiver'), email: value('email') });
          clearRecords();
          update('代理商信息提交成功，请查询并选择接收记录');
        } else if (action === 'query') {
          clearRecords();
          update('正在查询代理记录...');
          const result = await querySnAuthorizationAgents(value('agent'));
          renderRecords(result.records);
          const more = result.hasMore ? '；当前仅显示前 200 条，其余记录请到后台查看' : '';
          update(result.records.length ? `查询到 ${result.records.length} 条记录，请选择已生效的接收记录${more}` : '未查询到代理记录，请先提交代理商信息');
        } else {
          const email = await sendSnAuthorization(value('agent'), value('value'), selected, message => update(message));
          update(`授权码发送成功，接收邮箱：${email}`);
        }
      } catch (error) {
        const label = { apply: '代理商信息提交', query: '代理记录查询', send: '授权码发送' }[action];
        update(`${label}失败：${error instanceof Error ? error.message : String(error)}`, true);
      } finally {
        busy = false;
        updateControls();
      }
    });
  }
}
