'use client';

import { useEffect, useState } from 'react';

type StatusRow = {
  key: string;
  label: string;
  color: string;
  archived: boolean;
  is_default: boolean;
};

const COLORS = ['blue', 'teal', 'violet', 'green', 'red', 'amber', 'slate'];

export function KanbanEditor({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<StatusRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setError(null);
      const response = await fetch('/api/crm-data?action=lead-statuses');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (!cancelled) setError(data.error || 'Could not load statuses');
        return;
      }
      if (!cancelled) {
        setRows((data.statuses || []).map((status: StatusRow) => ({
          key: status.key,
          label: status.label,
          color: status.color || 'slate',
          archived: Boolean(status.archived),
          is_default: Boolean(status.is_default),
        })));
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  function move(index: number, direction: -1 | 1) {
    const next = [...rows];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row);
    setRows(next);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/lead-statuses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statuses: rows }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save the board');
      const parked = (data.leads_on_archived || []) as { status: string; count: number }[];
      if (parked.length > 0) {
        setNotice(parked.map((row) => `${row.count} leads remain on ${row.status}. They stay visible in Other until someone moves them.`).join(' '));
      }
      onSaved();
      if (parked.length === 0) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the board');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Kanban statuses</h2>
            <p className="text-xs text-slate-500 mt-1">These columns are saved for this tenant. Deactivating a status does not delete its leads.</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-slate-500">Close</button>
        </div>
        <div className="p-5 space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm text-amber-700">{notice}</p>}
          {rows.map((row, index) => (
            <div key={`${row.key}-${index}`} className="grid grid-cols-1 sm:grid-cols-[1fr_8rem_auto] gap-2 items-center">
              <input
                value={row.label}
                onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))}
                className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800"
                aria-label={`Status name ${index + 1}`}
              />
              <select
                value={row.color}
                onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, color: event.target.value } : item))}
                className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800"
                aria-label={`Color ${index + 1}`}
              >
                {COLORS.map((color) => <option key={color} value={color}>{color}</option>)}
              </select>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button type="button" onClick={() => move(index, -1)} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">Up</button>
                <button type="button" onClick={() => move(index, 1)} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">Down</button>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="default-status"
                    checked={row.is_default && !row.archived}
                    onChange={() => setRows(rows.map((item, itemIndex) => ({ ...item, is_default: itemIndex === index })))}
                  />
                  Default
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={row.archived}
                    onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, archived: event.target.checked, is_default: event.target.checked ? false : item.is_default } : item))}
                  />
                  Inactive
                </label>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows([...rows, { key: '', label: 'New status', color: 'slate', archived: false, is_default: false }])}
            className="text-xs font-semibold text-teal-700"
          >
            Add status
          </button>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="px-3 py-2 text-xs rounded-xl bg-teal-600 text-white disabled:opacity-50">
            {saving ? 'Saving...' : 'Save board'}
          </button>
        </div>
      </div>
    </div>
  );
}
