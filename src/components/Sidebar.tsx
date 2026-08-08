import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, LogOut, X } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { auth } from '../firebase';
import { useUser } from '../contexts/UserContext';
import { useCommunication } from '../contexts/CommunicationContext';
import { canSeeNavigationItem, osNavigationGroups } from '../config/osNavigation';
import logoText from '../assets/logo-compact.png';

const storageKey = 'replofy-os-sidebar-groups';

export function Sidebar({ mobileOpen, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const { userProfile } = useUser();
  const { totalUnreadMessages } = useCommunication();
  const location = useLocation();
  const visibleGroups = useMemo(() => osNavigationGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => canSeeNavigationItem(item, userProfile.role)) }))
    .filter((group) => group.items.length > 0), [userProfile.role]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) return JSON.parse(stored) as Record<string, boolean>;
    } catch {
      return {};
    }
    return { workspace: true, operators: true, 'content-growth': true };
  });

  useEffect(() => {
    const activeGroup = visibleGroups.find((group) =>
      group.items.some((item) => location.pathname === item.path || (!item.end && location.pathname.startsWith(`${item.path}/`))),
    );
    if (!activeGroup) return;
    setOpenGroups((current) => current[activeGroup.id] ? current : { ...current, [activeGroup.id]: true });
  }, [location.pathname, visibleGroups]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(openGroups));
  }, [openGroups]);

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-zinc-950/20 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-zinc-200 bg-white transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-5">
          <Link to="/" onClick={onClose} className="inline-flex items-center gap-3 rounded-xl transition hover:opacity-75">
            <img src={logoText} alt="Replofy" className="h-9 w-auto shrink-0" />
            <span className="rounded-full bg-zinc-950 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-white">
              OS
            </span>
          </Link>
          <button className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 md:hidden" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-4">
            {visibleGroups.map((group) => {
              const isOpen = openGroups[group.id] ?? false;
              return (
                <section key={group.id}>
                  <button
                    onClick={() => setOpenGroups((current) => ({ ...current, [group.id]: !isOpen }))}
                    className="mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600"
                  >
                    <span>{group.label}</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
                  </button>
                  {isOpen && (
                    <div className="space-y-1">
                      {group.items.map((item) => (
                        <NavLink
                          key={item.label}
                          to={item.path}
                          end={item.end}
                          onClick={onClose}
                          className={({ isActive }) =>
                            `flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold transition-all duration-100 ${
                              isActive
                                ? 'bg-zinc-950 text-white'
                                : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
                            }`
                          }
                        >
                          {({ isActive }) => (
                            <>
                              <item.icon strokeWidth={isActive ? 2 : 1.5} className="h-4 w-4 shrink-0" />
                              <span className="min-w-0 flex-1 truncate">{item.label}</span>
                              {item.path === '/team-chat' && totalUnreadMessages > 0 && (
                                <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black ${
                                  isActive ? 'bg-white text-zinc-950' : 'bg-red-500 text-white'
                                }`}>
                                  {totalUnreadMessages > 99 ? '99+' : totalUnreadMessages}
                                </span>
                              )}
                            </>
                          )}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <div className="mt-6 rounded-lg border border-zinc-100 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-zinc-500">Quick jump</span>
              <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-400">
                Ctrl K
              </kbd>
            </div>
          </div>
        </nav>

        <div className="border-t border-zinc-100 px-3 py-3">
          <button
            onClick={() => auth.signOut()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold text-zinc-500 transition-all duration-100 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
