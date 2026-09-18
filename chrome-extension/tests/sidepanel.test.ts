import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import manifest from '../manifest.json';
import type { BackendRequestMessage, BackendResponseMessage } from '../src/types';

type Listener = (message: unknown, sender: unknown, reply: (response: BackendResponseMessage) => void) => boolean;
let listener: Listener;
let setPanelBehavior: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  setPanelBehavior = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('chrome', {
    sidePanel: { setPanelBehavior },
    runtime: { onMessage: { addListener: (handler: Listener) => { listener = handler; } } },
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"success":true}')));
  await import('../src/background/index');
});
afterEach(() => vi.unstubAllGlobals());

function send(url: string): Promise<BackendResponseMessage> {
  return new Promise((resolve) => {
    const message: BackendRequestMessage = { type: 'operations:backend-request', request: {
      kind: 'text', url, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'sn=001',
    } };
    expect(listener(message, {}, resolve)).toBe(true);
  });
}

describe('原生侧边栏', () => {
  it('使用独立侧边栏入口，不注入网页，不使用 popup', () => {
    expect(manifest.side_panel.default_path).toBe('sidepanel.html');
    expect(manifest.permissions).toContain('sidePanel');
    expect(manifest).not.toHaveProperty('content_scripts');
    expect(manifest.action).not.toHaveProperty('default_popup');
    expect(manifest.host_permissions).toEqual(['https://om.leshuazf.com/*']);
  });
  it('点击插件图标打开 Chrome 侧边栏', () => {
    expect(setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true });
  });
  it('后台代理仍携带登录态并保持请求正文', async () => {
    expect((await send('https://om.leshuazf.com/example')).ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith('https://om.leshuazf.com/example', expect.objectContaining({ credentials: 'include', method: 'POST', body: 'sn=001' }));
  });
  it('不能将业务请求发送给其他站点', async () => {
    expect((await send('https://example.com/example')).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
