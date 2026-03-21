import AppSidebar from "@/components/layout/app-sidebar";
import MobileTopbar from "@/components/layout/mobile-topbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-950">
      <AppSidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <MobileTopbar />
        <main className="flex-1 bg-slate-100">
          {children}
        </main>
      </div>
    </div>
  );
}