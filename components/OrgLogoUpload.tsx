"use client";

import { useRef, useState } from "react";
import { uploadOrgLogo } from "@/app/(app)/settings/branding-actions";

export default function OrgLogoUpload({ logoUrl }: { logoUrl: string | null }) {
  const [preview, setPreview] = useState<string | null>(logoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.set("logo", file);
    const res = await uploadOrgLogo(fd);
    setUploading(false);
    if (!res.ok) {
      setError(res.error ?? "שגיאה בהעלאת הלוגו");
      return;
    }
    setPreview(URL.createObjectURL(file));
  }

  return (
    <div className="flex items-center gap-4">
      <div className="w-20 h-20 rounded-lg border border-line bg-parchment flex items-center justify-center overflow-hidden">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="לוגו הארגון" className="w-full h-full object-contain" />
        ) : (
          <span className="text-xs text-ink-soft">אין לוגו</span>
        )}
      </div>
      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="border border-line rounded-lg px-3 py-1.5 text-sm hover:bg-parchment disabled:opacity-50"
        >
          {uploading ? "מעלה..." : "העלאת לוגו"}
        </button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
        {error && <p className="text-xs text-wine mt-1">{error}</p>}
      </div>
    </div>
  );
}
