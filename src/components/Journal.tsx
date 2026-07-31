/** Every recorded day, newest first, as a scannable log. */

import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { formatLong, formatRelative } from '../lib/date';
import { intensity } from '../lib/stats';
import { dayHours, dayTouched, SLOTS_PER_DAY } from '../lib/types';
import { Card, Empty, TextInput, num } from './ui';

export function Journal({ go }: { go: (route: string) => void }) {
  const { db, setActiveDate } = useStore();
  const [query, setQuery] = useState('');

  const days = useMemo(() => {
    const list = Object.values(db.days).filter(dayTouched).sort((a, b) => b.date.localeCompare(a.date));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) =>
        d.date.includes(q) ||
        d.goals.some((g) => `${g.label} ${g.detail}`.toLowerCase().includes(q)) ||
        d.slots.some((s) => s.note.toLowerCase().includes(q)) ||
        d.notes.some((n) => n.text.toLowerCase().includes(q)),
    );
  }, [db.days, query]);

  return (
    <Card
      title="Journal"
      action={
        <TextInput
          placeholder="Search notes, goals, dates…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input--search"
        />
      }
    >
      {days.length === 0 ? (
        <Empty
          icon="📓"
          title={query ? 'Nothing matches that' : 'No days recorded yet'}
          hint={query ? undefined : 'Start a block on the Today page and it will show up here.'}
        />
      ) : (
        <ul className="journal">
          {days.map((day) => {
            const hours = dayHours(day);
            return (
              <li key={day.date}>
                <button
                  className="journal__row"
                  onClick={() => {
                    setActiveDate(day.date);
                    go('today');
                  }}
                >
                  <span className={`journal__dot cell cell--l${intensity(hours)}`} aria-hidden />
                  <span className="journal__when">
                    <strong>{formatRelative(day.date)}</strong>
                    <span className="muted small">{formatLong(day.date)}</span>
                  </span>

                  <span className="journal__mini" aria-label={`${num(hours)} hours`}>
                    {day.slots.map((s) => (
                      <span key={s.index} className={`mini mini--${s.status}`} />
                    ))}
                  </span>

                  <span className="journal__goals">
                    {day.goals.map((g) => (
                      <span key={g.id} className={`chip chip--goal chip--c${g.color}`}>
                        {g.label}
                      </span>
                    ))}
                  </span>

                  <span className="journal__hours">
                    {num(hours)}
                    <span className="muted">/{day.slots.length || SLOTS_PER_DAY}h</span>
                  </span>
                </button>

                {(day.slots.some((s) => s.note) || day.notes.length > 0) && (
                  <p className="journal__notes">
                    {[
                      ...day.slots.filter((s) => s.note).map((s) => `${s.index}: ${s.note}`),
                      ...day.notes.map((n) => n.text),
                    ]
                      .slice(0, 6)
                      .join(' · ')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
