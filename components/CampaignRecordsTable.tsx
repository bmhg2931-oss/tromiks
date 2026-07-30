export type CampaignRecordRow = {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  type: "pledge" | "donation";
  amount: number;
  currency: string;
  date: string;
  category: string | null;
};

export default function CampaignRecordsTable({ rows }: { rows: CampaignRecordRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink-soft text-center py-6">אין עדיין רשומות המשויכות ישירות לקמפיין זה</p>;
  }
  return (
    <div className="bg-white border border-line rounded-xl shadow overflow-auto max-h-[50vh]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.1)]">
          <tr className="text-right text-xs text-ink-soft border-b-2 border-line">
            <th className="p-2.5">תורם</th>
            <th className="p-2.5">סוג</th>
            <th className="p-2.5">סכום</th>
            <th className="p-2.5">קטגוריה</th>
            <th className="p-2.5">תאריך</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.type}-${r.id}`} className="border-b border-[#e6e3da]">
              <td className="p-2.5 font-semibold whitespace-nowrap">{r.contactName}</td>
              <td className="p-2.5 whitespace-nowrap">{r.type === "pledge" ? "התחייבות" : "תשלום"}</td>
              <td className="p-2.5 whitespace-nowrap">
                {r.currency}
                {Number(r.amount).toLocaleString("he-IL")}
              </td>
              <td className="p-2.5 whitespace-nowrap">{r.category || "—"}</td>
              <td className="p-2.5 whitespace-nowrap">{new Date(r.date).toLocaleDateString("he-IL")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
