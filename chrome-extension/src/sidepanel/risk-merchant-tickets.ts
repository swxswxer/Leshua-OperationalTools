import { searchRiskMerchantTickets, loadRiskHandlingLinks } from '../tools/risk-merchant-tickets';
import type { LogHandler } from '../types';
import { copyText } from './helpers';
import { setButtonLabel } from './icons';

export const riskMerchantTicketsView = `<section id="syt-view-risk-tickets" class="view">
  <form id="risk-search-form">
    <label for="risk-card-type">查询类型</label><select id="risk-card-type"><option value="1">身份证</option><option value="3">营业执照</option><option value="2">银行卡号</option></select>
    <label for="risk-card-number" id="risk-number-label">身份证号</label><input id="risk-card-number" autocomplete="off" spellcheck="false" required>
    <button id="risk-search" class="primary" type="submit">查询风险商户工单</button>
  </form>
  <div id="risk-status" class="status" role="status" aria-live="polite"></div>
  <div id="risk-results"></div>
  <div class="ticket-pagination"><button id="risk-prev" type="button" disabled>上一页</button><span id="risk-page"></span><button id="risk-next" type="button" disabled>下一页</button></div>
</section>`;

export function initializeRiskMerchantTickets(root: HTMLElement, log: LogHandler): void {
  const get = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#risk-${id}`)!;
  const type = get<HTMLSelectElement>('card-type');
  const input = get<HTMLInputElement>('card-number');
  let busy = false;
  let page = 1;
  let pages = 0;
  let query: { type: string; number: string } | undefined;
  const controls = () => {
    type.disabled = input.disabled = get<HTMLButtonElement>('search').disabled = busy;
    get<HTMLButtonElement>('prev').disabled = busy || page <= 1 || !query;
    get<HTMLButtonElement>('next').disabled = busy || page >= pages || !query;
  };
  const clear = () => { query = undefined; pages = 0; page = 1; get('results').replaceChildren(); get('status').textContent = ''; get('page').textContent = ''; controls(); };
  type.addEventListener('change', () => { clear(); get('number-label').textContent = ({ '1': '身份证号', '2': '银行卡号', '3': '营业执照号' } as Record<string,string>)[type.value]; });
  input.addEventListener('input', clear);
  const search = async (target: number, fresh = false) => {
    if (busy) return;
    const current = fresh ? { type: type.value, number: input.value } : query;
    if (!current) return;
    busy = true; controls();
    get('results').replaceChildren(); get('page').textContent = '';
    get('status').textContent = '正在查询风险商户工单...'; get('status').className = 'status';
    try {
      const result = await searchRiskMerchantTickets(current.type, current.number, target);
      query = current; page = result.page; pages = result.pages;
      if (result.rows.length) get('status').textContent = `查到 ${result.rows.length} 条记录，正在获取处理链接...`;
      const rows = await loadRiskHandlingLinks(result.rows);
      for (const row of rows) {
        const section = document.createElement('article'); section.className = 'risk-ticket-row';
        const heading = document.createElement('h2'); heading.textContent = row.ticketNumber || '未关联工单'; section.append(heading);
        const dl = document.createElement('dl'); dl.className = 'ticket-detail';
        for (const [label, text] of [['商户号', row.merchantId], ['当前节点', row.node], ['名单状态', row.status], ['证件类型', row.cardType], ['证件号码', row.maskedNumber], ['创建时间', row.created], ['操作人', row.operator]]) {
          const dt = document.createElement('dt'); dt.textContent = label;
          const dd = document.createElement('dd'); dd.textContent = text || '—'; dl.append(dt, dd);
        }
        section.append(dl);
        if (row.handling) {
          const link = document.createElement('a'); link.href = row.handling.url; link.textContent = row.handling.url;
          link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'risk-handling-link';
          const message = document.createElement('textarea'); message.readOnly = true; message.value = row.handling.content; message.rows = 5; message.className = 'risk-handling-content'; message.setAttribute('aria-label', '处理通知内容');
          const actions = document.createElement('div'); actions.className = 'risk-handling-actions';
          for (const [label, text] of [['复制处理链接', row.handling.url], ['复制完整通知', row.handling.content]]) {
            const button = document.createElement('button'); button.type = 'button'; setButtonLabel(button, 'copy', label);
            button.addEventListener('click', async () => {
              try { await copyText(text); setButtonLabel(button, 'check', '已复制'); }
              catch { get('status').textContent = '复制失败，请手动选择通知内容复制'; get('status').className = 'status error'; }
            });
            actions.append(button);
          }
          section.append(link, message, actions);
        } else {
          const error = document.createElement('p'); error.className = 'status error'; error.textContent = `处理链接获取失败：${row.linkError}`; section.append(error);
        }
        get('results').append(section);
      }
      get('page').textContent = `第 ${page} / ${Math.max(pages, 1)} 页`;
      const failures = rows.filter(row => !row.handling).length;
      const message = result.rows.length ? `查询完成，共 ${result.total} 条记录；本页 ${rows.length - failures} 个处理链接${failures ? `，${failures} 条获取失败` : ''}` : '未查询到匹配记录';
      get('status').textContent = message; get('status').className = failures ? 'status error' : 'status'; log(`风险商户工单：${message}`, failures > 0);
    } catch (error) {
      query = undefined; pages = 0;
      get('status').textContent = error instanceof Error ? error.message : '查询失败';
      get('status').className = 'status error';
      // Do not put identification or bank-account values into shared logs.
      log('风险商户工单查询失败，请查看查询页面提示', true);
    } finally { busy = false; controls(); }
  };
  get('search-form').addEventListener('submit', event => { event.preventDefault(); void search(1, true); });
  get('prev').addEventListener('click', () => void search(page - 1));
  get('next').addEventListener('click', () => void search(page + 1));
}
