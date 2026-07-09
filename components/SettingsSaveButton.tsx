"use client";

import { useFormStatus } from "react-dom";
import { useSettingsDirty } from "./SettingsForm";

export default function SettingsSaveButton({
  label = "שמירה",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const dirty = useSettingsDirty();

  return (
    <button
      type="submit"
      disabled={!dirty || pending}
      className={
        className ??
        "bg-brass hover:bg-brass-deep text-white font-semibold rounded-lg px-5 py-2 text-sm transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-brass"
      }
    >
      {pending ? "שומר..." : label}
    </button>
  );
}
