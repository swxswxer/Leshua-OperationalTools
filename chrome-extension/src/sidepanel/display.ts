export type DisplaySize = 'compact' | 'standard' | 'large';
export const DISPLAY_SIZE_KEY = 'operations-display-size';

export function resolveDisplaySize(saved: string | null, platform: string): DisplaySize {
  if (saved === 'compact' || saved === 'standard' || saved === 'large') return saved;
  return /mac/i.test(platform) ? 'compact' : 'standard';
}

export function initializeDisplaySize(select: HTMLSelectElement, status: HTMLElement): void {
  let saved: string | null = null;
  try { saved = localStorage.getItem(DISPLAY_SIZE_KEY); } catch { /* The current session still supports resizing. */ }
  const apply = (value: DisplaySize) => {
    document.documentElement.dataset.displaySize = value;
    select.value = value;
  };
  apply(resolveDisplaySize(saved, navigator.platform));
  select.addEventListener('change', () => {
    const value = resolveDisplaySize(select.value, navigator.platform);
    apply(value);
    try {
      localStorage.setItem(DISPLAY_SIZE_KEY, value);
      status.textContent = '';
    } catch {
      status.textContent = '显示大小已调整，但无法保存，下次打开时将恢复默认。';
    }
  });
}
