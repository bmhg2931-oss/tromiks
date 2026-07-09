import SettingsSidebar from "@/components/SettingsSidebar";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-serif text-2xl font-bold mb-5">הגדרות מערכת</h1>
      <SettingsSidebar>{children}</SettingsSidebar>
    </div>
  );
}
