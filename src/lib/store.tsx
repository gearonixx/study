/**
 * Single app-wide store. Deliberately small: a `useReducer` over the whole
 * Database, persisted to localStorage on every change, with achievements
 * reconciled after each action so unlocks feel immediate.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react';

import { load, save } from './storage';
import { useVault, type VaultApi } from './useVault';
import { useServerSync, type CloudApi } from './useServerSync';
import { reconcile } from './achievements';
import { todayKey } from './date';
import {
  emptyDay,
  SLOTS_PER_DAY,
  type Database,
  type Day,
  type Goal,
  type Settings,
  type SlotStatus,
} from './types';

type Action =
  | { type: 'setStatus'; date: string; slot: number; status: SlotStatus }
  | { type: 'cycleStatus'; date: string; slot: number }
  | { type: 'setNote'; date: string; slot: number; note: string }
  | { type: 'setMood'; date: string; slot: number; mood: string }
  | { type: 'setWindow'; date: string; which: 'top' | 'bottom'; value: string }
  | { type: 'addGoal'; date: string; startSlot: number; label: string; detail?: string }
  | { type: 'updateGoal'; date: string; id: string; patch: Partial<Goal> }
  | { type: 'removeGoal'; date: string; id: string }
  | { type: 'addNote'; date: string; afterSlot: number; text: string }
  | { type: 'updateNote'; date: string; id: string; text: string }
  | { type: 'removeNote'; date: string; id: string }
  | { type: 'clearDay'; date: string }
  | { type: 'importDays'; days: Day[] }
  | { type: 'replaceAll'; db: Database }
  | { type: 'setSettings'; patch: Partial<Settings> };

/** clean → dirty → skipped → unclaimed, matching how notes get annotated. */
const CYCLE: SlotStatus[] = ['empty', 'done', 'partial', 'skipped'];

function withDay(db: Database, date: string, fn: (day: Day) => void): Database {
  const existing = db.days[date] ?? emptyDay(date);
  const day: Day = {
    ...existing,
    slots: existing.slots.map((s) => ({ ...s })),
    goals: existing.goals.map((g) => ({ ...g })),
    notes: existing.notes.map((n) => ({ ...n })),
  };
  fn(day);
  day.updatedAt = Date.now();
  day.goals.sort((a, b) => a.startSlot - b.startSlot);
  return { ...db, days: { ...db.days, [date]: day } };
}

function reducer(db: Database, action: Action): Database {
  switch (action.type) {
    case 'setStatus':
      return withDay(db, action.date, (d) => {
        d.slots[action.slot - 1].status = action.status;
      });

    case 'cycleStatus':
      return withDay(db, action.date, (d) => {
        const slot = d.slots[action.slot - 1];
        slot.status = CYCLE[(CYCLE.indexOf(slot.status) + 1) % CYCLE.length];
      });

    case 'setNote':
      return withDay(db, action.date, (d) => {
        d.slots[action.slot - 1].note = action.note;
      });

    case 'setMood':
      return withDay(db, action.date, (d) => {
        d.slots[action.slot - 1].mood = action.mood;
      });

    case 'setWindow':
      return withDay(db, action.date, (d) => {
        if (action.which === 'top') d.windowTop = action.value;
        else d.windowBottom = action.value;
      });

    case 'addGoal':
      return withDay(db, action.date, (d) => {
        const startSlot = Math.min(Math.max(action.startSlot, 1), SLOTS_PER_DAY);
        // One goal per anchor point: re-anchoring replaces rather than stacks.
        const existing = d.goals.find((g) => g.startSlot === startSlot);
        if (existing) {
          existing.label = action.label;
          existing.detail = action.detail ?? existing.detail;
          return;
        }
        d.goals.push({
          id: `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          label: action.label,
          detail: action.detail ?? '',
          startSlot,
          color: d.goals.length % 6,
        });
      });

    case 'updateGoal':
      return withDay(db, action.date, (d) => {
        const goal = d.goals.find((g) => g.id === action.id);
        if (goal) Object.assign(goal, action.patch);
      });

    case 'removeGoal':
      return withDay(db, action.date, (d) => {
        d.goals = d.goals.filter((g) => g.id !== action.id);
      });

    case 'addNote':
      return withDay(db, action.date, (d) => {
        d.notes.push({
          id: `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          afterSlot: action.afterSlot,
          text: action.text,
        });
      });

    case 'updateNote':
      return withDay(db, action.date, (d) => {
        const note = d.notes.find((n) => n.id === action.id);
        if (note) note.text = action.text;
      });

    case 'removeNote':
      return withDay(db, action.date, (d) => {
        d.notes = d.notes.filter((n) => n.id !== action.id);
      });

    case 'clearDay': {
      const days = { ...db.days };
      delete days[action.date];
      return { ...db, days };
    }

    case 'importDays': {
      const days = { ...db.days };
      for (const day of action.days) days[day.date] = day;
      return { ...db, days };
    }

    case 'replaceAll':
      return action.db;

    case 'setSettings':
      return { ...db, settings: { ...db.settings, ...action.patch } };

    default:
      return db;
  }
}

/** Wraps the reducer so persistence and badge unlocks happen in one place. */
function persistingReducer(db: Database, action: Action): Database {
  const next = reducer(db, action);
  if (next === db) return db;
  const unlocked = { ...next.unlocked };
  const staged: Database = { ...next, unlocked };
  reconcile(staged);
  save(staged);
  return staged;
}

interface StoreValue {
  db: Database;
  dispatch: (action: Action) => void;
  /** Day being edited on the Today page; defaults to today. */
  activeDate: string;
  setActiveDate: (date: string) => void;
  day: Day;
  /** Ids of badges unlocked since the last dismissal, for the toast. */
  freshBadges: string[];
  dismissBadges: () => void;
  /** Optional folder-on-disk mirror; `supported: false` where the API is absent. */
  vault: VaultApi;
  /** Optional GitHub-backed cloud sync; `configured: false` until built with an API base. */
  cloud: CloudApi;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, rawDispatch] = useReducer(persistingReducer, undefined, load);
  const [activeDate, setActiveDate] = useState(todayKey);
  const [freshBadges, setFreshBadges] = useState<string[]>([]);

  const dispatch = useCallback((action: Action) => {
    const before = new Set(Object.keys(load().unlocked));
    rawDispatch(action);
    // Compare on the next tick, once the reducer has persisted its result.
    queueMicrotask(() => {
      const after = Object.keys(load().unlocked).filter((id) => !before.has(id));
      if (after.length) setFreshBadges((prev) => [...new Set([...prev, ...after])]);
    });
  }, []);

  // Backfill unlocks for a database that predates a newly-added achievement.
  useEffect(() => {
    const staged: Database = { ...db, unlocked: { ...db.unlocked } };
    if (reconcile(staged).length) rawDispatch({ type: 'replaceAll', db: staged });
    // Intentionally runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replaceAll = useCallback((next: Database) => rawDispatch({ type: 'replaceAll', db: next }), []);
  const vault = useVault(db, replaceAll);
  const cloud = useServerSync(db, replaceAll);

  const day = db.days[activeDate] ?? emptyDay(activeDate);

  const value = useMemo<StoreValue>(
    () => ({
      db,
      dispatch,
      activeDate,
      setActiveDate,
      day,
      freshBadges,
      dismissBadges: () => setFreshBadges([]),
      vault,
      cloud,
    }),
    [db, dispatch, activeDate, day, freshBadges, vault, cloud],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
