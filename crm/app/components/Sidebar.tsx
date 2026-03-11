'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import { createClient } from '@/lib/supabase/client';

const NAV = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: '/leads',
    label: 'Leads',
    badge: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: '/pipeline',
    label: 'Pipeline',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0">
        <rect x="3" y="3" width="4" height="18" rx="1" />
        <rect x="10" y="6" width="4" height="15" rx="1" />
        <rect x="17" y="9" width="4" height="12" rx="1" />
      </svg>
    ),
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    href: '/communications',
    label: 'Comms',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: '/appointments',
    label: 'Appointments',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <circle cx="8" cy="16" r="1" fill="currentColor" />
        <circle cx="12" cy="16" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: '/data',
    label: 'Data',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
  },
];

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  onClose?: () => void;
};

export function Sidebar({ collapsed, onToggle, onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [tenantName, setTenantName] = useState<string>('');
  const { badge, markSeen } = useNotifications();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };
  const tenantId = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || 'b50750c7-0a91-4cd4-80fa-8921f974a8ec';

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/tenant/${tenantId}`)
      .then(r => r.json())
      .then(d => setTenantName(d.tenant?.name || ''))
      .catch(() => {});
  }, []);

  // Mark notifications seen when landing on /leads
  useEffect(() => {
    if (pathname.startsWith('/leads')) markSeen();
  }, [pathname, markSeen]);

  const initials = tenantName
    ? tenantName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : 'T';

  const NavItem = ({ item }: { item: typeof NAV[number] }) => {
    const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
    const showBadge = (item as any).badge && badge > 0;
    return (
      <div className="relative group/item">
        <Link
          href={item.href}
          onClick={onClose}
          className={`relative flex items-center gap-3 rounded-xl transition-all duration-150 ${
            collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2.5'
          } ${
            isActive
              ? 'bg-teal-500/10 text-teal-400'
              : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
          }`}
        >
          <span className={`relative ${isActive ? 'text-teal-400' : 'text-slate-500'}`}>
            {item.icon}
            {showBadge && collapsed && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-slate-950" />
            )}
          </span>
          {!collapsed && (
            <span className="text-sm font-medium leading-none flex-1">{item.label}</span>
          )}
          {!collapsed && showBadge && (
            <span className="ml-auto bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0">
              {badge > 9 ? '9+' : badge}
            </span>
          )}
          {!collapsed && !showBadge && isActive && (
            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
          )}
        </Link>
        {/* Tooltip when collapsed */}
        {collapsed && (
          <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover/item:opacity-100 transition-opacity duration-150">
            <div className="bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg border border-slate-700 flex items-center gap-2">
              {item.label}
              {showBadge && <span className="bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{badge}</span>}
              <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800" />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`h-full flex flex-col bg-slate-950 border-r border-slate-800/60 overflow-x-hidden transition-all duration-200 ${collapsed ? 'w-16' : 'w-[220px]'}`}>

      {/* Toggle button row */}
      <div className={`flex items-center border-b border-slate-800/60 shrink-0 ${collapsed ? 'justify-center py-4' : 'justify-end px-3 py-3'}`}>
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 transition-transform duration-200" style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <path d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Section label */}
      {!collapsed && (
        <div className="px-5 pt-4 pb-1 shrink-0">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Menu</p>
        </div>
      )}

      {/* Nav items */}
      <nav className={`flex-1 overflow-y-auto overflow-x-hidden space-y-0.5 py-2 ${collapsed ? 'px-2' : 'px-3'}`}>
        {NAV.map(item => <NavItem key={item.href} item={item} />)}
      </nav>

      {/* Logout button */}
      <div className={`shrink-0 ${collapsed ? 'px-2 pb-1' : 'px-3 pb-1'}`}>
        <div className="relative group/logout">
          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-3 rounded-xl transition-all duration-150 text-slate-500 hover:bg-red-500/10 hover:text-red-400 ${
              collapsed ? 'px-0 py-2 justify-center' : 'px-3 py-2'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            {!collapsed && <span className="text-sm font-medium leading-none">Logout</span>}
          </button>
          {collapsed && (
            <div className="absolute left-full ml-3 bottom-1/2 translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover/logout:opacity-100 transition-opacity duration-150">
              <div className="bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg border border-slate-700">
                Logout
                <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tenant profile button */}
      <div className={`border-t border-slate-800/60 shrink-0 ${collapsed ? 'p-2' : 'p-3'}`}>
        <div className="relative group/tenant">
          <Link
            href="/tenant"
            onClick={onClose}
            className={`flex items-center gap-3 rounded-xl transition-all duration-150 ${
              collapsed ? 'px-0 py-2 justify-center' : 'px-3 py-2.5'
            } ${
              pathname === '/tenant'
                ? 'bg-teal-500/10 text-teal-400'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <div className={`rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shrink-0 font-bold text-white shadow-sm ${collapsed ? 'w-8 h-8 text-xs' : 'w-7 h-7 text-[11px]'}`}>
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-300 truncate leading-none">
                  {tenantName || 'My Business'}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-none">Settings</p>
              </div>
            )}
            {!collapsed && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-slate-600 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            )}
          </Link>
          {collapsed && (
            <div className="absolute left-full ml-3 bottom-1/2 translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover/tenant:opacity-100 transition-opacity duration-150">
              <div className="bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg border border-slate-700">
                {tenantName || 'My Business'} · Settings
                <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
