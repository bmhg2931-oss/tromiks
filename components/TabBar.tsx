"use client";

export type TabDef = { key: string; label: string };

export default function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-line mb-5">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${
            active === t.key ? "border-brass text-brass-deep" : "border-transparent text-ink-soft hover:text-ink"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
