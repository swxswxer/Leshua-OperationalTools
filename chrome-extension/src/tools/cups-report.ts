import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { assertMerchantId } from '../api/http';
import { getCupsApplicant, submitCupsApplication, type CupsSubmissionResult } from '../api/cups';

export function fillCupsTemplate(template: Uint8Array, merchantId: string): File {
  assertMerchantId(merchantId);
  const entries = unzipSync(template);
  const sheetPath = 'xl/worksheets/sheet1.xml';
  if (!entries[sheetPath]) throw new Error('CUPS 模板缺少工作表');
  const doc = new DOMParser().parseFromString(strFromU8(entries[sheetPath]), 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('CUPS 模板工作表格式错误');
  const cell = doc.querySelector('c[r="A2"]');
  if (!cell) throw new Error('CUPS 模板缺少商户号单元格 A2');
  const ns = doc.documentElement.namespaceURI;
  const inline = doc.createElementNS(ns, 'is');
  const text = doc.createElementNS(ns, 't');
  text.textContent = merchantId;
  inline.append(text);
  cell.setAttribute('t', 'inlineStr');
  cell.replaceChildren(inline);
  entries[sheetPath] = strToU8(new XMLSerializer().serializeToString(doc));
  const bytes = zipSync(entries);
  return new File([new Uint8Array(bytes).buffer], 'cups_generate_template.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function reportCups(rawMerchantId: string, onProgress: (message: string) => void): Promise<CupsSubmissionResult> {
  const merchantId = rawMerchantId.trim();
  assertMerchantId(merchantId);
  onProgress('正在读取当前登录账号...');
  const applicant = await getCupsApplicant();
  onProgress('正在生成 CUPS 上报 Excel...');
  const response = await fetch(chrome.runtime.getURL('assets/cups_generate_template.xlsx'), { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('无法加载插件内的 CUPS 官方模板，请重新安装完整的 dist 目录');
  const file = fillCupsTemplate(new Uint8Array(await response.arrayBuffer()), merchantId);
  onProgress(`正在提交商户 ${merchantId} 的 CUPS 上报申请...`);
  return submitCupsApplication(file, applicant);
}
