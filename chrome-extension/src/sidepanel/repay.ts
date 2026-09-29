import { repayDateRange, type RepayRow } from '../api/repay';
import { repayKey, searchRepay, submitSelectedRepay } from '../tools/repay';
import type { LogHandler } from '../types';

export const repayView = `<section id="syt-view-repay" class="view">
  <form id="repay-form"><label for="repay-merchant">乐刷商户号</label><input id="repay-merchant" inputmode="numeric" autocomplete="off" required placeholder="10 位乐刷商户号"><button id="repay-search" type="submit" class="primary">查询打款单</button></form>
  <p id="repay-range" class="status"></p>
  <label class="repay-select-all"><input id="repay-all" type="checkbox" disabled>全选<span id="repay-count"></span></label>
  <div class="repay-table-wrap"><table class="repay-table"><thead><tr><th>结算方式</th><th>时间</th><th>商户号</th><th>失败原因</th></tr></thead><tbody id="repay-rows"></tbody></table></div>
  <button id="repay-apply" type="button" class="primary" disabled>申请重出</button>
  <div id="repay-confirm" hidden><p id="repay-summary"></p><button id="repay-cancel" type="button">取消</button><button id="repay-submit" type="button" class="primary">确认申请</button></div>
  <div id="repay-status" class="status" role="status" aria-live="polite"></div>
</section>`;

export function initializeRepay(root: HTMLElement, log: LogHandler): void {
  const el = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#repay-${id}`)!;
  let rows: RepayRow[] = [];
  let merchant = '';
  let busy = false;
  let confirming = false;
  const selected = new Set<string>();
  const outcomes = new Map<string, { state: string; message: string }>();
  const eligible = (row: RepayRow) => row.selectable && !outcomes.has(repayKey(row));
  const status = (message: string, error = false) => {
    el('status').textContent = message; el('status').className = `status${error ? ' error' : ''}`; log(`重出打款单：${message}`, error);
  };
  const update = () => {
    const available = rows.filter(eligible);
    el<HTMLInputElement>('merchant').disabled = busy || confirming;
    el<HTMLButtonElement>('search').disabled = busy || confirming;
    const all = el<HTMLInputElement>('all'); all.disabled = busy || confirming || !available.length;
    all.checked = !!available.length && selected.size === available.length; all.indeterminate = selected.size > 0 && selected.size < available.length;
    el('count').textContent = `已选 ${selected.size} / ${available.length} 笔`;
    el<HTMLButtonElement>('apply').disabled = busy || confirming || !selected.size;
    el<HTMLButtonElement>('submit').disabled = busy;
    el<HTMLButtonElement>('cancel').disabled = busy;
    el('confirm').hidden = !confirming;
    el('rows').querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(box => {
      const row = rows.find(row => repayKey(row) === box.value)!;
      box.disabled = busy || confirming || !eligible(row); box.checked = selected.has(box.value);
    });
  };
  const render = () => {
    el('rows').replaceChildren();
    for (const row of rows) {
      const tr = document.createElement('tr'); const td = document.createElement('td');
      const label = document.createElement('label'); const box = document.createElement('input'); box.type = 'checkbox'; box.value = repayKey(row); box.setAttribute('aria-label', `选择 ${row.type} 打款单 ${row.billId}`);
      box.addEventListener('change', () => { if (box.checked) selected.add(box.value); else selected.delete(box.value); update(); });
      label.append(box, row.type); td.append(label); tr.append(td);
      for (const text of [row.date, row.merchantId]) { const cell = document.createElement('td'); cell.textContent = text; tr.append(cell); }
      const reason = document.createElement('td'); reason.textContent = row.reason || '—';
      const outcome = outcomes.get(repayKey(row));
      if (outcome || !row.selectable) {
        const note = document.createElement('p'); note.textContent = outcome?.message || '后台记录不可勾选'; note.className = outcome?.state === 'accepted' ? 'repay-accepted' : 'error'; reason.append(note);
      }
      tr.title = `打款单号：${row.billId}`; tr.append(reason); el('rows').append(tr);
    }
    update();
  };
  el<HTMLInputElement>('merchant').addEventListener('input', () => { rows = []; merchant = ''; selected.clear(); el('status').textContent = ''; el('range').textContent = ''; render(); });
  el('form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || confirming) return;
    busy = true; rows = []; selected.clear(); merchant = ''; render();
    const range = repayDateRange(); el('range').textContent = `T0：不限时间；T1：${range}`;
    status('正在查询 T0 / T1 打款单...');
    try {
      const result = await searchRepay(el<HTMLInputElement>('merchant').value, range);
      rows = result.rows; merchant = result.merchantId;
      for (const [key, outcome] of outcomes) if (outcome.state === 'failed') outcomes.delete(key);
      status(`${rows.length ? `查询到 ${rows.length} 笔打款单` : '未查询到打款单'}${result.errors.length ? `；${result.errors.join('；')}` : ''}`, result.errors.length > 0);
    } catch (error) { status(error instanceof Error ? error.message : String(error), true); }
    finally { busy = false; render(); }
  });
  el('all').addEventListener('change', () => { selected.clear(); if (el<HTMLInputElement>('all').checked) rows.filter(eligible).forEach(row => selected.add(repayKey(row))); update(); });
  el('apply').addEventListener('click', () => {
    if (busy || !selected.size) return;
    confirming = true;
    const chosen = rows.filter(row => selected.has(repayKey(row)));
    el('summary').textContent = `确认对商户 ${merchant} 的 ${chosen.length} 笔打款单申请重出？T0：${chosen.filter(row => row.type === 'T0').length} 笔，T1：${chosen.filter(row => row.type === 'T1').length} 笔。`;
    update();
  });
  el('cancel').addEventListener('click', () => { if (!busy) { confirming = false; update(); } });
  el('submit').addEventListener('click', async () => {
    if (busy || !confirming) return;
    const chosen = rows.filter(row => selected.has(repayKey(row)) && eligible(row));
    busy = true; update(); status('正在提交重出申请...');
    try {
      await submitSelectedRepay(chosen, merchant, result => {
        for (const id of result.ids) { const key = `${result.type}:${id}`; outcomes.set(key, { state: result.state, message: result.message }); selected.delete(key); }
        log(`重出打款单 ${result.type} ${result.ids.length} 笔：${result.message}`, result.state !== 'accepted'); render();
      });
      const accepted = chosen.filter(row => outcomes.get(repayKey(row))?.state === 'accepted').length;
      status(`本次 ${chosen.length} 笔，已受理 ${accepted} 笔${accepted < chosen.length ? '；其余请查看表格提示' : '，等待后台处理（不代表打款完成）'}`, accepted < chosen.length);
    } catch (error) { status(error instanceof Error ? error.message : String(error), true); }
    finally { busy = false; confirming = false; render(); }
  });
}
