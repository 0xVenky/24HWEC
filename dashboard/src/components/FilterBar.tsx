import { useMemo, useState } from "react";
import type { LtsResultEntry } from "../types";
import { classColor, CLASS_GROUPS } from "../lib/classes";

export interface FilterState {
  classes: Set<string>; // exact-match CLASSNAME selections; empty = all
  groups: Set<string>; // group labels selected
  search: string;
  onlyRunning: boolean;
}

export const emptyFilters: FilterState = {
  classes: new Set(),
  groups: new Set(),
  search: "",
  onlyRunning: false,
};

export function FilterBar(props: {
  entries: LtsResultEntry[];
  filters: FilterState;
  onChange: (f: FilterState) => void;
}) {
  const [classMenuOpen, setClassMenuOpen] = useState(false);
  const { entries, filters, onChange } = props;

  const allClasses = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      counts.set(e.CLASSNAME, (counts.get(e.CLASSNAME) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [entries]);

  const toggleGroup = (label: string) => {
    const next = new Set(filters.groups);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    onChange({ ...filters, groups: next });
  };

  const toggleClass = (name: string) => {
    const next = new Set(filters.classes);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange({ ...filters, classes: next });
  };

  const clearAll = () =>
    onChange({ classes: new Set(), groups: new Set(), search: "", onlyRunning: filters.onlyRunning });

  const activeCount = filters.classes.size + filters.groups.size + (filters.search ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-f1-divider bg-f1-bg px-6 py-3">
      <input
        type="text"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        placeholder="Search driver / car / team / #"
        className="w-64 rounded-sm border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-white placeholder:text-f1-dim focus:border-f1-accent focus:outline-none"
      />

      <div className="mx-1 h-6 w-px bg-f1-divider" />

      <span className="text-xs uppercase tracking-wider text-f1-dim">Group:</span>
      {CLASS_GROUPS.map((g) => {
        const active = filters.groups.has(g.label);
        return (
          <button
            key={g.label}
            onClick={() => toggleGroup(g.label)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? "border-f1-accent bg-f1-accent/20 text-white"
                : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
            }`}
          >
            {g.label}
          </button>
        );
      })}

      <div className="mx-1 h-6 w-px bg-f1-divider" />

      <div className="relative">
        <button
          onClick={() => setClassMenuOpen((v) => !v)}
          className="rounded-sm border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-zinc-200 hover:border-zinc-500"
        >
          Class
          {filters.classes.size > 0 ? (
            <span className="ml-2 rounded-sm bg-f1-accent px-1.5 py-0.5 text-[10px] text-white">
              {filters.classes.size}
            </span>
          ) : null}
        </button>
        {classMenuOpen && (
          <div className="absolute z-10 mt-1 max-h-96 w-72 overflow-auto rounded-sm border border-zinc-700 bg-f1-panel p-2 shadow-xl">
            {allClasses.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-f1-dim">No data yet</div>
            ) : (
              allClasses.map(([name, n]) => {
                const active = filters.classes.has(name);
                return (
                  <button
                    key={name}
                    onClick={() => toggleClass(name)}
                    className={`flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-zinc-800 ${
                      active ? "bg-zinc-800 text-white" : "text-zinc-300"
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span
                        className="inline-block h-3 w-1 flex-none rounded-sm"
                        style={{ backgroundColor: classColor(name) }}
                      />
                      <span className="truncate">{name}</span>
                    </span>
                    <span className="text-f1-dim">{n}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <label className="ml-1 flex items-center gap-2 text-xs text-zinc-300">
        <input
          type="checkbox"
          checked={filters.onlyRunning}
          onChange={(e) => onChange({ ...filters, onlyRunning: e.target.checked })}
          className="accent-f1-accent"
        />
        Hide stationary (LAPS = 0)
      </label>

      <div className="ml-auto flex items-center gap-2">
        {activeCount > 0 && (
          <button
            onClick={clearAll}
            className="text-xs uppercase tracking-wider text-f1-dim underline-offset-2 hover:text-white hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

// Pure filter evaluator — exported so the table parent can drive sort + filter.
export function applyFilters(entries: LtsResultEntry[], f: FilterState): LtsResultEntry[] {
  const q = f.search.trim().toLowerCase();
  return entries.filter((e) => {
    if (f.classes.size > 0 && !f.classes.has(e.CLASSNAME)) return false;
    if (f.groups.size > 0) {
      const matchedAny = CLASS_GROUPS.some(
        (g) => f.groups.has(g.label) && g.match(e.CLASSNAME),
      );
      if (!matchedAny) return false;
    }
    if (f.onlyRunning && (e.LAPS === "0" || e.LAPS === "")) return false;
    if (q) {
      const hay = `${e.NAME} ${e.CAR} ${e.TEAM ?? ""} ${e.STNR} ${e.CLASSNAME}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
