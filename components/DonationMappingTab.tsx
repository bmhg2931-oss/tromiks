"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TabBar from "@/components/TabBar";
import ExportButton from "@/components/ExportButton";
import DonationImportModal from "@/components/DonationImportModal";
import DonationImportRowCard, { DonationImportRowCardHeader, DONATION_IMPORT_ROW_COLUMN_COUNT } from "@/components/DonationImportRowCard";
import { getDonationImportTemplateRows, commitMatchedRowsBatch, type CommitRowError } from "@/app/(app)/donations/mapping-actions";
import { type DonationImportRow, type DonationImportSource } from "@/lib/types";
import NedarimSyncPanel from "@/components/NedarimSyncPanel";
import StripeSyncPanel from "@/components/StripeSyncPanel";

const TABS: { key: DonationImportSource; label: string; enabled: boolean }[] = [
  { key: "כללי", label: "כללי", enabled: true },
  { key: "נדרים פלוס", label: "נדרים פלוס", enabled: true },
  { key: "Stripe", label: "Stripe", enabled: true },
  { key: "פורטל SOLA", label: "פורטל SOLA", enabled: false },
];

const STATUS_FILTERS: { key: DonationImportRow["match_status"] | "all"; label: string }[] = [
  { key: "unmatched", label: "טרם שויך" },
  { key: "ambiguous", label: "כמה התאמות אפשריות" },
  { key: "matched", label: "שויך (טרם אושר)" },
  { key: "all", label: "הכל" },
  { key: "imported", label: "יובא" },
  { key: "skipped", label: "דולג" },
];

const PAGE_SIZE = 50;
// עמוד קטן וחסום לאותה סיבה בדיוק כמו ב-NedarimSyncPanel.tsx - Vercel Hobby
// מגביל כל invocation ל-10 שניות, אז אישור של אלפי שורות בבת אחת לא אפשרי
const COMMIT_BATCH_SIZE = 25;
const ROW_SELECT = "*, contacts:matched_contact_id(first_name, last_name), donation_import_batches!inner(source)";

export default function DonationMappingTab() {
  const [tab, setTab] = useState<DonationImportSource>("כללי");
  const [statusFilter, setStatusFilter] = useState<DonationImportRow["match_status"] | "all">("unmatched");
  const [rows, setRows] = useState<DonationImportRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitTotals, setCommitTotals] = useState<{ succeeded: number; failed: CommitRowError[] } | null>(null);
  const [showImport, setShowImport] = useState(false);

  async function loadRows() {
    setLoading(true);
    setCommitTotals(null);
    const supabase = createClient();

    let countQuery = supabase
      .from("donation_import_rows")
      .select("id, donation_import_batches!inner(source)", { count: "exact", head: true })
      .eq("donation_import_batches.source", tab);
    if (statusFilter !== "all") countQuery = countQuery.eq("match_status", statusFilter);

    const matchedCountQuery = supabase
      .from("donation_import_rows")
      .select("id, donation_import_batches!inner(source)", { count: "exact", head: true })
      .eq("donation_import_batches.source", tab)
      .eq("match_status", "matched");

    const [{ count }, { count: matchedTotal }] = await Promise.all([countQuery, matchedCountQuery]);
    setTotalCount(count ?? 0);
    setMatchedCount(matchedTotal ?? 0);

    let query = supabase
      .from("donation_import_rows")
      .select(ROW_SELECT)
      .eq("donation_import_batches.source", tab)
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1);
    if (statusFilter !== "all") query = query.eq("match_status", statusFilter);
    const { data } = await query;
    setRows((data as unknown as DonationImportRow[]) ?? []);
    setLoading(false);
  }

  async function loadMore() {
    setLoadingMore(true);
    const supabase = createClient();
    let query = supabase
      .from("donation_import_rows")
      .select(ROW_SELECT)
      .eq("donation_import_batches.source", tab)
      .order("created_at", { ascending: false })
      .range(rows.length, rows.length + PAGE_SIZE - 1);
    if (statusFilter !== "all") query = query.eq("match_status", statusFilter);
    const { data } = await query;
    setRows((prev) => [...prev, ...((data as unknown as DonationImportRow[]) ?? [])]);
    setLoadingMore(false);
  }

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, statusFilter]);

  function patchRow(rowId: string, patch: Partial<DonationImportRow>) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  }

  async function refreshRow(rowId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("donation_import_rows")
      .select("*, contacts:matched_contact_id(first_name, last_name)")
      .eq("id", rowId)
      .single();
    if (data) patchRow(rowId, data as unknown as DonationImportRow);
  }

  // מאשר את כל השורות המשויכות עבור המקור הזה - לא רק את אלה שנטענו כרגע למסך.
  // רץ בלולאה בצד לקוח על עמודים קטנים (ר' commitMatchedRowsBatch), בדיוק כמו
  // לולאת הסנכרון של נדרים פלוס - כי אישור אלף+ שורות בקריאה סינכרונית אחת יחרוג
  // מ-timeout של Vercel
  async function handleCommitAllMatched() {
    setCommitting(true);
    let succeeded = 0;
    const failed: CommitRowError[] = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = await commitMatchedRowsBatch(tab, COMMIT_BATCH_SIZE);
      succeeded += result.succeeded.length;
      failed.push(...result.failed);
      setCommitTotals({ succeeded, failed: [...failed] });
      // result.failed.length>0 בלי succeeded חדשות אומר שהעמוד לא התקדם (כל
      // השורות שנשארו נכשלות עקבית) - עצירה כדי לא להיתקע בלולאה אינסופית
      if (result.remaining === 0 || (result.succeeded.length === 0 && result.failed.length > 0)) break;
    }
    setCommitting(false);
    loadRows();
  }

  const activeTab = TABS.find((t) => t.key === tab)!;

  return (
    <div>
      <p className="text-sm text-ink-soft mb-4">
        ייבוא תרומות ממקורות חיצוניים ושיוך שורות לאנשי קשר. שורה לא תיהפך לתרומה/התחייבות בפועל עד שהיא משויכת ומאושרת.
      </p>

      <TabBar tabs={TABS.map((t) => ({ key: t.key, label: t.label }))} active={tab} onChange={(k) => setTab(k as DonationImportSource)} />

      {!activeTab.enabled ? (
        <p className="text-sm text-ink-soft">מקור זה עוד לא מוטמע - בקרוב.</p>
      ) : (
        <>
          {tab === "נדרים פלוס" && <NedarimSyncPanel onImported={loadRows} />}
          {tab === "Stripe" && <StripeSyncPanel onImported={loadRows} />}

          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-soft">{loading ? "טוען..." : `${totalCount} שורות בסינון זה`}</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="in text-xs h-8">
                {STATUS_FILTERS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            {tab === "כללי" && (
              <div className="flex items-center gap-2">
                <ExportButton buttonLabel="הורדת קובץ תבנית לדוגמה" filename="תבנית_ייבוא_תרומות" sheetName="תרומות" onExport={getDonationImportTemplateRows} />
                <button
                  type="button"
                  onClick={() => setShowImport(true)}
                  className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-4 h-9 text-sm transition"
                >
                  ייבוא קובץ
                </button>
              </div>
            )}
          </div>

          {(matchedCount > 0 || committing) && (
            <div className="flex items-center justify-between gap-3 bg-parchment border border-line rounded-lg p-2 mb-3 flex-wrap">
              <span className="text-xs text-ink-soft">
                {committing
                  ? `מאשר... ${commitTotals?.succeeded ?? 0} אושרו עד כה`
                  : `${matchedCount} שורות משויכות בסה"כ (בכל המקור, לא רק בעמוד שנטען) וטרם אושרו`}
              </span>
              <button
                type="button"
                disabled={committing}
                onClick={handleCommitAllMatched}
                className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-4 h-8 text-xs transition disabled:opacity-50"
              >
                {committing ? "מאשר..." : `אישור כל ${matchedCount} השורות המשויכות`}
              </button>
            </div>
          )}

          {!committing && commitTotals && (
            <div className="text-sm mb-3">
              <span className="text-[#4a6b34] font-semibold">{commitTotals.succeeded} שורות אושרו בהצלחה.</span>
              {commitTotals.failed.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {commitTotals.failed.map((f) => (
                    <div key={f.rowId} className="text-wine text-xs">
                      {f.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-white border border-line rounded-xl overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <DonationImportRowCardHeader />
              </thead>
              <tbody>
                {rows.map((row) => (
                  <DonationImportRowCard
                    key={row.id}
                    row={row}
                    source={tab}
                    onChange={(patch) => patchRow(row.id, patch)}
                    onMatched={() => refreshRow(row.id)}
                    defaultExpanded={false}
                  />
                ))}
                {rows.length === 0 && !loading && (
                  <tr>
                    <td colSpan={DONATION_IMPORT_ROW_COLUMN_COUNT} className="p-6 text-center text-ink-soft">
                      אין שורות תואמות.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {rows.length < totalCount && (
            <div className="flex justify-center mt-4">
              <button
                type="button"
                disabled={loadingMore}
                onClick={loadMore}
                className="text-sm text-brass-deep underline disabled:opacity-50"
              >
                {loadingMore ? "טוען..." : `טען עוד (${rows.length} מתוך ${totalCount})`}
              </button>
            </div>
          )}
        </>
      )}

      {showImport && (
        <DonationImportModal
          source={tab}
          onClose={() => setShowImport(false)}
          onDone={() => {
            setShowImport(false);
            loadRows();
          }}
        />
      )}
    </div>
  );
}
