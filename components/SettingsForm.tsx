"use client";

import { createContext, useContext, useState } from "react";
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

  async function handleAction(formData: FormData) {
    await action(formData);
    setDirty(false);
    setToastTrigger((t) => t + 1);
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
