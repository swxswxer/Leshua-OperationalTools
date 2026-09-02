import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import './style.css';

type Operation = {
  id: string;
  label: string;
  businessLine?: '联合收单' | '收银通';
  reportType?: '微信' | '支付宝' | '全部';
};

type BridgeResponse = {
  ok: boolean;
  message: string;
  copied?: boolean;
};

type OperationGroup = {
  label: '收银通' | '联合收单';
  operations: Operation[];
};

const operationGroups: OperationGroup[] = [
  {
    label: '收银通',
    operations: [
      { id: 'syt-wechat', label: '微信', businessLine: '收银通', reportType: '微信' },
      { id: 'syt-alipay', label: '支付宝', businessLine: '收银通', reportType: '支付宝' },
      { id: 'syt-all', label: '全部', businessLine: '收银通', reportType: '全部' },
    ],
  },
  {
    label: '联合收单',
    operations: [
      { id: 'lhsd-wechat', label: '微信', businessLine: '联合收单', reportType: '微信' },
      { id: 'lhsd-alipay', label: '支付宝', businessLine: '联合收单', reportType: '支付宝' },
      { id: 'lhsd-all', label: '全部', businessLine: '联合收单', reportType: '全部' },
    ],
  },
];

const merchantKeyOperation: Operation = { id: 'merchant-key', label: '配置商户 key' };

let merchantId = '';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('找不到应用根节点');

app.innerHTML = `
  <section class="menu" aria-label="运营工具快捷菜单">
    <nav id="operation-list" class="operation-list" aria-label="可用操作"></nav>
  </section>
`;

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`菜单初始化失败: ${selector}`);
  return element;
}

const operationList = requiredElement<HTMLElement>('#operation-list');

function findMerchantId(text: string): string {
  return text.match(/(?<!\d)\d{10}(?!\d)/)?.[0] || '';
}

async function refreshMerchantFromClipboard(): Promise<void> {
  try {
    merchantId = findMerchantId(await readText());
  } catch {
    merchantId = '';
  }
}

async function chooseOperation(operation: Operation): Promise<void> {
  if (!merchantId) {
    window.alert('未识别到 10 位乐刷商户号，请先选中并复制商户号。');
    return;
  }
  const request = operation.id === 'merchant-key'
    ? { action: 'merchant-key', merchantId }
    : {
      action: 'reset',
      merchantId,
      businessLine: operation.businessLine === '联合收单' ? 'lhsd' : 'syt',
      reportType: operation.reportType === '微信' ? 'WECHAT' : operation.reportType === '支付宝' ? 'ALIPAY' : 'ALL',
    };
  void invoke<BridgeResponse>('execute_desktop_operation', { operation: request })
    .then((result) => {
      if (!result.ok) window.alert(result.message);
    })
    .catch((error) => window.alert(error instanceof Error ? error.message : String(error)));
  await invoke('hide_menu');
}

function closeOtherGroups(currentGroup?: HTMLElement): void {
  operationList.querySelectorAll<HTMLElement>('.operation-group.expanded').forEach((group) => {
    if (group !== currentGroup) group.classList.remove('expanded');
  });
}

function resizeMenu(): void {
  requestAnimationFrame(() => {
    const menu = document.querySelector<HTMLElement>('.menu');
    const height = Math.ceil(menu?.scrollHeight || 120);
    void invoke('resize_menu', { height });
  });
}

operationGroups.forEach((group) => {
  const groupElement = document.createElement('section');
  groupElement.className = 'operation-group';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'group-trigger';
  trigger.innerHTML = `<span>${group.label}</span><span class="arrow" aria-hidden="true">›</span>`;
  trigger.addEventListener('click', () => {
    const willExpand = !groupElement.classList.contains('expanded');
    closeOtherGroups(groupElement);
    groupElement.classList.toggle('expanded', willExpand);
    resizeMenu();
  });
  groupElement.append(trigger);

  const submenu = document.createElement('div');
  submenu.className = 'submenu';
  group.operations.forEach((operation) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = operation.label;
    button.addEventListener('click', () => { void chooseOperation(operation); });
    submenu.append(button);
  });
  groupElement.append(submenu);
  operationList.append(groupElement);
});

const merchantKeyButton = document.createElement('button');
merchantKeyButton.type = 'button';
merchantKeyButton.className = 'direct-operation';
merchantKeyButton.textContent = merchantKeyOperation.label;
merchantKeyButton.addEventListener('click', () => { void chooseOperation(merchantKeyOperation); });
operationList.append(merchantKeyButton);

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') void invoke('hide_menu');
});

void listen('open-command-menu', () => {
  closeOtherGroups();
  resizeMenu();
  void refreshMerchantFromClipboard();
});
void refreshMerchantFromClipboard();
