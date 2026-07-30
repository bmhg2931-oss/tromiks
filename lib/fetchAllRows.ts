// מנוע ה-DB (PostgREST) מגביל כל בקשה בודדת ל-1000 שורות בברירת המחדל, ללא קשר ל-.limit()
// המבוקש; לכן שולפים בעמודים של 1000 עד שמתקבל עמוד חלקי (מציין שהגענו לסוף)
export async function fetchAllRows<T>(
  buildQuery: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }> & { range: (from: number, to: number) => any }
): Promise<{ data: T[]; error: { message: string } | null }> {
  const PAGE_SIZE = 1000;
  const all: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
    if (error) return { data: all, error };
    all.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { data: all, error: null };
}
