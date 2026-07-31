/**
 * Just enough of the WebExtension surface to use it honestly.
 *
 * Hand-written rather than pulled from `@types/webextension-polyfill` because
 * this extension uses a dozen calls and the app must still build for the web,
 * where none of this exists.
 */

interface StorageArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface Alarm {
  name: string;
}

export interface Tab {
  id?: number;
  url?: string;
  windowId?: number;
}

export interface MessageSender {
  tab?: Tab;
}

export interface ExtApi {
  runtime: {
    id?: string;
    getURL(path: string): string;
    onMessage: {
      addListener(fn: (msg: unknown, sender: MessageSender) => unknown): void;
    };
    sendMessage(msg: unknown): Promise<unknown>;
    onInstalled: { addListener(fn: () => void): void };
    onStartup: { addListener(fn: () => void): void };
  };
  storage: { local: StorageArea; session?: StorageArea };
  alarms: {
    create(name: string, info: { when?: number; periodInMinutes?: number }): void;
    onAlarm: { addListener(fn: (alarm: Alarm) => void): void };
  };
  notifications: {
    create(
      id: string,
      options: { type: 'basic'; iconUrl?: string; title: string; message: string },
    ): Promise<string>;
    onClicked: { addListener(fn: (id: string) => void): void };
  };
  action: {
    setBadgeText(details: { text: string }): void;
    setBadgeBackgroundColor(details: { color: string }): void;
    setTitle(details: { title: string }): void;
    onClicked: { addListener(fn: () => void): void };
  };
  tabs: {
    create(info: { url: string }): Promise<Tab>;
    update(id: number, info: { active: boolean }): Promise<Tab>;
  };
  /** Firefox only; Chrome's equivalent is the unrelated `sidePanel`. */
  sidebarAction?: {
    open(): void;
    close(): void;
  };
  windows: { update(id: number, info: { focused: boolean }): Promise<unknown> };
}

type Global = typeof globalThis & { browser?: ExtApi; chrome?: ExtApi };

/**
 * `runtime.id` is the tell: it is present on an extension page and absent on
 * the open web, so the same bundle can serve both.
 */
function detect(): ExtApi | null {
  const g = globalThis as Global;
  if (g.browser?.runtime?.id) return g.browser;
  if (g.chrome?.runtime?.id) return g.chrome;
  return null;
}

export const ext: ExtApi | null = detect();

/** True when this code is running inside the extension rather than on the web. */
export const IN_EXTENSION = ext !== null;

/** The app's own page, wherever the browser mounted the extension. */
export const APP_URL = ext ? ext.runtime.getURL('index.html') : '';
