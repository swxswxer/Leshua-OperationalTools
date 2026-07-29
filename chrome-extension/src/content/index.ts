import {
  type MerchantReportResult,
  type ReportType,
  parseMerchantIds,
} from './quick-report';
import type { CodePlateValues, LegacyApi, LogHandler, ReportOptions, WhitelistValues } from './contracts';
import { channelText, copyText, hasCustomChannel, validateChannels } from './helpers';
import { runBatchReset } from '../tools/batch-reset';
import { runLegacyReset } from '../tools/legacy-reset';
import { configureMerchantKey } from '../tools/merchant-key';
import { enableOnlineReceipt } from '../tools/online-receipt';
import { transferCodePlates } from '../tools/code-plate-transfer';
import { addChangeWhitelist } from '../tools/change-whitelist';

// The existing userscript is bundled locally so its verified auxiliary-tool APIs
// can be reused during the first extension release. It runs only in this
// extension's isolated content-script world, not in the page console.
// @ts-ignore JavaScript userscript is intentionally bundled as a compatibility module.
import '../../../syt-submch-reset.user.js';

const VERSION = '1.0.0';
const FLOAT_TOP_STORAGE_KEY = 'syt-extension-float-top';
const FLOAT_SIZE = 54;
const FLOAT_VIEWPORT_GAP = 8;
const PRESETS = [
  { name: '无', channelId: '', channelName: '', subAppids: '', jsapiPaths: '' },
  { name: '自定义', channelId: '', channelName: '', subAppids: '', jsapiPaths: '' },
  {
    name: '美团',
    channelId: '755607656',
    channelName: '天津三快飞跃科技有限公司',
    subAppids: 'wx1fde2c33280d64b6;wx0e8672034309be8f',
    jsapiPaths: 'https://openpay.meituan.com/;https://openpay-zc.st.meituan.com/',
  },
  {
    name: '乐店宝',
    channelId: '835134506',
    channelName: '深圳富云数科信息技术有限公司',
    subAppids: 'wx76a4c0a8a9ef465b',
    jsapiPaths: '',
  },
];

function byId<T extends HTMLElement>(root: ParentNode, id: string): T {
  const element = root.querySelector<T>(`#${id}`);
  if (!element) throw new Error(`插件页面缺少元素: ${id}`);
  return element;
}

function copyResultText(results: MerchantReportResult[]): string {
  return results.map((result) => {
    const channels = [
      result.wechat.state !== 'skipped' ? `微信子商户号:${channelText(result.wechat)}` : '',
      result.alipay.state !== 'skipped' ? `支付宝子商户号:${channelText(result.alipay)}` : '',
    ].filter(Boolean);
    return [`乐刷商户号${result.merchantId}`, channels.join(' ')].join('\n');
  }).join('\n');
}

function createPanel(api: LegacyApi): void {
  document.getElementById('syt-auto-report-panel')?.remove();
  document.getElementById('syt-extension-root')?.remove();

  const root = document.createElement('div');
  root.id = 'syt-extension-root';
  root.className = 'collapsed';
  root.innerHTML = `
    <button id="syt-extension-float" class="float-ball" type="button" title="打开收银通运营工具">收银通</button>
    <section class="panel" aria-label="收银通运营工具">
      <header><div><button id="syt-back" class="icon-button" type="button" title="返回">←</button><span id="syt-title">收银通运营工具 v${VERSION}</span></div><button id="syt-close" class="icon-button" type="button" title="收起">×</button></header>
      <main>
        <section id="syt-view-reset" class="view active">
          <label>乐刷商户号<input id="syt-merchant-ids" placeholder="最多 5 个，以 ; 分隔" autocomplete="off"></label>
          <div class="form-row"><label>重置通道<select id="syt-report-type"><option value="ALL">全部重置</option><option value="WECHAT">微信重置</option><option value="ALIPAY">支付宝重置</option></select></label><label>上报预设<select id="syt-preset">${PRESETS.map((preset, index) => `<option value="${index}">${preset.name}</option>`).join('')}</select></label></div>
          <div id="syt-channel-options" class="optional-options"><div class="section-title">可选上报渠道</div><div class="form-row"><label>微信渠道号<input id="syt-wx-channel-id" autocomplete="off"></label><label>微信渠道主体<input id="syt-wx-channel-name" autocomplete="off"></label></div><div class="form-row"><label>支付宝渠道号<input id="syt-alipay-channel-id" autocomplete="off"></label><label>支付宝渠道主体<input id="syt-alipay-channel-name" autocomplete="off"></label></div></div>
          <div class="section-title">微信支付参数（可选）</div><label>appid<input id="syt-appid" autocomplete="off"></label><label>支付授权目录<input id="syt-jsapi-paths" autocomplete="off"></label>
          <button id="syt-run-reset" class="primary" type="button">执行重置</button>
          <div class="shared-tool-actions"><button id="syt-run-key" type="button">配置商户 key</button><button id="syt-run-receipt" type="button">开通在线收款单</button></div>
          <div id="syt-reset-status" class="status"></div>
          <div class="section-title">本次重置结果</div><div class="result-table-wrap"><table><thead><tr><th>乐刷商户号</th><th>微信子商户号</th><th>支付宝子商户号</th><th>方式</th></tr></thead><tbody id="syt-results"><tr><td colspan="4" class="empty">执行后显示结果</td></tr></tbody></table></div>
          <div class="actions"><button id="syt-copy" type="button" disabled>复制结果</button><button class="nav-tool" data-view="code" type="button">码牌划转</button><button class="nav-tool" data-view="whitelist" type="button">防切户白名单</button></div>
        </section>
        <section id="syt-view-code" class="view"><div class="form-row"><label>码牌开始编号<input id="syt-code-start" autocomplete="off"></label><label>码牌结束编号<input id="syt-code-end" autocomplete="off"></label></div><div class="form-row"><label>原代理商<input id="syt-code-source" autocomplete="off"></label><label>新代理商<input id="syt-code-target" autocomplete="off"></label></div><button id="syt-run-code" class="primary" type="button">确认划转</button><div id="syt-code-status" class="status"></div></section>
        <section id="syt-view-whitelist" class="view"><div class="form-row"><label>手机号<input id="syt-white-mobile" autocomplete="off"></label><label>身份证号<input id="syt-white-id" autocomplete="off"></label></div><div class="form-row"><label>营业执照号<input id="syt-white-license" autocomplete="off"></label><label>结算账号<input id="syt-white-account" autocomplete="off"></label></div><button id="syt-run-whitelist" class="primary" type="button">添加防切户白名单</button><div id="syt-white-status" class="status"></div></section>
        <section class="log"><div class="log-actions"><button id="syt-log-toggle" type="button">展开日志</button><button id="syt-log-clear" type="button">清空日志</button></div><div id="syt-log-preview">等待执行</div><pre id="syt-log-full"></pre></section>
      </main>
    </section>`;
  document.body.append(root);

  const floatBall = byId<HTMLButtonElement>(root, 'syt-extension-float');
  const closeButton = byId<HTMLButtonElement>(root, 'syt-close');
  const backButton = byId<HTMLButtonElement>(root, 'syt-back');
  const title = byId<HTMLElement>(root, 'syt-title');
  const resetInput = byId<HTMLInputElement>(root, 'syt-merchant-ids');
  const reportType = byId<HTMLSelectElement>(root, 'syt-report-type');
  const preset = byId<HTMLSelectElement>(root, 'syt-preset');
  const channelOptions = byId<HTMLElement>(root, 'syt-channel-options');
  const wxChannelId = byId<HTMLInputElement>(root, 'syt-wx-channel-id');
  const wxChannelName = byId<HTMLInputElement>(root, 'syt-wx-channel-name');
  const alipayChannelId = byId<HTMLInputElement>(root, 'syt-alipay-channel-id');
  const alipayChannelName = byId<HTMLInputElement>(root, 'syt-alipay-channel-name');
  const appids = byId<HTMLInputElement>(root, 'syt-appid');
  const jsapiPaths = byId<HTMLInputElement>(root, 'syt-jsapi-paths');
  const runReset = byId<HTMLButtonElement>(root, 'syt-run-reset');
  const runKey = byId<HTMLButtonElement>(root, 'syt-run-key');
  const runReceipt = byId<HTMLButtonElement>(root, 'syt-run-receipt');
  const resetStatus = byId<HTMLElement>(root, 'syt-reset-status');
  const resultBody = byId<HTMLTableSectionElement>(root, 'syt-results');
  const copyButton = byId<HTMLButtonElement>(root, 'syt-copy');
  const logPreview = byId<HTMLElement>(root, 'syt-log-preview');
  const logFull = byId<HTMLPreElement>(root, 'syt-log-full');
  const logToggle = byId<HTMLButtonElement>(root, 'syt-log-toggle');
  const logClear = byId<HTMLButtonElement>(root, 'syt-log-clear');
  let latestResults: MerchantReportResult[] = [];
  let busy = false;

  const clampFloatTop = (top: number): number => Math.min(
    Math.max(FLOAT_VIEWPORT_GAP, top),
    Math.max(FLOAT_VIEWPORT_GAP, window.innerHeight - FLOAT_SIZE - FLOAT_VIEWPORT_GAP),
  );
  const setFloatTop = (top: number) => {
    root.style.top = `${clampFloatTop(top)}px`;
  };
  const restoreFloatTop = async () => {
    const { [FLOAT_TOP_STORAGE_KEY]: storedTop } = await chrome.storage.local.get(FLOAT_TOP_STORAGE_KEY);
    setFloatTop(typeof storedTop === 'number' ? storedTop : window.innerHeight - FLOAT_SIZE - 18);
  };
  void restoreFloatTop();

  const log: LogHandler = (message, isError = false) => {
    const line = `[${new Date().toLocaleString('zh-CN', { hour12: false })}] ${message}`;
    const row = document.createElement('div');
    row.textContent = line;
    row.className = isError ? 'error' : '';
    logFull.append(row);
    logPreview.textContent = line;
    logPreview.className = isError ? 'error' : '';
    logFull.scrollTop = logFull.scrollHeight;
  };
  const setStatus = (element: HTMLElement, message = '', isError = false) => {
    element.textContent = message;
    element.className = `status${isError ? ' error' : ''}`;
  };
  const setBusy = (next: boolean) => {
    busy = next;
    runReset.disabled = next;
    runKey.disabled = next;
    runReceipt.disabled = next;
    runReset.textContent = next ? '处理中...' : '执行重置';
  };
  const reportOptions = (): ReportOptions => ({
    channelId: wxChannelId.value.trim(), channelName: wxChannelName.value.trim(),
    sourcePid: alipayChannelId.value.trim(), sourceName: alipayChannelName.value.trim(),
    subAppids: appids.value.trim(), jsapiPaths: jsapiPaths.value.trim(),
    disableOldSubMch: true,
    onLog: (message, context) => log(message, context === true),
  });
  const renderResults = (results: MerchantReportResult[]) => {
    latestResults = results;
    resultBody.replaceChildren();
    if (!results.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.className = 'empty';
      cell.textContent = '执行后显示结果';
      row.append(cell);
      resultBody.append(row);
      copyButton.disabled = true;
      return;
    }
    results.forEach((result) => {
      const row = document.createElement('tr');
      [result.merchantId, channelText(result.wechat), channelText(result.alipay), result.route === 'batch' ? '批量接口' : '自定义渠道'].forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        if (value.startsWith('失败')) cell.className = 'error';
        row.append(cell);
      });
      resultBody.append(row);
    });
    copyButton.disabled = false;
  };
  const showView = (name: string) => {
    root.querySelectorAll<HTMLElement>('.view').forEach((view) => view.classList.toggle('active', view.id === `syt-view-${name}`));
    backButton.classList.toggle('visible', name !== 'reset');
    title.textContent = `${name === 'reset' ? '收银通运营工具' : ({ code: '码牌划转', whitelist: '防切户白名单' } as Record<string, string>)[name]} v${VERSION}`;
  };
  const applyPreset = () => {
    const option = PRESETS[Number(preset.value)] || PRESETS[0];
    wxChannelId.value = option.channelId;
    wxChannelName.value = option.channelName;
    appids.value = option.subAppids;
    jsapiPaths.value = option.jsapiPaths;
    channelOptions.classList.toggle('hidden', option.name === '无');
  };

  let dragStartY = 0;
  let dragStartTop = 0;
  let isDragging = false;
  let didDrag = false;
  floatBall.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    isDragging = true;
    didDrag = false;
    dragStartY = event.clientY;
    dragStartTop = root.getBoundingClientRect().top;
    floatBall.setPointerCapture(event.pointerId);
    floatBall.classList.add('dragging');
    event.preventDefault();
  });
  floatBall.addEventListener('pointermove', (event) => {
    if (!isDragging) return;
    const distance = event.clientY - dragStartY;
    if (Math.abs(distance) > 3) didDrag = true;
    setFloatTop(dragStartTop + distance);
  });
  const finishDrag = async (event: PointerEvent) => {
    if (!isDragging) return;
    isDragging = false;
    floatBall.classList.remove('dragging');
    if (floatBall.hasPointerCapture(event.pointerId)) floatBall.releasePointerCapture(event.pointerId);
    await chrome.storage.local.set({ [FLOAT_TOP_STORAGE_KEY]: root.getBoundingClientRect().top });
  };
  floatBall.addEventListener('pointerup', (event) => { void finishDrag(event); });
  floatBall.addEventListener('pointercancel', (event) => { void finishDrag(event); });
  floatBall.addEventListener('click', () => {
    if (didDrag) {
      didDrag = false;
      return;
    }
    root.classList.remove('collapsed');
  });
  window.addEventListener('resize', () => setFloatTop(root.getBoundingClientRect().top));
  closeButton.addEventListener('click', () => root.classList.add('collapsed'));
  backButton.addEventListener('click', () => showView('reset'));
  preset.addEventListener('change', applyPreset);
  root.querySelectorAll<HTMLButtonElement>('.nav-tool').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view || 'reset')));
  logToggle.addEventListener('click', () => {
    const isOpen = root.classList.toggle('log-open');
    logToggle.textContent = isOpen ? '收起日志' : '展开日志';
  });
  logClear.addEventListener('click', () => { logFull.replaceChildren(); logPreview.textContent = '等待执行'; logPreview.className = ''; });
  copyButton.addEventListener('click', async () => {
    try {
      await copyText(copyResultText(latestResults));
      log('已复制本批重置结果');
    } catch (error) {
      log(`复制失败: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  });
  runReset.addEventListener('click', async () => {
    if (busy) return;
    try {
      const merchantIds = parseMerchantIds(resetInput.value);
      const type = reportType.value as ReportType;
      const options = reportOptions();
      validateChannels(options);
      if (type === 'ALIPAY' && (options.subAppids || options.jsapiPaths)) {
        throw new Error('支付宝单独重置不能绑定微信支付参数，请选择微信或全部重置');
      }
      setBusy(true);
      renderResults([]);
      const useLegacy = hasCustomChannel(options);
      setStatus(resetStatus, useLegacy ? '使用自定义渠道旧流程处理中' : '正在调用批量重置接口');
      log(`开始${useLegacy ? '自定义渠道' : '批量'}重置: ${merchantIds.join('；')}`);
      const results = useLegacy
        ? await runLegacyReset(api, merchantIds, type, options, log, renderResults)
        : await runBatchReset(api, merchantIds, type, options, log);
      renderResults(results);
      const failed = results.filter((item) => item.wechat.state === 'failure' || item.alipay.state === 'failure' || item.wechat.error || item.alipay.error).length;
      setStatus(resetStatus, failed ? `处理完成，${failed} 个商户存在失败项` : '处理完成', failed > 0);
      log(failed ? `批次完成，${failed} 个商户存在失败项` : '批次重置完成', failed > 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(resetStatus, message, true);
      log(`重置失败: ${message}`, true);
    } finally {
      setBusy(false);
    }
  });

  const runSharedMerchantTool = (button: HTMLButtonElement, label: string, runner: (merchantId: string) => Promise<void>) => {
    button.addEventListener('click', async () => {
      if (busy) return;
      try {
        const merchantIds = parseMerchantIds(resetInput.value);
        if (merchantIds.length !== 1) throw new Error(`${label} 一次只能处理一个乐刷商户号`);
        setBusy(true);
        setStatus(resetStatus, `${label}处理中...`);
        await runner(merchantIds[0]);
        setStatus(resetStatus, `${label}处理完成`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(resetStatus, message, true);
        log(`${label}失败: ${message}`, true);
      } finally {
        setBusy(false);
      }
    });
  };
  runSharedMerchantTool(runKey, '配置商户 key', async (merchantId) => configureMerchantKey(api, merchantId, log));
  runSharedMerchantTool(runReceipt, '开通在线收款单', async (merchantId) => enableOnlineReceipt(api, merchantId, log));
  byId<HTMLButtonElement>(root, 'syt-run-code').addEventListener('click', async () => {
    const status = byId<HTMLElement>(root, 'syt-code-status');
    const values: CodePlateValues = { startCode: byId<HTMLInputElement>(root, 'syt-code-start').value.trim(), endCode: byId<HTMLInputElement>(root, 'syt-code-end').value.trim(), sourceAgent: byId<HTMLInputElement>(root, 'syt-code-source').value.trim(), targetAgent: byId<HTMLInputElement>(root, 'syt-code-target').value.trim() };
    try { setStatus(status, '处理中...'); await transferCodePlates(api, values, log, (_state, message) => setStatus(status, message)); setStatus(status, '码牌划转完成'); } catch (error) { setStatus(status, error instanceof Error ? error.message : String(error), true); }
  });
  byId<HTMLButtonElement>(root, 'syt-run-whitelist').addEventListener('click', async () => {
    const status = byId<HTMLElement>(root, 'syt-white-status');
    const values: WhitelistValues = { mobile: byId<HTMLInputElement>(root, 'syt-white-mobile').value.trim(), idCard: byId<HTMLInputElement>(root, 'syt-white-id').value.trim(), businessLicense: byId<HTMLInputElement>(root, 'syt-white-license').value.trim(), settlementAccount: byId<HTMLInputElement>(root, 'syt-white-account').value.trim() };
    try { setStatus(status, '处理中...'); await addChangeWhitelist(api, values, log, (_state, message) => setStatus(status, message)); setStatus(status, '防切户白名单添加完成'); } catch (error) { setStatus(status, error instanceof Error ? error.message : String(error), true); }
  });
  document.addEventListener('click', (event) => {
    if (!root.classList.contains('collapsed') && !root.contains(event.target as Node)) root.classList.add('collapsed');
  });
  applyPreset();
}

function bootstrap(): void {
  if (window.top !== window.self) return;
  const api = (window as unknown as { sytAutoReport?: LegacyApi }).sytAutoReport;
  if (!api) return;
  createPanel(api);
}

bootstrap();
