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
  BrainIcon, RobotIcon, ArchiveIcon, SparkIcon, NoteIcon,
} from '../shared/Icons';

const SETTINGS_NAV = [
  { to: '/settings/llm',      label: '服务商配置',   icon: BrainIcon },
  { to: '/settings/agents',    label: '智能体管理',  icon: RobotIcon },
  { to: '/settings/memory',    label: '记忆系统',    icon: SparkIcon },
  { to: '/settings/archived',  label: '归档管理',    icon: ArchiveIcon },
  ...(import.meta.env.DEV ? [{ to: '/settings/database', label: '数据库查看', icon: NoteIcon }] : []),
] as const;

export function SettingsSidebar() {
  const location = useLocation();

  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-r border-border h-screen"
    >
      <SidebarContent className="pt-2">
        <SidebarGroup>
          <SidebarGroupLabel>
            设置
          </SidebarGroupLabel>
          <SidebarMenu>
            {SETTINGS_NAV.map(({ to, label, icon: Icon }) => {
              const isNavActive = location.pathname === to || location.pathname.startsWith(to + '/');
              return (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton
                    asChild
                    tooltip={label}
                    isActive={isNavActive}
                  >
                    <NavLink to={to}>
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
