/**
 * Export the day as an image.
 *
 * A preview of exactly what will leave the machine, and two ways to take it:
 * a PNG on disk, or straight onto the clipboard to paste into a chat. The
 * preview is the point — you can see before you send it what is in there.
 *
 * Reports are drawn and everything else written is not, so the one switch
 * worth having is over them. It redraws the preview, which is the whole
 * promise: what you are looking at is what leaves.
 */

import { useMemo, useState } from 'react';
import { drawDay, toPng } from '../lib/shot';
import type { Day, DayShape, ScheduleId } from '../lib/types';
import { Button, Modal } from './ui';

const SCALES = [1, 2, 3] as const;

export function DayShot({
  day,
  shape,
  schedule,
  dailyGoal,
  onClose,
}: {
  day: Day;
  shape: DayShape;
  schedule: ScheduleId;
  dailyGoal: number;
  onClose: () => void;
}) {
  const [scale, setScale] = useState<(typeof SCALES)[number]>(2);
  const [said, setSaid] = useState('');
  const [reports, setReports] = useState(true);

  const canvas = useMemo(
    () => drawDay({ day, shape, schedule, dailyGoal, reports }, scale),
    [day, shape, schedule, dailyGoal, scale, reports],
  );
  const preview = useMemo(() => canvas.toDataURL('image/png'), [canvas]);

  const save = async () => {
    const blob = await toPng(canvas);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timeforces-${day.date}.png`;
    a.click();
    URL.revokeObjectURL(url);
    setSaid('Saved.');
  };

  const copy = async () => {
    const blob = await toPng(canvas);
    if (!blob) return;
    try {
      // Firefox only gained async clipboard images recently, and Safari wants
      // the write to happen inside the gesture; say so rather than fail mutely.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setSaid('Copied to the clipboard.');
    } catch {
      setSaid('This browser will not take an image; use PNG.');
    }
  };

  return (
    <Modal open title="Export the day" onClose={onClose} className="modal--shot">
      <div className="shot">
        <div className="shot__preview">
          <img src={preview} alt={`The day of ${day.date}, as it will be exported`} />
        </div>

        <div className="shot__side">
          <p className="muted small">
            The shape of the day — hours, blocks and their verdicts — and what you wrote that
            each round produced. Block comments, side notes and round goals are never drawn.
          </p>

          <label className="shot__toggle">
            <input
              type="checkbox"
              checked={reports}
              onChange={(e) => setReports(e.target.checked)}
            />
            <span className="small">Include what each round produced</span>
          </label>

          <div className="shot__scale">
            <span className="muted small">Scale</span>
            <div className="seg">
              {SCALES.map((s) => (
                <button key={s} aria-pressed={scale === s} onClick={() => setScale(s)}>
                  {s}×
                </button>
              ))}
            </div>
          </div>

          <div className="shot__actions">
            <Button variant="primary" onClick={save}>
              PNG
            </Button>
            <Button onClick={copy}>Copy to clipboard</Button>
          </div>

          <span className="shot__said muted small">{said}</span>
        </div>
      </div>
    </Modal>
  );
}
