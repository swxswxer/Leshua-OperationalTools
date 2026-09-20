import {
  type MerchantReportResult,
  type ReportMode,
  type ReportType,
  parseMerchantIds,
} from '../api/quick-report';
import type { CodePlateValues, LogHandler, ReportOptions, WhitelistValues } from '../types';
import { copyText, hasCustomChannel, validateChannels } from './helpers';
import { icon, setButtonLabel } from './icons';
import { copyResultText, renderResultList } from './results';
import { initializeDisplaySize } from './display';
import { runBatchReset } from '../tools/batch-reset';
import { runCustomChannelReset } from '../tools/custom-channel-reset';
import { configureMerchantKeys, parseMerchantKeyIds } from '../tools/merchant-key';
import { transferCodePlates } from '../tools/code-plate-transfer';
import { addChangeWhitelist } from '../tools/change-whitelist';
import { bindLatestWechatPaymentConfig } from '../tools/payment-config';
import { saveDeviceBindConfig } from '../tools/device-bind-config';
import { reportCups } from '../tools/cups-report';
import { initializeSnAuthorization, snAuthorizationView } from './sn-authorization';
import {
  queryNewDeviceAgent,
  queryOldDeviceAgent,
  submitDeviceTransfer,
  submitLhsdDeviceTransfer,
  type DeviceTransferValues,
  type LhsdDeviceTransferValues,
} from '../tools/device-transfer';

const VERSION = chrome.runtime.getManifest().version;
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

function businessLineName(businessLine: 'syt' | 'lhsd'): string {
  return businessLine === 'lhsd' ? '联合收单' : '收银通';
}

function createPanel(): void {
  document.getElementById('syt-extension-root')?.remove();

  const root = document.createElement('div');
  root.id = 'syt-extension-root';
  root.innerHTML = `
    <section class="panel" aria-label="运营工具">
      <header class="app-header"><span class="brand">${icon('wrench')}运营工具</span><div class="header-settings"><label class="sr-only" for="syt-display-size">显示大小</label><select id="syt-display-size" title="显示大小"><option value="compact">紧凑</option><option value="standard">标准</option><option value="large">大字</option></select><span class="version">v${VERSION}</span></div></header>
      <div id="syt-display-status" class="display-status" role="status"></div>
      <main>
        <div class="tool-heading"><div><button id="syt-back" class="icon-button" type="button" title="返回重置页面" aria-label="返回重置页面">${icon('back')}</button><h1 id="syt-title">子商户号重置</h1></div><select id="syt-tool-select" aria-label="切换工具"><option value="" disabled selected>切换工具</option><option value="reset">子商户号重置</option><option value="code">码牌划转</option><option value="device">收银通机具划拨</option><option value="lhsd-device">联合收单机具划拨</option><option value="whitelist">防切户白名单</option><option value="bind-config">设备换绑配置</option></select></div>
        <section id="syt-view-reset" class="view active">
          <fieldset class="segmented business-line"><legend class="sr-only">重置业务线</legend><label><input type="radio" name="syt-business-line" value="syt" checked>收银通</label><label><input type="radio" name="syt-business-line" value="lhsd">联合收单</label></fieldset>
          <label for="syt-merchant-ids">乐刷商户号</label><div class="input-clear"><input id="syt-merchant-ids" placeholder="多个商户号以 ; 分隔" autocomplete="off" aria-describedby="syt-merchant-hint"><button id="syt-clear-merchant" type="button" class="icon-button" title="清空商户号" aria-label="清空商户号">${icon('close')}</button></div><div id="syt-merchant-hint" class="field-hint" aria-live="polite">重置最多 5 个 · 配置 key 不限数量</div>
          <fieldset class="segmented report-channels"><legend class="sr-only">重置通道</legend><label><input type="radio" name="syt-report-type" value="WECHAT">微信</label><label><input type="radio" name="syt-report-type" value="ALIPAY">支付宝</label><label><input type="radio" name="syt-report-type" value="ALL" checked>全部</label></fieldset>
          <details id="syt-optional-config" class="optional-config"><summary>${icon('chevron')}<span>可选配置</span><span id="syt-optional-summary">渠道 · appid · 授权目录</span></summary><div class="optional-content"><label>上报预设<select id="syt-preset">${PRESETS.map((preset, index) => `<option value="${index}">${preset.name}</option>`).join('')}</select></label>
          <div id="syt-channel-options" class="optional-options"><div class="section-title">可选上报渠道</div><div class="form-row"><label>微信渠道号<input id="syt-wx-channel-id" autocomplete="off"></label><label>微信渠道主体<input id="syt-wx-channel-name" autocomplete="off"></label></div><div class="form-row"><label>支付宝渠道号<input id="syt-alipay-channel-id" autocomplete="off"></label><label>支付宝渠道主体<input id="syt-alipay-channel-name" autocomplete="off"></label></div></div>
          <div class="section-title">微信支付参数（可选）</div><label>appid<input id="syt-appid" autocomplete="off"></label><label>支付授权目录<input id="syt-jsapi-paths" autocomplete="off"></label>
          </div></details>
          <button id="syt-run-reset" class="primary" type="button">执行重置</button>
          <div class="secondary-actions"><button id="syt-run-payment-config" type="button">配置绑定</button><button id="syt-run-key" type="button">配置商户 key</button></div>
          <div id="syt-reset-status" class="status" role="status"></div>
          <section class="results-section" aria-label="本次结果"><div class="results-heading"><h2>本次结果</h2><button id="syt-copy" class="text-button" type="button" disabled>${icon('copy')}复制全部</button></div><div id="syt-results"><p class="empty">暂无重置结果</p></div></section>
        </section>
        ${snAuthorizationView}
        <section id="syt-view-cups" class="view">
          <label for="syt-cups-merchant">乐刷商户号</label><input id="syt-cups-merchant" inputmode="numeric" autocomplete="off" placeholder="10 位乐刷商户号">
          <button id="syt-run-cups" class="primary" type="button">提交上报申请</button><div id="syt-cups-status" class="status" role="status" aria-live="polite"></div>
        </section>
        <section id="syt-view-bind-config" class="view">
          <label>乐刷 SN（必填）<span class="field-help" tabindex="0" aria-label="设备换绑配置说明" aria-describedby="syt-bind-config-help">?<span id="syt-bind-config-help" class="field-help-tooltip" role="tooltip">点击确认配置后，先按乐刷 SN 查询已有配置：有记录则修改该记录，没有记录则新增配置。查询失败时不会继续提交。</span></span><input id="syt-bind-config-sn" autocomplete="off" required></label>
          <div class="form-row"><label>单日最大绑定次数<input id="syt-bind-config-day" type="number" min="0" step="1" value="3" placeholder="3"></label><label>单月最大绑定次数<input id="syt-bind-config-month" type="number" min="0" step="1" value="3" placeholder="3"></label></div>
          <fieldset class="business-line"><legend>结算主体白名单</legend><label><input type="radio" name="syt-bind-config-whitelist" value="1" checked>是</label><label><input type="radio" name="syt-bind-config-whitelist" value="0">否</label></fieldset>
          <button id="syt-run-bind-config" class="primary" type="button">确认配置</button><div id="syt-bind-config-status" class="status" role="status"></div>
        </section>
        <section id="syt-view-code" class="view"><div class="form-row"><label>码牌开始编号<input id="syt-code-start" autocomplete="off"></label><label>码牌结束编号<input id="syt-code-end" autocomplete="off"></label></div><div class="form-row"><label>原代理商<input id="syt-code-source" autocomplete="off"></label><label>新代理商<input id="syt-code-target" autocomplete="off"></label></div><button id="syt-run-code" class="primary" type="button">确认划转</button><div id="syt-code-status" class="status"></div></section>
        <section id="syt-view-device" class="view"><div class="section-title">机具信息</div><div class="form-row"><label>乐刷 SN 始<input id="syt-device-sn" autocomplete="off"></label><label>数量<input id="syt-device-quantity" value="1" readonly></label></div><button id="syt-device-query-old" type="button">查询旧代理商</button><div class="section-title">旧代理商</div><label>旧代理商编号<input id="syt-device-old-id" readonly></label><label>旧代理商名称<input id="syt-device-old-name" readonly></label><label>旧代理商类型<input id="syt-device-old-type" readonly></label><div class="section-title">新代理商</div><label>新代理商编号<input id="syt-device-new-id" autocomplete="off"></label><label>新代理商名称<input id="syt-device-new-name" readonly></label><label>新代理商类型<input id="syt-device-new-type" readonly></label><button id="syt-run-device" class="primary" type="button">确认划拨</button><div id="syt-device-status" class="status"></div></section>
        <section id="syt-view-lhsd-device" class="view"><label>SN<input id="syt-lhsd-device-sn" autocomplete="off"></label><label>旧代理商编号<input id="syt-lhsd-device-old-id" autocomplete="off"></label><label>新代理商编号<input id="syt-lhsd-device-new-id" autocomplete="off"></label><button id="syt-run-lhsd-device" class="primary" type="button">确认划拨</button><div id="syt-lhsd-device-status" class="status"></div></section>
        <section id="syt-view-whitelist" class="view"><div class="form-row"><label>手机号<input id="syt-white-mobile" autocomplete="off"></label><label>身份证号<input id="syt-white-id" autocomplete="off"></label></div><div class="form-row"><label>营业执照号<input id="syt-white-license" autocomplete="off"></label><label>结算账号<input id="syt-white-account" autocomplete="off"></label></div><button id="syt-run-whitelist" class="primary" type="button">添加防切户白名单</button><div id="syt-white-status" class="status"></div></section>
        <section class="log"><div class="log-actions"><button id="syt-log-toggle" class="text-button" type="button" aria-expanded="false" aria-controls="syt-log-full">${icon('chevron')}运行日志</button><button id="syt-log-clear" class="icon-button" type="button" title="清空日志" aria-label="清空日志">${icon('trash')}</button></div><div id="syt-log-preview" aria-live="polite">等待执行</div><div id="syt-log-full"></div></section>
      </main>
    </section>`;
  document.body.append(root);
  initializeDisplaySize(byId<HTMLSelectElement>(root, 'syt-display-size'), byId<HTMLElement>(root, 'syt-display-status'));

  const backButton = byId<HTMLButtonElement>(root, 'syt-back');
  const title = byId<HTMLElement>(root, 'syt-title');
  const resetInput = byId<HTMLInputElement>(root, 'syt-merchant-ids');
  const businessLineInputs = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="syt-business-line"]'));
  const toolSelect = byId<HTMLSelectElement>(root, 'syt-tool-select');
  toolSelect.add(new Option('CUPS 上报', 'cups'));
  toolSelect.add(new Option('SN 授权码下发', 'sn-authorization'));
  const clearMerchant = byId<HTMLButtonElement>(root, 'syt-clear-merchant');
  const merchantHint = byId<HTMLElement>(root, 'syt-merchant-hint');
  const optionalConfig = byId<HTMLDetailsElement>(root, 'syt-optional-config');
  const preset = byId<HTMLSelectElement>(root, 'syt-preset');
  const channelOptions = byId<HTMLElement>(root, 'syt-channel-options');
  const wxChannelId = byId<HTMLInputElement>(root, 'syt-wx-channel-id');
  const wxChannelName = byId<HTMLInputElement>(root, 'syt-wx-channel-name');
  const alipayChannelId = byId<HTMLInputElement>(root, 'syt-alipay-channel-id');
  const alipayChannelName = byId<HTMLInputElement>(root, 'syt-alipay-channel-name');
  const appids = byId<HTMLInputElement>(root, 'syt-appid');
  const jsapiPaths = byId<HTMLInputElement>(root, 'syt-jsapi-paths');
  const runReset = byId<HTMLButtonElement>(root, 'syt-run-reset');
  const runPaymentConfig = byId<HTMLButtonElement>(root, 'syt-run-payment-config');
  const runKey = byId<HTMLButtonElement>(root, 'syt-run-key');
  const resetStatus = byId<HTMLElement>(root, 'syt-reset-status');
  const resultBody = byId<HTMLElement>(root, 'syt-results');
  const copyButton = byId<HTMLButtonElement>(root, 'syt-copy');
  const logPreview = byId<HTMLElement>(root, 'syt-log-preview');
  const logFull = byId<HTMLElement>(root, 'syt-log-full');
  const logToggle = byId<HTMLButtonElement>(root, 'syt-log-toggle');
  const logClear = byId<HTMLButtonElement>(root, 'syt-log-clear');
  let latestResults: MerchantReportResult[] = [];
  let busy = false;
  let resetRunning = false;

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
    runPaymentConfig.disabled = next;
    runKey.disabled = next;
    root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('#syt-view-reset input, #syt-view-reset select').forEach((control) => { control.disabled = next; });
    clearMerchant.disabled = next;
    runReset.textContent = next ? '处理中...' : '执行重置';
  };
  const reportOptions = (): ReportOptions => ({
    channelId: wxChannelId.value.trim(), channelName: wxChannelName.value.trim(),
    sourcePid: alipayChannelId.value.trim(), sourceName: alipayChannelName.value.trim(),
    subAppids: appids.value.trim(), jsapiPaths: jsapiPaths.value.trim(),
    disableOldSubMch: true,
  });
  const selectedBusinessLine = (): 'syt' | 'lhsd' => businessLineInputs.find((input) => input.checked)?.value === 'lhsd' ? 'lhsd' : 'syt';
  const renderResults = (results: MerchantReportResult[]) => {
    latestResults = results;
    renderResultList(resultBody, results, resetRunning, (message) => log(message, true));
    copyButton.disabled = !results.length;
    copyButton.classList.remove('copied');
    setButtonLabel(copyButton, 'copy', '复制全部');
  };
  const copyCurrentResults = async (automatic = false) => {
    if (!latestResults.length) return;
    try {
      await copyText(copyResultText(latestResults));
      copyButton.classList.add('copied');
      setButtonLabel(copyButton, 'check', '已复制');
      log(automatic ? '已自动复制本批重置结果' : '已复制本批重置结果');
    } catch (error) {
      copyButton.classList.remove('copied');
      setButtonLabel(copyButton, 'copy', '复制全部');
      log(`复制失败: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  };
  const showView = (name: string) => {
    root.querySelectorAll<HTMLElement>('.view').forEach((view) => view.classList.toggle('active', view.id === `syt-view-${name}`));
    backButton.classList.toggle('visible', name !== 'reset');
    title.textContent = name === 'reset' ? '子商户号重置' : ({ 'sn-authorization': 'SN 授权码下发', cups: 'CUPS 上报', code: '码牌划转', device: '收银通机具划拨', 'lhsd-device': '联合收单机具划拨', 'bind-config': '设备换绑配置', whitelist: '防切户白名单' } as Record<string, string>)[name];
    toolSelect.value = '';
  };
  const updateOptionalSummary = () => {
    const configured = Object.values(reportOptions()).some((value) => typeof value === 'string' && value.trim());
    byId<HTMLElement>(root, 'syt-optional-summary').textContent = configured ? '已配置' : '渠道 · appid · 授权目录';
  };
  const applyPreset = () => {
    const option = PRESETS[Number(preset.value)] || PRESETS[0];
    wxChannelId.value = option.channelId;
    wxChannelName.value = option.channelName;
    appids.value = option.subAppids;
    jsapiPaths.value = option.jsapiPaths;
    channelOptions.classList.toggle('hidden', option.name === '无');
    updateOptionalSummary();
  };
  const updateMerchantHint = () => {
    const ids = resetInput.value.split(';').map((value) => value.trim()).filter(Boolean);
    let message = ids.length ? `已识别 ${ids.length} 个商户 · 重置最多 5 个` : '重置最多 5 个 · 配置 key 不限数量';
    let invalid = false;
    if (ids.some((id) => !/^\d{10}$/.test(id))) { message = '商户号需为 10 位数字，多个以英文 ; 分隔'; invalid = true; }
    else if (new Set(ids).size !== ids.length) { message = '存在重复商户号，请检查'; invalid = true; }
    else if (ids.length > 5) message = `已识别 ${ids.length} 个商户 · 仅配置 key 支持超过 5 个`;
    merchantHint.textContent = message;
    merchantHint.classList.toggle('error', invalid);
    resetInput.setAttribute('aria-invalid', String(invalid));
  };
  const clearMerchantInput = () => {
    if (busy) return;
    resetInput.value = '';
    updateMerchantHint();
    resetInput.focus();
  };
  resetInput.addEventListener('dblclick', clearMerchantInput);
  resetInput.addEventListener('input', updateMerchantHint);
  clearMerchant.addEventListener('click', clearMerchantInput);
  optionalConfig.addEventListener('input', updateOptionalSummary);
  backButton.addEventListener('click', () => showView('reset'));
  preset.addEventListener('change', applyPreset);
  toolSelect.addEventListener('change', () => showView(toolSelect.value));
  logToggle.addEventListener('click', () => {
    const isOpen = root.classList.toggle('log-open');
    logToggle.setAttribute('aria-expanded', String(isOpen));
  });
  logClear.addEventListener('click', () => { logFull.replaceChildren(); logPreview.textContent = '等待执行'; logPreview.className = ''; });
  copyButton.addEventListener('click', async () => {
    await copyCurrentResults();
  });
  runReset.addEventListener('click', async () => {
    if (busy) return;
    try {
      const merchantIds = parseMerchantIds(resetInput.value);
      const type = root.querySelector<HTMLInputElement>('input[name="syt-report-type"]:checked')!.value as ReportType;
      const businessLine = selectedBusinessLine();
      const reportMode: ReportMode = businessLine === 'lhsd' ? 'COMMON' : 'SYT';
      const options = reportOptions();
      validateChannels(options);
      if (type === 'ALIPAY' && (options.subAppids || options.jsapiPaths)) {
        throw new Error('支付宝单独重置不能绑定微信支付参数，请选择微信或全部重置');
      }
      setBusy(true);
      resetRunning = true;
      renderResults([]);
      const useCustomChannel = hasCustomChannel(options);
      setStatus(resetStatus, useCustomChannel ? `正在处理${businessLineName(businessLine)}自定义渠道重置` : `正在调用${businessLineName(businessLine)}批量重置接口`);
      log(`开始${businessLineName(businessLine)}${useCustomChannel ? '自定义渠道' : '批量'}重置: ${merchantIds.join('；')}`);
      const results = useCustomChannel
        ? await runCustomChannelReset(merchantIds, type, options, log, renderResults, businessLine)
        : await runBatchReset(merchantIds, type, options, log, reportMode);
      resetRunning = false;
      renderResults(results);
      await copyCurrentResults(true);
      const failed = results.filter((item) => item.wechat.state === 'failure' || item.alipay.state === 'failure' || item.wechat.error || item.alipay.error).length;
      setStatus(resetStatus, failed ? `处理完成，${failed} 个商户存在失败项` : '处理完成', failed > 0);
      log(failed ? `批次完成，${failed} 个商户存在失败项` : '批次重置完成', failed > 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(resetStatus, message, true);
      log(`重置失败: ${message}`, true);
    } finally {
      if (resetRunning) { resetRunning = false; renderResults(latestResults); }
      setBusy(false);
    }
  });

  runPaymentConfig.addEventListener('click', async () => {
    if (busy) return;
    try {
      const merchantIds = parseMerchantIds(resetInput.value);
      if (merchantIds.length !== 1) throw new Error('配置绑定一次只能处理一个乐刷商户号');
      const options = reportOptions();
      if (!options.subAppids && !options.jsapiPaths) {
        optionalConfig.open = true;
        appids.focus();
        throw new Error('请至少填写 appid 或支付授权目录');
      }
      setBusy(true);
      setStatus(resetStatus, '正在查询最新微信映射记录并配置绑定...');
      log(`开始为商户 ${merchantIds[0]} 配置微信支付参数`);
      const result = await bindLatestWechatPaymentConfig(merchantIds[0], options);
      const id = result.id || '-';
      setStatus(resetStatus, '微信支付参数绑定完成');
      log(`查询到最新微信映射记录：子商户号 ${result.wxSubMchId || '-'}，id ${id}`);
      log(`商户 ${merchantIds[0]} 微信支付参数绑定完成，配置记录 id: ${id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(resetStatus, message, true);
      log(`配置绑定失败: ${message}`, true);
    } finally {
      setBusy(false);
    }
  });

  runKey.addEventListener('click', async () => {
    if (busy) return;
    try {
      const merchantIds = parseMerchantKeyIds(resetInput.value);
      setBusy(true);
      setStatus(resetStatus, `正在批量配置 ${merchantIds.length} 个商户的 key...`);
      const results = await configureMerchantKeys(merchantIds, log);
      setStatus(resetStatus, '');
      for (const result of results) {
        const item = document.createElement('div');
        const message = document.createElement('p');
        message.textContent = `${result.merchantId}：${result.ok ? '配置成功' : `配置失败：${result.error}`}${result.queryError ? `；查询失败：${result.queryError}` : ''}`;
        if (!result.ok || result.queryError) message.className = 'error';
        item.append(message);
        if (result.key) {
          const field = document.createElement('input');
          field.readOnly = true;
          field.value = result.key;
          field.setAttribute('aria-label', `商户 ${result.merchantId} 的 key`);
          field.addEventListener('click', () => field.select());
          item.append(field);
        }
        resetStatus.append(item);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(resetStatus, message, true);
      log(`配置商户 key 失败: ${message}`, true);
    } finally {
      setBusy(false);
    }
  });
  byId<HTMLButtonElement>(root, 'syt-run-code').addEventListener('click', async () => {
    const status = byId<HTMLElement>(root, 'syt-code-status');
    const values: CodePlateValues = { startCode: byId<HTMLInputElement>(root, 'syt-code-start').value.trim(), endCode: byId<HTMLInputElement>(root, 'syt-code-end').value.trim(), sourceAgent: byId<HTMLInputElement>(root, 'syt-code-source').value.trim(), targetAgent: byId<HTMLInputElement>(root, 'syt-code-target').value.trim() };
    try { setStatus(status, '处理中...'); await transferCodePlates(values, log, (_state, message) => setStatus(status, message)); setStatus(status, '码牌划转完成'); } catch (error) { setStatus(status, error instanceof Error ? error.message : String(error), true); }
  });
  const deviceSn = byId<HTMLInputElement>(root, 'syt-device-sn');
  const deviceOldId = byId<HTMLInputElement>(root, 'syt-device-old-id');
  const deviceOldName = byId<HTMLInputElement>(root, 'syt-device-old-name');
  const deviceOldType = byId<HTMLInputElement>(root, 'syt-device-old-type');
  const deviceNewId = byId<HTMLInputElement>(root, 'syt-device-new-id');
  const deviceNewName = byId<HTMLInputElement>(root, 'syt-device-new-name');
  const deviceNewType = byId<HTMLInputElement>(root, 'syt-device-new-type');
  const deviceQueryOld = byId<HTMLButtonElement>(root, 'syt-device-query-old');
  const deviceSubmit = byId<HTMLButtonElement>(root, 'syt-run-device');
  const deviceStatus = byId<HTMLElement>(root, 'syt-device-status');
  let deviceBusy = false;
  let oldAgentLookupKey = '';
  let newAgentLookupKey = '';
  const deviceValues = (): DeviceTransferValues => ({
    sn: deviceSn.value.trim(),
    quantity: '1',
    oldAgentId: deviceOldId.value.trim(),
    oldAgentName: deviceOldName.value.trim(),
    oldAgentType: deviceOldType.value.trim(),
    newAgentId: deviceNewId.value.trim(),
    newAgentName: deviceNewName.value.trim(),
    newAgentType: deviceNewType.value.trim(),
  });
  const setDeviceBusy = (next: boolean) => {
    deviceBusy = next;
    deviceQueryOld.disabled = next;
    deviceSubmit.disabled = next;
    deviceSn.disabled = next;
    deviceNewId.disabled = next;
  };
  const clearNewAgent = () => {
    deviceNewName.value = '';
    deviceNewType.value = '';
    newAgentLookupKey = '';
  };
  const clearOldAgent = () => {
    deviceOldId.value = '';
    deviceOldName.value = '';
    deviceOldType.value = '';
    oldAgentLookupKey = '';
    clearNewAgent();
  };
  const loadOldAgent = async () => {
    const sn = deviceSn.value.trim();
    clearOldAgent();
    const agent = await queryOldDeviceAgent(sn);
    deviceOldId.value = agent.id;
    deviceOldName.value = agent.name;
    deviceOldType.value = agent.type;
    oldAgentLookupKey = sn;
    log(`机具 ${sn} 的旧代理商: ${agent.id} ${agent.name}`);
  };
  const loadNewAgent = async () => {
    const sn = deviceSn.value.trim();
    if (oldAgentLookupKey !== sn) await loadOldAgent();
    const newAgentId = deviceNewId.value.trim();
    clearNewAgent();
    const agent = await queryNewDeviceAgent(sn, deviceOldId.value, newAgentId);
    deviceNewName.value = agent.name;
    deviceNewType.value = agent.type;
    newAgentLookupKey = `${sn}|${deviceOldId.value}|${newAgentId}`;
    log(`机具 ${sn} 的新代理商: ${agent.id} ${agent.name}`);
  };
  const runDeviceLookup = (label: string, runner: () => Promise<void>) => async () => {
    if (deviceBusy) return;
    setDeviceBusy(true);
    try {
      setStatus(deviceStatus, `${label}中...`);
      await runner();
      setStatus(deviceStatus, `${label}完成`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(deviceStatus, message, true);
      log(`${label}失败: ${message}`, true);
    } finally {
      setDeviceBusy(false);
    }
  };
  deviceQueryOld.addEventListener('click', runDeviceLookup('查询旧代理商', loadOldAgent));
  deviceSn.addEventListener('change', runDeviceLookup('查询旧代理商', loadOldAgent));
  deviceNewId.addEventListener('change', runDeviceLookup('查询新代理商', loadNewAgent));
  deviceSubmit.addEventListener('click', async () => {
    if (deviceBusy) return;
    setDeviceBusy(true);
    try {
      const sn = deviceSn.value.trim();
      if (oldAgentLookupKey !== sn) await loadOldAgent();
      const newKey = `${sn}|${deviceOldId.value}|${deviceNewId.value.trim()}`;
      if (newAgentLookupKey !== newKey) await loadNewAgent();
      setStatus(deviceStatus, '正在校验划拨条件...');
      await submitDeviceTransfer(deviceValues(), (message) => {
        setStatus(deviceStatus, message);
        log(message);
      });
      setStatus(deviceStatus, '机具划拨成功');
      log(`机具 ${sn} 划拨成功`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(deviceStatus, `机具划拨失败: ${message}`, true);
      log(`机具划拨失败: ${message}`, true);
    } finally {
      setDeviceBusy(false);
    }
  });
  const lhsdDeviceSubmit = byId<HTMLButtonElement>(root, 'syt-run-lhsd-device');
  const lhsdDeviceStatus = byId<HTMLElement>(root, 'syt-lhsd-device-status');
  lhsdDeviceSubmit.addEventListener('click', async () => {
    if (lhsdDeviceSubmit.disabled) return;
    const values: LhsdDeviceTransferValues = {
      sn: byId<HTMLInputElement>(root, 'syt-lhsd-device-sn').value.trim(),
      oldAgentId: byId<HTMLInputElement>(root, 'syt-lhsd-device-old-id').value.trim(),
      newAgentId: byId<HTMLInputElement>(root, 'syt-lhsd-device-new-id').value.trim(),
    };
    lhsdDeviceSubmit.disabled = true;
    try {
      setStatus(lhsdDeviceStatus, '正在发起联合收单机具划拨...');
      const result = await submitLhsdDeviceTransfer(values);
      const countText = result.count > 0 ? `，处理数量 ${result.count}` : '';
      setStatus(lhsdDeviceStatus, `联合收单机具划拨成功${countText}`);
      log(`联合收单机具 ${values.sn} 划拨成功: ${values.oldAgentId} -> ${values.newAgentId}${countText}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(lhsdDeviceStatus, `联合收单机具划拨失败: ${message}`, true);
      log(`联合收单机具划拨失败: ${message}`, true);
    } finally {
      lhsdDeviceSubmit.disabled = false;
    }
  });
  const cupsSubmit = byId<HTMLButtonElement>(root, 'syt-run-cups');
  const cupsMerchant = byId<HTMLInputElement>(root, 'syt-cups-merchant');
  const cupsStatus = byId<HTMLElement>(root, 'syt-cups-status');
  cupsSubmit.addEventListener('click', async () => {
    if (cupsSubmit.disabled) return;
    cupsSubmit.disabled = true;
    cupsMerchant.disabled = true;
    cupsSubmit.textContent = '提交中...';
    try {
      const result = await reportCups(cupsMerchant.value, (message) => {
        setStatus(cupsStatus, message);
        log(message);
      });
      setStatus(cupsStatus, result.message);
      cupsStatus.classList.add(result.state === 'accepted' ? 'cups-success' : 'cups-warning');
      log(result.message);
    } catch (error) {
      const message = `CUPS 上报申请未确认成功：${error instanceof Error ? error.message : String(error)}`;
      setStatus(cupsStatus, message, true);
      log(message, true);
    } finally {
      cupsSubmit.disabled = false;
      cupsMerchant.disabled = false;
      cupsSubmit.textContent = '提交上报申请';
    }
  });
  const bindConfigView = byId<HTMLElement>(root, 'syt-view-bind-config');
  const bindConfigSubmit = byId<HTMLButtonElement>(root, 'syt-run-bind-config');
  bindConfigSubmit.addEventListener('click', async () => {
    if (bindConfigSubmit.disabled) return;
    const status = byId<HTMLElement>(root, 'syt-bind-config-status');
    const values = {
      sn: byId<HTMLInputElement>(root, 'syt-bind-config-sn').value,
      perDayBindTimes: byId<HTMLInputElement>(root, 'syt-bind-config-day').value,
      perMonthBindTimes: byId<HTMLInputElement>(root, 'syt-bind-config-month').value,
      whiteList: bindConfigView.querySelector<HTMLInputElement>('input[name="syt-bind-config-whitelist"]:checked')?.value as '1' | '0',
    };
    const controls = bindConfigView.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button');
    controls.forEach((control) => { control.disabled = true; });
    bindConfigSubmit.textContent = '处理中...';
    try {
      setStatus(status, '正在查询并保存设备换绑配置...');
      const action = await saveDeviceBindConfig(values, log);
      setStatus(status, `设备换绑配置${action === 'created' ? '新增' : '修改'}成功`);
    } catch (error) {
      const message = `设备换绑配置失败: ${error instanceof Error ? error.message : String(error)}`;
      setStatus(status, message, true);
      log(message, true);
    } finally {
      controls.forEach((control) => { control.disabled = false; });
      bindConfigSubmit.textContent = '确认配置';
    }
  });
  byId<HTMLButtonElement>(root, 'syt-run-whitelist').addEventListener('click', async () => {
    const status = byId<HTMLElement>(root, 'syt-white-status');
    const values: WhitelistValues = { mobile: byId<HTMLInputElement>(root, 'syt-white-mobile').value.trim(), idCard: byId<HTMLInputElement>(root, 'syt-white-id').value.trim(), businessLicense: byId<HTMLInputElement>(root, 'syt-white-license').value.trim(), settlementAccount: byId<HTMLInputElement>(root, 'syt-white-account').value.trim() };
    try { setStatus(status, '处理中...'); await addChangeWhitelist(values, log, (_state, message) => setStatus(status, message)); setStatus(status, '防切户白名单添加完成'); } catch (error) { setStatus(status, error instanceof Error ? error.message : String(error), true); }
  });
  initializeSnAuthorization(root, log);
  applyPreset();
}

createPanel();
