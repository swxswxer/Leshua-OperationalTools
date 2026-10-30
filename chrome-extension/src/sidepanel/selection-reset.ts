import {
  TAKE_SELECTION_RESET, selectionResetStorageKey,
  type SelectionResetCommand, type SelectionResetResponse,
} from '../selection-reset';

interface SelectionResetActions {
  isBusy: () => boolean;
  showResetView: () => Promise<boolean>;
  applyCommand: (command: SelectionResetCommand) => void;
  runReset: () => Promise<void>;
  onError: (message: string) => void;
}

export function createSelectionResetHandler(actions: SelectionResetActions) {
  let processing = false;
  return async (command: SelectionResetCommand): Promise<void> => {
    if (processing || actions.isBusy()) {
      actions.onError('当前有任务正在处理，本次右键重置未执行，请完成后重试');
      return;
    }
    processing = true;
    try {
      if (!await actions.showResetView()) return;
      if (actions.isBusy()) {
        actions.onError('当前有任务正在处理，本次右键重置未执行，请完成后重试');
        return;
      }
      actions.applyCommand(command);
      await actions.runReset();
    } finally {
      processing = false;
    }
  };
}

export function initializeSelectionResetReceiver(
  onCommand: (command: SelectionResetCommand) => Promise<void>,
  onError: (message: string) => void,
): () => void {
  let windowId: number | undefined;
  let stopped = false;
  let consuming = false;
  let consumeAgain = false;

  const consume = async () => {
    if (stopped || windowId == null) return;
    if (consuming) { consumeAgain = true; return; }
    consuming = true;
    try {
      do {
        consumeAgain = false;
        const response = await chrome.runtime.sendMessage({ type: TAKE_SELECTION_RESET, windowId }) as SelectionResetResponse | undefined;
        if (!response) throw new Error('扩展后台没有返回右键重置请求');
        if (!response.ok) throw new Error(response.error);
        if (response.command && !stopped) {
          consumeAgain = true;
          void onCommand(response.command).catch(error => onError(error instanceof Error ? error.message : String(error)));
        }
      } while (consumeAgain && !stopped);
    } catch (error) {
      onError(`右键重置接收失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      consuming = false;
    }
  };
  const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'session' && windowId != null && changes[selectionResetStorageKey(windowId)]?.newValue) {
      void consume();
    }
  };
  void chrome.windows.getCurrent().then(current => {
    if (stopped) return;
    if (current.id == null) throw new Error('无法确定侧边栏所属浏览器窗口');
    windowId = current.id;
    chrome.storage.onChanged.addListener(onChanged);
    return consume();
  }).catch(error => onError(`右键重置初始化失败：${error instanceof Error ? error.message : String(error)}`));

  return () => {
    stopped = true;
    chrome.storage.onChanged.removeListener(onChanged);
  };
}
