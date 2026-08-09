// כלי בדיקה בלבד - "מזייף" לקוח Supabase כדי לבדוק את לוגיקת הכסף (חישובים, המרות
// מטבע, אגרגציה) בלי להתחבר למסד נתונים אמיתי. הוא לא ממש מיישם סמנטיקת סינון של
// Postgrest (eq/neq/is/not/in) - כל קריאה ל-.from(table) פשוט מחזירה את התוצאה
// הבאה שהוזנה עבור אותה טבלה (seed), בסדר שבו טבלה זו נקראת בקוד הנבדק. סינון
// נכון הוא תפקידה של Postgres (ואוכף גם ע"י CHECK constraints), לא תפקיד הבדיקות
// האלה. כדי לתפוס רגרסיה של "שכחתי פילטר" (למשל הסרת .is('deleted_at', null)),
// כל קריאה נרשמת במערך `calls` כדי שאפשר יהיה להצהיר עליה בנפרד.

export type FakeResult<T = unknown> = { data: T; error: { message: string; code?: string } | null };

export type FakeCall = { table: string; method: string; args: unknown[] };

export type FakeSupabaseSeed = Record<string, FakeResult | FakeResult[]>;

// כל בונה שאילתה הוא thenable (יש לו .then) בדיוק כמו הבונה האמיתי של Supabase JS,
// כך שקוד הייצור שעושה `await supabase.from(...).select(...).eq(...)` עובד ללא שינוי
function createBuilder(table: string, calls: FakeCall[], nextResult: (table: string) => FakeResult) {
  const record = (method: string, args: unknown[]) => {
    calls.push({ table, method, args });
    return builder;
  };

  const builder: Record<string, unknown> = {
    select: (...args: unknown[]) => record("select", args),
    eq: (...args: unknown[]) => record("eq", args),
    neq: (...args: unknown[]) => record("neq", args),
    is: (...args: unknown[]) => record("is", args),
    not: (...args: unknown[]) => record("not", args),
    in: (...args: unknown[]) => record("in", args),
    order: (...args: unknown[]) => record("order", args),
    insert: (payload: unknown) => record("insert", [payload]),
    update: (payload: unknown) => record("update", [payload]),
    delete: () => record("delete", []),
    single: () => record("single", []),
    maybeSingle: () => record("maybeSingle", []),
    then: (onFulfilled: (r: FakeResult) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(nextResult(table)).then(onFulfilled, onRejected),
  };
  return builder;
}

export function createFakeSupabase(seeds: FakeSupabaseSeed = {}) {
  const calls: FakeCall[] = [];
  const queues = new Map<string, FakeResult[]>();
  for (const [table, value] of Object.entries(seeds)) {
    queues.set(table, Array.isArray(value) ? [...value] : [value]);
  }

  function nextResult(table: string): FakeResult {
    const queue = queues.get(table);
    if (!queue || queue.length === 0) return { data: null, error: null };
    // כשנשאר פריט אחד בלבד, ממשיכים להחזיר אותו שוב לכל קריאה נוספת (לא "נגמר" הזיוף)
    return queue.length > 1 ? queue.shift()! : queue[0];
  }

  return {
    calls,
    from: (table: string) => createBuilder(table, calls, nextResult),
  };
}

export type FakeSupabaseClient = ReturnType<typeof createFakeSupabase>;
