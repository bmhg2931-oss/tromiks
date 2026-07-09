function money(amount: number, currency: string) {
  return `${currency}${Math.round(amount).toLocaleString("he-IL")}`;
}

export default function CampaignProgressBar({
  raised,
  goal,
  currency,
}: {
  raised: number;
  goal: number | null;
  currency: string;
}) {
  if (!goal) {
    return <p className="text-sm font-semibold text-ink">{money(raised, currency)} גויס (ללא יעד מוגדר)</p>;
  }
  const pct = Math.min(100, Math.round((raised / goal) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm mb-1">
        <span className="font-semibold text-ink">{money(raised, currency)}</span>
        <span className="text-ink-soft text-xs">
          מתוך יעד {money(goal, currency)} · {pct}%
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-parchment-deep border border-line overflow-hidden">
        <div className="h-full bg-brass rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
