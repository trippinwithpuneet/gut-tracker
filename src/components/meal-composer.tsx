'use client';

import { useMemo, useState } from 'react';
import { TAG_CATEGORY_LABELS } from '@/lib/library';
import { combineDayAndTime, guessSlot, toTimeInput } from '@/lib/dates';
import type { FoodTag, Meal, MealSlot } from '@/lib/types';
import { Button, Chip, Field, cx, inputClass } from './ui';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'];

/**
 * Suggests tags whose aliases appear in what the user typed.
 *
 * This is deliberately dumb substring matching, not an AI call: it runs offline,
 * costs nothing, and a wrong suggestion is one that simply doesn't get tapped.
 * Word-boundary matching keeps "chai" out of "chaigrill" and "egg" out of "veggie".
 */
export function suggestTags(description: string, tags: FoodTag[]): FoodTag[] {
  const text = description.toLowerCase();
  if (text.trim().length < 3) return [];

  return tags.filter((tag) => {
    const needles = [tag.name.toLowerCase(), ...tag.aliases.map((a) => a.toLowerCase())];
    return needles.some((needle) => {
      if (needle.length < 3) return false;
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}s?\\b`).test(text);
    });
  });
}

export function MealComposer({
  day,
  tags,
  quickTagIds,
  existing,
  onSave,
  onCancel,
  onCreateTag,
}: {
  day: string;
  tags: FoodTag[];
  /** Tags to show up front — the user's tracked set, then their most-used. */
  quickTagIds: string[];
  existing?: Meal | null;
  onSave: (meal: Omit<Meal, 'id'> & { id?: string }) => Promise<void>;
  onCancel?: () => void;
  onCreateTag?: (name: string) => Promise<FoodTag | null>;
}) {
  const [description, setDescription] = useState(existing?.description ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set(existing?.tagIds ?? []));
  const [time, setTime] = useState(
    existing ? toTimeInput(existing.occurredAt) : toTimeInput(new Date().toISOString())
  );
  const [slot, setSlot] = useState<MealSlot | null>(existing?.slot ?? guessSlot());
  const [isOutside, setIsOutside] = useState(existing?.isOutside ?? false);
  const [showAll, setShowAll] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [saving, setSaving] = useState(false);

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const quickTags = useMemo(() => {
    const ordered = quickTagIds.map((id) => tagById.get(id)).filter(Boolean) as FoodTag[];
    // Anything already selected stays visible even if it is not a quick tag.
    const extras = [...selected]
      .filter((id) => !quickTagIds.includes(id))
      .map((id) => tagById.get(id))
      .filter(Boolean) as FoodTag[];
    return [...ordered, ...extras];
  }, [quickTagIds, tagById, selected]);

  const suggestions = useMemo(
    () => suggestTags(description, tags).filter((t) => !selected.has(t.id)),
    [description, tags, selected]
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, FoodTag[]>();
    for (const tag of tags) {
      const list = groups.get(tag.category) ?? [];
      list.push(tag);
      groups.set(tag.category, list);
    }
    return [...groups.entries()];
  }, [tags]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave({
        id: existing?.id,
        occurredOn: day,
        occurredAt: combineDayAndTime(day, time),
        slot,
        description: description.trim(),
        isOutside,
        notes: existing?.notes ?? null,
        tagIds: [...selected],
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name || !onCreateTag) return;
    const created = await onCreateTag(name);
    if (created) {
      setSelected((prev) => new Set(prev).add(created.id));
      setNewTagName('');
    }
  };

  const canSave = description.trim().length > 0 || selected.size > 0;

  return (
    <div className="space-y-4">
      <Field label="What did you eat?" hint="Rough is fine — the tags are what get analysed.">
        <input
          className={inputClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. dal, rice, curd and bhindi"
          autoComplete="off"
          enterKeyHint="done"
        />
      </Field>

      {suggestions.length > 0 && (
        <div>
          <div className="mb-2 text-[11.5px] text-faint">
            From what you typed — tap to add
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.slice(0, 6).map((tag) => (
              <Chip key={tag.id} label={`+ ${tag.name}`} dashed onToggle={() => toggle(tag.id)} />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-faint">
          Tags
        </div>
        <div className="flex flex-wrap gap-2">
          {quickTags.map((tag) => (
            <Chip
              key={tag.id}
              label={tag.name}
              title={tag.description ?? undefined}
              selected={selected.has(tag.id)}
              onToggle={() => toggle(tag.id)}
            />
          ))}
          <Chip
            label={showAll ? 'Show less' : `+ ${Math.max(0, tags.length - quickTags.length)} more`}
            dashed
            onToggle={() => setShowAll((v) => !v)}
          />
        </div>
      </div>

      {showAll && (
        <div className="space-y-3 rounded-[var(--radius-field)] border border-line bg-surface-2 p-3">
          {grouped.map(([category, list]) => (
            <div key={category}>
              <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-faint">
                {TAG_CATEGORY_LABELS[category as keyof typeof TAG_CATEGORY_LABELS] ?? category}
              </div>
              <div className="flex flex-wrap gap-2">
                {list.map((tag) => (
                  <Chip
                    key={tag.id}
                    label={tag.name}
                    title={tag.description ?? undefined}
                    selected={selected.has(tag.id)}
                    onToggle={() => toggle(tag.id)}
                  />
                ))}
              </div>
            </div>
          ))}

          {onCreateTag && (
            <div className="flex gap-2 pt-1">
              <input
                className={cx(inputClass, 'flex-1 py-2.5')}
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Add your own tag"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleCreateTag();
                  }
                }}
              />
              <Button variant="secondary" onClick={handleCreateTag} disabled={!newTagName.trim()}>
                Add
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Time" hint="Optional — helps spot delayed reactions.">
          <input
            type="time"
            className={inputClass}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
        <Field label="Meal">
          <select
            className={cx(inputClass, 'appearance-none')}
            value={slot ?? ''}
            onChange={(e) => setSlot((e.target.value || null) as MealSlot | null)}
          >
            <option value="">Not set</option>
            {SLOTS.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <button
        type="button"
        onClick={() => setIsOutside((v) => !v)}
        aria-pressed={isOutside}
        className={cx(
          'flex w-full items-center justify-between rounded-[var(--radius-field)] border px-4 py-3 text-left text-sm font-semibold transition-colors',
          isOutside ? 'border-lime bg-lime/10 text-lime' : 'border-line bg-surface-2 text-muted'
        )}
      >
        <span>
          Ate out
          <span className="mt-0.5 block text-[11.5px] font-normal text-faint">
            Restaurant, takeaway, someone else&apos;s kitchen
          </span>
        </span>
        <span
          className={cx(
            'ml-3 size-5 shrink-0 rounded-full border-2',
            isOutside ? 'border-lime bg-lime' : 'border-line'
          )}
        />
      </button>

      <div className="flex gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
        <Button onClick={handleSave} disabled={!canSave || saving} className="flex-[2]">
          {saving ? 'Saving…' : existing ? 'Update meal' : 'Save meal'}
        </Button>
      </div>
    </div>
  );
}
