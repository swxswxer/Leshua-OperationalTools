import { sendSnAuthorization, submitAgentContact } from '../tools/sn-authorization';
import type { LogHandler } from '../types';

export const snAuthorizationView = `
  <section id="syt-view-sn-authorization" class="view">
    <label>代理编号<input id="syt-sn-agent" inputmode="numeric" autocomplete="off"></label>
    <label>手机号<input id="syt-sn-phone" type="tel" autocomplete="off"></label>
    <label>发送人<input id="syt-sn-receiver" autocomplete="off" title="对应后台的接收人字段 receiver"></label>
    <label>邮箱<input id="syt-sn-email" type="email" autocomplete="off"></label>
    <button id="syt-sn-apply" type="button">提交代理商信息</button>
    <div class="section-title">授权码下发</div>
    <label>乐刷 SN<input id="syt-sn-value" autocomplete="off"></label>
    <button id="syt-sn-send" type="button" class="primary">发送授权码</button>
    <div id="syt-sn-status" class="status" role="status" aria-live="polite"></div>
  </section>`;

export function initializeSnAuthorization(root: HTMLElement, log: LogHandler): void {
  const view = root.querySelector<HTMLElement>('#syt-view-sn-authorization')!;
  const status = view.querySelector<HTMLElement>('#syt-sn-status')!;
  const value = (id: string) => view.querySelector<HTMLInputElement>(`#syt-sn-${id}`)!.value;
  let busy = false;
  for (const action of ['apply', 'send'] as const) {
    view.querySelector<HTMLButtonElement>(`#syt-sn-${action}`)!.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      const controls = view.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button');
      controls.forEach(control => { control.disabled = true; });
      const update = (message: string, error = false) => {
        status.style.color = '';
        status.textContent = message;
        status.className = `status${error ? ' error' : ''}`;
        log(message, error);
      };
      try {
        if (action === 'apply') {
          update('正在提交代理商信息...');
          await submitAgentContact({ agentId: value('agent'), phone: value('phone'), receiver: value('receiver'), email: value('email') });
          update('代理商信息提交成功');
        } else {
          const email = await sendSnAuthorization(value('agent'), value('value'), update);
          update(`授权码发送成功，接收邮箱：${email}`);
        }
        status.style.color = '#15803d';
      } catch (error) {
        update(`${action === 'apply' ? '代理商信息提交' : '授权码发送'}失败：${error instanceof Error ? error.message : String(error)}`, true);
        status.style.color = '';
      } finally {
        busy = false;
        controls.forEach(control => { control.disabled = false; });
      }
    });
  }
}
