import { NavLink, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '../../ui/sidebar';
import {
  ChevronRightIcon,
  OverviewIcon, WorldIcon, OutlineIcon, WritingIcon, ReviewIcon, ReadingIcon, ChatIcon,
} from '../shared/Icons';

const WORKSPACE_NAV = [
  { to: 'overview', label: '概览',     icon: OverviewIcon },
  { to: 'world',    label: '世界设定', icon: WorldIcon },
  { to: 'outline',  label: '提纲',     icon: OutlineIcon },
  { to: 'writing',  label: '写作',     icon: WritingIcon },
  { to: 'review',   label: '审阅',     icon: ReviewIcon },
  { to: 'reading',  label: '阅读',     icon: ReadingIcon },
  { to: 'chat',     label: 'AI 对话',  icon: ChatIcon },
] as const;

type WorkspaceSidebarProps = {
  bookId: string;
};

export function WorkspaceSidebar({ bookId }: WorkspaceSidebarProps) {
  const location = useLocation();

  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-r border-border h-screen"
    >
      <SidebarContent className="pt-2">
        <SidebarGroup>
          <SidebarGroupLabel>
            工作台
          </SidebarGroupLabel>
          <SidebarMenu>
            {WORKSPACE_NAV.map(({ to, label, icon: Icon }) => {
              const fullPath = `/books/${bookId}/${to}`;
              const isNavActive = location.pathname === fullPath || location.pathname.startsWith(fullPath + '/');
              return (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton
                    asChild
                    tooltip={label}
                    isActive={isNavActive}
                  >
                    <NavLink to={fullPath}>
                      <Icon />
                      <span>{label}</span>
                      {isNavActive && (
                        <span className="ml-auto text-muted-foreground">
                          <ChevronRightIcon />
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
