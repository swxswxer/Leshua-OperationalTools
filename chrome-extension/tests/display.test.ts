import { afterEach, describe, expect, it, vi } from 'vitest';
import { DISPLAY_SIZE_KEY, initializeDisplaySize, resolveDisplaySize } from '../src/sidepanel/display';

afterEach(() => vi.unstubAllGlobals());

describe('显示大小', () => {
  it('Mac 默认紧凑，Windows 默认标准', () => {
    expect(resolveDisplaySize(null, 'MacIntel')).toBe('compact');
    expect(resolveDisplaySize(null, 'Win32')).toBe('standard');
  });
  it('用户选择优先于平台默认值，无效设置回退到默认值', () => {
    expect(resolveDisplaySize('large', 'MacIntel')).toBe('large');
    expect(resolveDisplaySize('compact', 'Win32')).toBe('compact');
    expect(resolveDisplaySize('unknown', 'Win32')).toBe('standard');
  });
  it('立即应用选择，并在重新初始化时恢复', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    vi.stubGlobal('navigator', { platform: 'Win32' });
    const dataset: Record<string, string> = {};
    vi.stubGlobal('document', { documentElement: { dataset } });
    const select = Object.assign(new EventTarget(), { value: '' });
    const status = { textContent: '' };
    initializeDisplaySize(select as HTMLSelectElement, status as HTMLElement);
    expect(dataset.displaySize).toBe('standard');
    select.value = 'large';
    select.dispatchEvent(new Event('change'));
    expect(values.get(DISPLAY_SIZE_KEY)).toBe('large');
    const reopened = Object.assign(new EventTarget(), { value: '' });
    initializeDisplaySize(reopened as HTMLSelectElement, status as HTMLElement);
    expect(reopened.value).toBe('large');
  });
  it('无法保存时仍能调整当前界面，并告知用户', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error(); }, setItem: () => { throw new Error(); } });
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    const dataset: Record<string, string> = {};
    vi.stubGlobal('document', { documentElement: { dataset } });
    const select = Object.assign(new EventTarget(), { value: '' });
    const status = { textContent: '' };
    initializeDisplaySize(select as HTMLSelectElement, status as HTMLElement);
    select.value = 'standard';
    select.dispatchEvent(new Event('change'));
    expect(dataset.displaySize).toBe('standard');
    expect(status.textContent).toContain('无法保存');
  });
});
