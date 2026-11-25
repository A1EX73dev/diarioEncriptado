import { SettingsNav } from "@/components/settings/SettingsNav";

export default function SettingsLayout({ children }: LayoutProps<"/ajustes">) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <SettingsNav />
      {children}
    </div>
  );
}
