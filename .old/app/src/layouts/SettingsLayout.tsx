import { Outlet, useNavigate } from 'react-router-dom';
import { SettingsSidebar } from '../components/business/navigation/SettingsSidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '../components/ui/sidebar';
import { ArrowLeftIcon } from '../components/business/shared/Icons';

export function SettingsLayout() {
  const navigate = useNavigate();

  return (
    <SidebarProvider defaultOpen={true} className="flex-1 min-w-0 !w-auto" style={{ '--sidebar-width': '14rem' } as React.CSSProperties}>
      <SettingsSidebar />
      <SidebarInset className="bg-background text-foreground h-screen overflow-hidden flex flex-col min-w-0">
        <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border px-6 py-3 flex items-center gap-3 flex-shrink-0">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground hover:bg-accent flex-shrink-0" />
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer border-0 bg-transparent flex items-center gap-1"
          >
            <ArrowLeftIcon />
            返回
          </button>
          <h1 className="text-lg text-foreground leading-none">
            设置
          </h1>
        </header>
        <div className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
