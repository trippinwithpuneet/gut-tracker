'use client';

import { useMemo, useState } from 'react';
import { combineDayAndTime, toTimeInput } from '@/lib/dates';
import type { SymptomLog, SymptomType } from '@/lib/types';
import { Button, Chip, Field, SeverityPicker, cx, inputClass } from './ui';

/**
 * Logging how you feel.
 *
 * Binary-scale symptoms (blood in stool, unintended weight loss) skip the 1–5 dial
 * — asking someone to rate blood out of five is absurd, and the analysis treats
 * them as present/absent anyway.
 */
export function SymptomComposer({
  day,
  symptomTypes,
  trackedIds,
  existing,
  onSave,
  onCancel,
}: {
  day: string;
  symptomTypes: SymptomType[];
  trackedIds: string[];
  existing?: SymptomLog | null;
  onSave: (log: Omit<SymptomLog, 'id'> & { id?: string }) => Promise<void>;
  onCancel?: () => void;
}) {
  const [symptomTypeId, setSymptomTypeId] = useState(
    existing?.symptomTypeId ?? trackedIds[0] ?? symptomTypes[0]?.id ?? ''
  );
  const [severity, setSeverity] = useState<number | null>(existing?.severity ?? null);
  const [time, setTime] = useState(
    existing ? toTimeInput(existing.occurredAt) : toTimeInput(new Date().toISOString())
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);

  const byId = useMemo(() => new Map(symptomTypes.map((s) => [s.id, s])), [symptomTypes]);
  const selected = byId.get(symptomTypeId);
  const isBinary = selected?.scale === 'binary';

  const visible = useMemo(() => {
    if (showAll) return symptomTypes;
    const tracked = trackedIds.map((id) => byId.get(id)).filter(Boolean) as SymptomType[];
    if (selected && !tracked.some((s) => s.id === selected.id)) tracked.push(selected);
    return tracked.length > 0 ? tracked : symptomTypes.slice(0, 6);
  }, [showAll, symptomTypes, trackedIds, byId, selected]);

  const handleSave = async () => {
    if (saving || !symptomTypeId) return;
    // Binary symptoms record presence; there is no meaningful intensity to ask for.
    const value = isBinary ? 5 : severity;
    if (value === null) return;

    setSaving(true);
    try {
      await onSave({
        id: existing?.id,
        symptomTypeId,
        occurredOn: day,
        occurredAt: combineDayAndTime(day, time),
        severity: value,
        notes: notes.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
          What are you feeling?
        </div>
        <div className="flex flex-wrap gap-2">
          {visible.map((symptom) => (
            <Chip
              key={symptom.id}
              label={symptom.name}
              title={symptom.description ?? undefined}
              selected={symptom.id === symptomTypeId}
              onToggle={() => setSymptomTypeId(symptom.id)}
            />
          ))}
          <Chip
            label={showAll ? 'Show less' : 'Something else'}
            dashed
            onToggle={() => setShowAll((v) => !v)}
          />
        </div>
      </div>

      {selected?.isRedFlag && (
        <div className="rounded-[var(--radius-field)] border border-hot/35 bg-hot/10 px-3.5 py-3 text-[12.5px] leading-relaxed text-hot">
          <b className="font-bold">Worth a doctor, not a diet tweak.</b>{' '}
          {selected.slug === 'blood-stool'
            ? 'Visible blood should always be looked at by a clinician, even once.'
            : selected.slug === 'greasy-stool'
              ? 'Pale, oily or floating stools can point to fat malabsorption.'
              : 'Losing weight without trying is worth getting checked.'}{' '}
          Keep logging it here so you have a record to show them.
        </div>
      )}

      {!isBinary && (
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
            How bad?
          </div>
          <SeverityPicker value={severity} onChange={setSeverity} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Time" hint="Optional.">
          <input
            type="time"
            className={inputClass}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
        <Field label="Note">
          <input
            className={inputClass}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </Field>
      </div>

      <div className="flex gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
        <Button
          onClick={handleSave}
          disabled={saving || !symptomTypeId || (!isBinary && severity === null)}
          className={cx('flex-[2]')}
        >
          {saving ? 'Saving…' : existing ? 'Update' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
