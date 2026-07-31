/**
 * The app's half of the extension.
 *
 * Present in every build and inert on the web. Inside the extension it does two
 * things: mirrors the few settings the background page needs into extension
 * storage, and chimes on the background page's behalf when asked.
 */

import { chime } from '../lib/chime';
import { electAnnouncer, isAnnouncer } from '../lib/leader';
import type { ChimeKind } from '../lib/announce';
import type { Database, ScheduleId } from '../lib/types';
import { ext } from './api';

export { IN_EXTENSION, APP_URL } from './api';

/** What the background page needs to run the clock without the app. */
export interface Mirror {
  schedule: ScheduleId;
  notifications: boolean;
  sound: boolean;
  /**
   * Day key → the shape that day was recorded under. A stamped day outranks the
   * setting, so the background has to know them to pick the right timeline.
   */
  stamps: Record<string, ScheduleId>;
}

/**
 * The database lives in this page's localStorage, which the background page
 * cannot read — different context, no DOM. So the handful of fields it needs
 * are mirrored into extension storage whenever they change.
 */
export function mirror(db: Database): void {
  if (!ext) return;
  const stamps: Record<string, ScheduleId> = {};
  for (const [key, day] of Object.entries(db.days)) {
    if (day?.schedule) stamps[key] = day.schedule;
  }
  const value: Mirror = {
    schedule: db.settings.schedule,
    notifications: db.settings.notifications,
    sound: db.settings.sound,
    stamps,
  };
  void ext.storage.local.set({ mirror: value });
}

/**
 * Chimes on the background page's behalf.
 *
 * An open tab carries user activation that a background page woken by an alarm
 * may not, so where one exists it is the more reliable speaker of the two. The
 * background asks first and falls back to itself.
 */
export function serveChimes(): void {
  if (!ext) return;
  electAnnouncer();
  ext.runtime.onMessage.addListener((msg) => {
    const m = msg as { type?: string; kind?: ChimeKind } | null;
    if (m?.type === 'chime' && m.kind) {
      // The background broadcasts, and several copies of the app can be open.
      // Only the elected one answers, or its single chime comes back threefold.
      if (!isAnnouncer()) return undefined;
      return chime(m.kind).then((played) => ({ played }));
    }
    return undefined;
  });
  // Volunteer which tab we are, so the toolbar button can focus this page
  // instead of opening a second copy — without the `tabs` permission.
  void ext.runtime.sendMessage({ type: 'hello' }).catch(() => {});
}
