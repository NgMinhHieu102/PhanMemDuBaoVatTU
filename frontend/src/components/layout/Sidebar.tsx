import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  TrendingUp,
  Bell,
  Activity,
  FileBarChart,
  Settings,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
} from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { ROUTES, APP_NAME } from '../../utils/constants';
import { cn } from '../../utils/cn';

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: ROUTES.DASHBOARD, icon: LayoutDashboard },
  { label: 'Tồn kho', path: ROUTES.INVENTORY, icon: Package },
  { label: 'Dự báo', path: ROUTES.FORECASTING, icon: TrendingUp },
  { label: 'Cảnh báo', path: ROUTES.ALERTS, icon: Bell },
  { label: 'Dịch tễ học', path: ROUTES.EPIDEMIOLOGY, icon: Activity },
  { label: 'Báo cáo', path: ROUTES.REPORTS, icon: FileBarChart },
  { label: 'Cài đặt', path: ROUTES.SETTINGS, icon: Settings, adminOnly: true },
];

export default function Sidebar() {
  const { isSidebarCollapsed, toggleSidebarCollapsed } = useUIStore();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'Administrator';

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-neutral-900 text-white transition-all duration-300 ease-in-out',
        isSidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-neutral-700 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 bg-primary-600 rounded-lg shrink-0">
            <Stethoscope size={18} className="text-white" />
          </div>
          {!isSidebarCollapsed && (
            <span className="font-bold text-sm truncate">{APP_NAME}</span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        <ul className="space-y-1">
          {navItems.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                title={isSidebarCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-neutral-400 hover:bg-neutral-800 hover:text-white',
                    isSidebarCollapsed && 'justify-center px-2'
                  )
                }
              >
                <item.icon size={18} className="shrink-0" />
                {!isSidebarCollapsed && (
                  <span className="truncate">{item.label}</span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-neutral-700 shrink-0">
        <button
          onClick={toggleSidebarCollapsed}
          className="flex items-center justify-center w-full p-2 rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
          title={isSidebarCollapsed ? 'Mở rộng' : 'Thu gọn'}
        >
          {isSidebarCollapsed ? (
            <ChevronRight size={18} />
          ) : (
            <div className="flex items-center gap-2 w-full">
              <ChevronLeft size={18} />
              <span className="text-sm">Thu gọn</span>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}
