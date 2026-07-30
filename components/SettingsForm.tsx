"use client";

import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import SaveToast from "./SaveToast";

const DirtyContext = createContext(false);
export function useSettingsDirty() {
  return useContext(DirtyContext);
}

export default function SettingsForm({
  action,
  children,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
  className?: string;
}) {
  const [dirty, setDirty] = useState(false);
  const [toastTrigger, setToastTrigger] = useState(0);
  const router = useRouter();

  async function handleAction(formData: FormData) {
    await action(formData);
    setDirty(false);
    setToastTrigger((t) => t + 1);
    // מוודא שהעמוד מציג את הנתונים המעודכנים מהשרת מיד אחרי השמירה (ולא ערכים
    // ישנים/ריקים שנשארו מרינדור קודם) - revalidatePath לבדו לא תמיד מספיק כדי
    // לרענן קומפוננטת שרת שכבר נטענה בדף הנוכחי
    router.refresh();
  }

  return (
    <DirtyContext.Provider value={dirty}>
      <form action={handleAction} onChange={() => setDirty(true)} className={className}>
        {children}
      </form>
      <SaveToast trigger={toastTrigger} />
    </DirtyContext.Provider>
  );
}
