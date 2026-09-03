// @ts-nocheck
// The embedded official workbook template is intentionally kept byte-for-byte.
import {
  ORIGIN, SAAS, USER_CENTER, buildFormBody, detectHtmlError, getHtmlMessage,
  normalizeText, requestText, sleep, summarizeHtml,
} from './http';
  const CODE_PLATE_RESULT_SUBJECT = '码牌批量转移处理结果';
  const CODE_PLATE_RESULT_SOURCE = '码牌管理-码牌转移';
  const CODE_PLATE_ACCEPTED_MESSAGE = '后台批量处理中，结果以系统内消息通知';
  const CODE_PLATE_TEMPLATE_BASE64 = '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';
  const CODE_PLATE_SHEET_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:etc="http://www.wps.cn/officeDocument/2017/etCustomData"><sheetPr/><dimension ref="A1:D2"/><sheetViews><sheetView tabSelected="1" workbookViewId="0"><selection activeCell="D9" sqref="D9"/></sheetView></sheetViews><sheetFormatPr defaultColWidth="9" defaultRowHeight="16.8" outlineLevelRow="1" outlineLevelCol="3"/><cols><col min="1" max="2" width="11.7692307692308"/></cols><sheetData><row r="1" spans="1:4"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row><row r="2" spans="1:4"><c r="A2" s="1" t="s"><v>4</v></c><c r="B2" s="1" t="s"><v>4</v></c><c r="C2"><v>5267151</v></c><c r="D2"><v>3287859</v></c></row></sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><headerFooter/></worksheet>';
  function normalizeCodePlateTransferValues(values = {}) {
    return {
      startCode: String(values.startCode || '').trim(),
      endCode: String(values.endCode || '').trim(),
      sourceAgent: String(values.sourceAgent || '').trim(),
      targetAgent: String(values.targetAgent || '').trim(),
    };
  }

  function assertCodePlateTransferValues(values) {
    const normalized = normalizeCodePlateTransferValues(values);
    if (!normalized.startCode || !normalized.endCode || !normalized.sourceAgent || !normalized.targetAgent) {
      throw new Error('请完整填写四项划转信息');
    }
    if (!/^[A-Za-z0-9]+$/.test(normalized.startCode) || !/^[A-Za-z0-9]+$/.test(normalized.endCode)) {
      throw new Error('码牌开始编号和结束编号只能填写英文字母或数字');
    }
    if (normalized.startCode.length !== normalized.endCode.length) {
      throw new Error('码牌开始编号和结束编号长度必须一致');
    }
    if (/^\d+$/.test(normalized.startCode)
      && /^\d+$/.test(normalized.endCode)
      && BigInt(normalized.startCode) > BigInt(normalized.endCode)) {
      throw new Error('码牌开始编号不能大于结束编号');
    }
    if (!/^\d+$/.test(normalized.sourceAgent) || !/^\d+$/.test(normalized.targetAgent)) {
      throw new Error('原代理商和新代理商只能填写数字');
    }
    if (!Number.isSafeInteger(Number(normalized.sourceAgent)) || !Number.isSafeInteger(Number(normalized.targetAgent))) {
      throw new Error('代理商编号超出 Excel 可安全处理的数字范围');
    }
    if (normalized.sourceAgent === normalized.targetAgent) {
      throw new Error('原代理商和新代理商不能相同');
    }
    return normalized;
  }

  function replaceTemplateCell(sheetXml, cellRef, replacement) {
    const pattern = new RegExp(`<c\\s+[^>]*r=["']${cellRef}["'][^>]*>[\\s\\S]*?<\\/c>`);
    if (!pattern.test(sheetXml)) throw new Error(`官方模板缺少单元格 ${cellRef}`);
    return sheetXml.replace(pattern, replacement);
  }

  function concatByteArrays(parts) {
    const size = parts.reduce((total, part) => total + part.length, 0);
    const output = new Uint8Array(size);
    let offset = 0;
    parts.forEach((part) => {
      output.set(part, offset);
      offset += part.length;
    });
    return output;
  }

  const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
      }
      table[index] = value >>> 0;
    }
    return table;
  })();

  function calculateCrc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let index = 0; index < bytes.length; index += 1) {
      crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function decodeBase64Bytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function findZipEndRecord(bytes, view) {
    const lowerBound = Math.max(0, bytes.length - 65557);
    for (let offset = bytes.length - 22; offset >= lowerBound; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054B50) return offset;
    }
    throw new Error('内嵌官方 Excel 模板缺少 ZIP 结束记录');
  }

  function parseTemplateZip(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const endOffset = findZipEndRecord(bytes, view);
    const entryCount = view.getUint16(endOffset + 10, true);
    const centralOffset = view.getUint32(endOffset + 16, true);
    const commentLength = view.getUint16(endOffset + 20, true);
    const comment = bytes.slice(endOffset + 22, endOffset + 22 + commentLength);
    const decoder = new TextDecoder('utf-8');
    const entries = [];
    let offset = centralOffset;

    for (let index = 0; index < entryCount; index += 1) {
      if (view.getUint32(offset, true) !== 0x02014B50) throw new Error('内嵌官方 Excel 模板中央目录损坏');
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const entryCommentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      if (view.getUint32(localOffset, true) !== 0x04034B50) throw new Error('内嵌官方 Excel 模板文件记录损坏');
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const nameBytes = bytes.slice(offset + 46, offset + 46 + nameLength);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      entries.push({
        name: decoder.decode(nameBytes),
        nameBytes,
        versionMade: view.getUint16(offset + 4, true),
        versionNeeded: view.getUint16(offset + 6, true),
        flags: view.getUint16(offset + 8, true) & ~0x08,
        method: view.getUint16(offset + 10, true),
        modTime: view.getUint16(offset + 12, true),
        modDate: view.getUint16(offset + 14, true),
        crc32: view.getUint32(offset + 16, true),
        compressedSize,
        uncompressedSize: view.getUint32(offset + 24, true),
        diskStart: view.getUint16(offset + 34, true),
        internalAttributes: view.getUint16(offset + 36, true),
        externalAttributes: view.getUint32(offset + 38, true),
        localExtra: bytes.slice(localOffset + 30 + localNameLength, dataOffset),
        centralExtra: bytes.slice(offset + 46 + nameLength, offset + 46 + nameLength + extraLength),
        comment: bytes.slice(offset + 46 + nameLength + extraLength, offset + 46 + nameLength + extraLength + entryCommentLength),
        data: bytes.slice(dataOffset, dataOffset + compressedSize),
      });
      offset += 46 + nameLength + extraLength + entryCommentLength;
    }
    return { entries, comment };
  }

  function createZipLocalRecord(entry) {
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034B50, true);
    view.setUint16(4, entry.versionNeeded, true);
    view.setUint16(6, entry.flags, true);
    view.setUint16(8, entry.method, true);
    view.setUint16(10, entry.modTime, true);
    view.setUint16(12, entry.modDate, true);
    view.setUint32(14, entry.crc32, true);
    view.setUint32(18, entry.compressedSize, true);
    view.setUint32(22, entry.uncompressedSize, true);
    view.setUint16(26, entry.nameBytes.length, true);
    view.setUint16(28, entry.localExtra.length, true);
    return concatByteArrays([header, entry.nameBytes, entry.localExtra, entry.data]);
  }

  function createZipCentralRecord(entry) {
    const header = new Uint8Array(46);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014B50, true);
    view.setUint16(4, entry.versionMade, true);
    view.setUint16(6, entry.versionNeeded, true);
    view.setUint16(8, entry.flags, true);
    view.setUint16(10, entry.method, true);
    view.setUint16(12, entry.modTime, true);
    view.setUint16(14, entry.modDate, true);
    view.setUint32(16, entry.crc32, true);
    view.setUint32(20, entry.compressedSize, true);
    view.setUint32(24, entry.uncompressedSize, true);
    view.setUint16(28, entry.nameBytes.length, true);
    view.setUint16(30, entry.centralExtra.length, true);
    view.setUint16(32, entry.comment.length, true);
    view.setUint16(34, entry.diskStart, true);
    view.setUint16(36, entry.internalAttributes, true);
    view.setUint32(38, entry.externalAttributes, true);
    view.setUint32(42, entry.outputOffset, true);
    return concatByteArrays([header, entry.nameBytes, entry.centralExtra, entry.comment]);
  }

  function rebuildTemplateZip(replacements) {
    const template = parseTemplateZip(decodeBase64Bytes(CODE_PLATE_TEMPLATE_BASE64));
    const encoder = new TextEncoder();
    template.entries.forEach((entry) => {
      if (!replacements.has(entry.name)) return;
      entry.data = encoder.encode(replacements.get(entry.name));
      entry.method = 0;
      entry.crc32 = calculateCrc32(entry.data);
      entry.compressedSize = entry.data.length;
      entry.uncompressedSize = entry.data.length;
    });

    const localRecords = [];
    let localSize = 0;
    template.entries.forEach((entry) => {
      entry.outputOffset = localSize;
      const record = createZipLocalRecord(entry);
      localRecords.push(record);
      localSize += record.length;
    });
    const centralRecords = template.entries.map(createZipCentralRecord);
    const centralSize = centralRecords.reduce((total, record) => total + record.length, 0);
    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    endView.setUint32(0, 0x06054B50, true);
    endView.setUint16(8, template.entries.length, true);
    endView.setUint16(10, template.entries.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, localSize, true);
    endView.setUint16(20, template.comment.length, true);
    return concatByteArrays([...localRecords, ...centralRecords, endRecord, template.comment]);
  }

  function createCodePlateTransferFile(values) {
    const normalized = assertCodePlateTransferValues(values);
    const endCodeIndex = normalized.startCode === normalized.endCode ? 4 : 5;
    const sharedStrings = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="6" uniqueCount="${endCodeIndex === 4 ? 5 : 6}">`,
      '<si><t>码牌开始编号</t></si>',
      '<si><t>码牌结束编号</t></si>',
      '<si><t>原代理商</t></si>',
      '<si><t>新代理商</t></si>',
      `<si><t>${normalized.startCode}</t></si>`,
      endCodeIndex === 5 ? `<si><t>${normalized.endCode}</t></si>` : '',
      '</sst>',
    ].join('');

    let sheetXml = CODE_PLATE_SHEET_XML;
    sheetXml = replaceTemplateCell(sheetXml, 'A2', '<c r="A2" s="1" t="s"><v>4</v></c>');
    sheetXml = replaceTemplateCell(sheetXml, 'B2', `<c r="B2" s="1" t="s"><v>${endCodeIndex}</v></c>`);
    sheetXml = replaceTemplateCell(sheetXml, 'C2', `<c r="C2"><v>${normalized.sourceAgent}</v></c>`);
    sheetXml = replaceTemplateCell(sheetXml, 'D2', `<c r="D2"><v>${normalized.targetAgent}</v></c>`);
    const bytes = rebuildTemplateZip(new Map([
      ['xl/sharedStrings.xml', sharedStrings],
      ['xl/worksheets/sheet1.xml', sheetXml],
    ]));
    return new File([bytes], '批量转移模板.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  function parseCodePlateMessageRows(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const table = doc.querySelector('table.tablesorter');
    if (!table) {
      const htmlError = detectHtmlError(html);
      if (htmlError) throw new Error(htmlError);
      throw new Error(`无法解析消息中心响应: ${summarizeHtml(html)}`);
    }
    const headers = Array.from(table.querySelectorAll('thead th')).map((cell) => normalizeText(cell.textContent));
    const getIndex = (name) => headers.indexOf(name);
    const indexes = {
      id: getIndex('消息ID'),
      subject: getIndex('主题'),
      body: getIndex('正文'),
      source: getIndex('来源'),
      sendTime: getIndex('发信时间'),
    };
    if (Object.values(indexes).some((index) => index < 0)) {
      throw new Error('消息中心表格字段不完整，无法匹配码牌划转结果');
    }
    return Array.from(table.querySelectorAll('tbody tr')).map((row) => {
      const cells = Array.from(row.children);
      return {
        id: normalizeText(cells[indexes.id]?.textContent),
        subject: normalizeText(cells[indexes.subject]?.textContent),
        body: normalizeText(cells[indexes.body]?.textContent),
        source: normalizeText(cells[indexes.source]?.textContent),
        sendTime: normalizeText(cells[indexes.sendTime]?.textContent),
      };
    }).filter((message) => message.id);
  }

  function parseCodePlateResultMessage(message) {
    const jsonText = message.body.match(/\{[^{}]*\}/)?.[0] || '';
    if (!jsonText) return null;
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (error) {
      return null;
    }
    const resultText = normalizeText(message.body.match(/处理结果[：:]\s*([\s\S]*)$/)?.[1] || '');
    const success = Number(data.fStatus) === 1 && /转移成功/.test(resultText);
    return {
      ...message,
      data,
      resultText,
      success,
    };
  }

  function isCodePlateResultForValues(result, values) {
    if (!result) return false;
    return result.subject === CODE_PLATE_RESULT_SUBJECT
      && result.source === CODE_PLATE_RESULT_SOURCE
      && String(result.data.fStartNum || '') === values.startCode
      && String(result.data.fEndNum || '') === values.endCode
      && String(result.data.fOldAgent || '') === values.sourceAgent
      && String(result.data.fNewAgent || '') === values.targetAgent;
  }

  function pickNewCodePlateTransferResult(messages, baselineMessageIds) {
    const baselineIds = new Set(Array.from(baselineMessageIds || []).map(String));
    return messages.find((message) => !baselineIds.has(String(message.id))) || null;
  }

  function summarizeCodePlateMessageValues(message) {
    const data = message?.data || {};
    return [
      `消息ID=${message?.id || '未知'}`,
      `开始=${data.fStartNum || '空'}`,
      `结束=${data.fEndNum || '空'}`,
      `原代理=${data.fOldAgent || '空'}`,
      `新代理=${data.fNewAgent || '空'}`,
    ].join('，');
  }

  async function queryCodePlateTransferMessages(values = null) {
    const normalized = values ? assertCodePlateTransferValues(values) : null;
    const queryUrl = `${USER_CENTER}/messagePush.do?method=list&_=${Date.now()}`;
    const html = await requestText(queryUrl, {
      method: 'POST',
      cache: 'no-store',
      timeoutMs: 12000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      referrer: `${USER_CENTER}/messagePush.do?method=list`,
      body: buildFormBody({
        dateRange: '',
        msgId: '',
        subject: CODE_PLATE_RESULT_SUBJECT,
        type: '',
        status: '',
        system: 'saasadmin',
        pageNumber: '1',
        pageSize: '200',
      }),
    });
    const messages = parseCodePlateMessageRows(html)
        .map(parseCodePlateResultMessage)
        .filter(Boolean);
    return normalized ? messages.filter((message) => isCodePlateResultForValues(message, normalized)) : messages;
  }

  async function submitCodePlateTransferViaNativeForm(file, options = {}) {
    if (!(file instanceof Blob)) throw new Error('待上传的码牌模板文件无效');
    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const PageFile = pageWindow.File || File;
    const PageDataTransfer = pageWindow.DataTransfer || DataTransfer;
    const uploadFile = new PageFile([await file.arrayBuffer()], file.name || '批量转移模板.xlsx', {
      type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const dataTransfer = new PageDataTransfer();
    dataTransfer.items.add(uploadFile);

    return new Promise((resolve, reject) => {
      const frameName = `syt-code-plate-upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const iframe = document.createElement('iframe');
      const form = document.createElement('form');
      const fileInput = document.createElement('input');
      const submitInput = document.createElement('input');
      let settled = false;
      let responseListenerAttached = false;

      const cleanup = () => {
        form.remove();
        iframe.remove();
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        cleanup();
        callback(value);
      };
      const timeoutId = setTimeout(() => {
        finish(reject, new Error('码牌划转上传请求超时，请检查后台登录状态后重试'));
      }, options.uploadTimeoutMs == null ? 30000 : options.uploadTimeoutMs);

      iframe.name = frameName;
      iframe.style.display = 'none';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('sandbox', 'allow-forms allow-same-origin');
      iframe.addEventListener('load', () => {
        if (!responseListenerAttached) {
          responseListenerAttached = true;
          try {
            pageWindow.HTMLFormElement.prototype.submit.call(form);
          } catch (error) {
            finish(reject, error);
          }
          return;
        }
        try {
          const responseDocument = iframe.contentDocument;
          const html = responseDocument?.documentElement?.outerHTML || '';
          if (!html) throw new Error('后台上传接口返回了空页面');
          finish(resolve, html);
        } catch (error) {
          finish(reject, new Error(`无法读取码牌划转上传响应: ${error.message}`));
        }
      });

      form.method = 'POST';
      form.action = options.actionUrl || `${SAAS}/qrCodeState.do?method=distributeBatch`;
      form.enctype = 'multipart/form-data';
      form.target = frameName;
      form.acceptCharset = 'UTF-8';
      form.style.display = 'none';

      fileInput.type = 'file';
      fileInput.name = 'distributeBatchFormFile';
      fileInput.files = dataTransfer.files;
      submitInput.type = 'hidden';
      submitInput.name = 'submit';
      submitInput.value = '确认提交';
      form.append(fileInput, submitInput);
      document.body.append(iframe, form);
    });
  }

  async function submitCodePlateTransfer(values, options = {}) {
    const normalized = assertCodePlateTransferValues(values);
    const file = options.file || await createCodePlateTransferFile(normalized);
    const html = await submitCodePlateTransferViaNativeForm(file, {
      uploadTimeoutMs: options.uploadTimeoutMs,
    });
    const htmlError = detectHtmlError(html);
    if (htmlError) throw new Error(htmlError);
    const message = getHtmlMessage(html);
    if (!message.includes(CODE_PLATE_ACCEPTED_MESSAGE)) {
      throw new Error(`无法确认码牌划转任务已受理: ${summarizeHtml(html)}`);
    }
    return { ok: true, accepted: true, requestMode: 'native-form-iframe', message, html, values: normalized };
  }

  async function pollCodePlateTransferResult(values, options = {}) {
    const normalized = assertCodePlateTransferValues(values);
    const baselineIds = new Set(Array.from(options.baselineMessageIds || []).map(String));
    const intervalMs = options.pollIntervalMs == null ? 2000 : options.pollIntervalMs;
    const timeoutMs = options.pollTimeoutMs == null ? 60000 : options.pollTimeoutMs;
    const deadline = Date.now() + timeoutMs;
    let successfulQueries = 0;
    let lastQueryError = null;
    const reportedUnmatchedIds = new Set();
    const unmatchedMessages = new Map();

    while (Date.now() < deadline) {
      await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
      try {
        const messages = await queryCodePlateTransferMessages();
        successfulQueries += 1;
        const newMessages = messages.filter((message) => !baselineIds.has(String(message.id)));
        const matchingMessages = newMessages.filter((message) => isCodePlateResultForValues(message, normalized));
        const result = pickNewCodePlateTransferResult(matchingMessages, baselineIds);
        newMessages.filter((message) => !isCodePlateResultForValues(message, normalized)).forEach((message) => {
          unmatchedMessages.set(String(message.id), message);
          if (!reportedUnmatchedIds.has(String(message.id)) && options.onLog) {
            reportedUnmatchedIds.add(String(message.id));
            options.onLog(`发现新的码牌划转消息，但参数与本次任务不一致: ${summarizeCodePlateMessageValues(message)}`);
          }
        });
        if (!result) continue;
        if (!result.success) {
          const error = new Error(`码牌划转失败: ${result.resultText || result.body}`);
          error.code = 'CODE_PLATE_TRANSFER_FAILED';
          error.result = result;
          throw error;
        }
        return { ok: true, timeout: false, result, values: normalized };
      } catch (error) {
        if (error.code === 'CODE_PLATE_TRANSFER_FAILED') throw error;
        lastQueryError = error;
        if (options.onLog) options.onLog(`消息中心查询失败，将继续重试: ${error.message}`, true);
      }
    }
    if (successfulQueries === 0 && lastQueryError) {
      throw new Error(`持续无法查询消息中心: ${lastQueryError.message}`);
    }
    return {
      ok: false,
      timeout: true,
      result: null,
      values: normalized,
      unmatchedMessages: Array.from(unmatchedMessages.values()),
    };
  }

export {
  createCodePlateTransferFile,
  pollCodePlateTransferResult,
  queryCodePlateTransferMessages,
  submitCodePlateTransfer,
  summarizeCodePlateMessageValues,
};
