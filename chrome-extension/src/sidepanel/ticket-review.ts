import { queryTask, queryTickets, type TicketRow } from '../api/ticket-review';
import { ReviewSession, validateTicketQuery } from '../tools/ticket-review';
import type { LogHandler } from '../types';

export const ticketReviewView = `<section id="syt-view-ticket-review" class="view">
  <div id="ticket-search">
    <label for="ticket-kind">查询方式</label><select id="ticket-kind"><option value="merchant">商户号</option><option value="ticket">工单号</option></select>
    <label for="ticket-query">查询号码</label><input id="ticket-query" autocomplete="off">
    <button id="ticket-find" class="primary" type="button">查询工单</button>
    <div class="ticket-table-wrap"><table class="ticket-table"><thead><tr><th>工单号</th><th>商户</th><th>状态 / 节点</th><th>操作</th></tr></thead><tbody id="ticket-rows"></tbody></table></div>
    <div class="ticket-pagination"><button id="ticket-prev" type="button" disabled>上一页</button><span id="ticket-page"></span><button id="ticket-next" type="button" disabled>下一页</button></div>
  </div>
  <div id="ticket-confirm" hidden>
    <button id="ticket-return" type="button">返回列表</button>
    <dl id="ticket-detail" class="ticket-detail"></dl>
    <label class="ticket-approve"><input id="ticket-approved" type="checkbox">资料审核通过</label>
    <div id="ticket-extra-fields"></div>
    <label for="ticket-remark">备注（必填）</label><textarea id="ticket-remark" rows="4"></textarea>
    <button id="ticket-submit" class="primary" type="button" disabled>提交审核</button>
  </div>
  <div id="ticket-status" class="status" role="status" aria-live="polite"></div>
</section>`;

export function initializeTicketReview(root: HTMLElement, log: LogHandler) {
  const el = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#ticket-${id}`)!;
  let session: ReviewSession | undefined;
  let busy = false;
  let page = 1;
  let more = false;
  let query: { kind: 'merchant' | 'ticket'; value: string } | undefined;
  let ready = false;
  const status = (message: string, error = false) => {
    el('status').textContent = message;
    el('status').className = `status${error ? ' error' : ''}`;
    log(message, error);
  };
  const update = () => {
    for (const id of ['find', 'return']) el<HTMLButtonElement>(id).disabled = busy;
    el<HTMLSelectElement>('kind').disabled = busy;
    el<HTMLInputElement>('query').disabled = busy;
    el<HTMLInputElement>('approved').disabled = busy || !ready;
    el<HTMLTextAreaElement>('remark').disabled = busy || !ready;
    const extraComplete = Array.from(el('extra-fields').querySelectorAll<HTMLSelectElement>('select[data-review-field]')).every(select => !!select.value);
    el<HTMLButtonElement>('submit').disabled = busy || !ready || !el<HTMLInputElement>('approved').checked || !el<HTMLTextAreaElement>('remark').value.trim() || !extraComplete;
    el<HTMLButtonElement>('prev').disabled = busy || page <= 1;
    el<HTMLButtonElement>('next').disabled = busy || !more;
    el('rows').querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = busy || button.dataset.available !== 'true'; });
  };
  const close = async () => {
    if (session) { await session.close(); session = undefined; }
    ready = false;
    el('confirm').hidden = true;
    el('search').hidden = false;
  };
  const load = async (targetPage = page) => {
    if (!query) return;
    const result = await queryTickets(query.kind, query.value, targetPage);
    page = targetPage;
    more = result.more;
    el('rows').replaceChildren();
    for (const row of result.rows) {
      const tr = document.createElement('tr');
      for (const text of [row.ticketNumber, `${row.merchantId}\n${row.merchantName}`, `${row.state}\n${row.node}`]) {
        const td = document.createElement('td'); td.textContent = text; tr.append(td);
      }
      const td = document.createElement('td');
      const button = document.createElement('button'); button.type = 'button'; button.textContent = '审核';
      let available = row.state === '处理中' && row.node === '运营审核';
      button.disabled = true;
      if (available) {
        try { await queryTask(row.ticketNumber); }
        catch (error) { available = false; button.title = error instanceof Error ? error.message : String(error); }
      }
      button.dataset.available = String(available);
      button.addEventListener('click', () => void run(async () => open(row)));
      td.append(button); tr.append(td); el('rows').append(tr);
    }
    el('page').textContent = `第 ${page} 页`;
    if (!result.rows.length) {
      const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 4; td.textContent = '未查询到工单'; tr.append(td); el('rows').append(tr);
    }
  };
  const open = async (row: TicketRow) => {
    await close();
    status('正在获取当前审核任务...');
    session = new ReviewSession(row);
    try { await session.prepare(); }
    catch (error) {
      try { await close(); } catch { status('释放审核锁失败，请到后台确认', true); }
      throw error;
    }
    ready = true;
    el('detail').replaceChildren();
    for (const [name, value] of [['工单号', row.ticketNumber], ['商户号', row.merchantId], ['商户名称', row.merchantName], ['当前节点', row.node]]) {
      const dt = document.createElement('dt'); dt.textContent = name;
      const dd = document.createElement('dd'); dd.textContent = value; el('detail').append(dt, dd);
    }
    el<HTMLInputElement>('approved').checked = false;
    el<HTMLTextAreaElement>('remark').value = '';
    el('extra-fields').replaceChildren();
    for (const field of session.fields) {
      const label = document.createElement('label'); label.textContent = `${field.label}（必选）`;
      const select = document.createElement('select'); select.dataset.reviewField = field.name; select.required = true;
      const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '请选择'; select.append(placeholder);
      for (const choice of field.choices) { const option = document.createElement('option'); option.value = choice.value; option.textContent = choice.label; select.append(option); }
      label.append(select); el('extra-fields').append(label);
    }
    el('search').hidden = true; el('confirm').hidden = false;
    status('已获取当前审核任务，等待确认');
  };
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    busy = true; update();
    try { await action(); }
    catch (error) { status(error instanceof Error ? error.message : String(error), true); }
    finally { busy = false; update(); }
  };
  el('find').addEventListener('click', () => void run(async () => {
    await close();
    const kind = el<HTMLSelectElement>('kind').value as 'merchant' | 'ticket';
    query = { kind, value: validateTicketQuery(kind, el<HTMLInputElement>('query').value) };
    more = false; el('rows').replaceChildren();
    status('正在查询工单...'); await load(1); status('工单查询完成');
  }));
  for (const [id, delta] of [['prev', -1], ['next', 1]] as const) el(id).addEventListener('click', () => void run(async () => { await load(page + delta); }));
  el('return').addEventListener('click', () => void run(async () => { await close(); await load(); status('工单列表已刷新'); }));
  el('approved').addEventListener('change', update);
  el('remark').addEventListener('input', update);
  el('extra-fields').addEventListener('change', update);
  el('submit').addEventListener('click', () => void run(async () => {
    if (!session || !ready) return;
    ready = false;
    status('正在提交审核...');
    const selections: Record<string, string> = {};
    el('extra-fields').querySelectorAll<HTMLSelectElement>('select[data-review-field]').forEach(select => { selections[select.dataset.reviewField!] = select.value; });
    try { status(await session.submit(el<HTMLInputElement>('approved').checked, el<HTMLTextAreaElement>('remark').value, selections)); }
    finally {
      try { await session.close(); } catch (error) { status(`${el('status').textContent}；释放审核锁失败：${error instanceof Error ? error.message : String(error)}`, true); }
    }
  }));
  window.addEventListener('pagehide', () => { void session?.close().catch(() => {}); });
  return { async leave(): Promise<boolean> {
    if (busy) { status('正在处理工单，请稍候再切换工具', true); return false; }
    let ok = false;
    await run(async () => { await close(); ok = true; });
    return ok;
  } };
}
