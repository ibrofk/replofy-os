import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Bug,
  CheckCheck,
  CircleAlert,
  ListChecks,
  MessageSquare,
  Route,
  TrendingUp,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCommunication } from '../contexts/CommunicationContext';
import type { WorkspaceNotification } from '../types';

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  const elapsed = Date.now() - timestamp;
  if (Number.isNaN(timestamp)) return '';
  if (elapsed < 60_000) return 'Now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h`;
  if (elapsed < 604_800_000) return `${Math.floor(elapsed / 86_400_000)}d`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function NotificationIcon({ type }: { type: WorkspaceNotification['type'] }) {
  const className = 'h-4 w-4';
  if (type === 'message') return <MessageSquare className={className} />;
  if (type === 'task') return <ListChecks className={className} />;
  if (type === 'bug') return <Bug className={className} />;
  if (type === 'roadmap') return <Route className={className} />;
  if (type === 'lead') return <TrendingUp className={className} />;
  return <CircleAlert className={className} />;
}

export function NotificationBell({ className = '' }: { className?: string }) {
  const navigate = useNavigate();
  const {
    notifications,
    unreadNotificationCount,
    markNotificationsRead,
  } = useCommunication();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const openNotification = async (notification: WorkspaceNotification) => {
    setIsOpen(false);
    try {
      if (notification.isUnread) {
        await markNotificationsRead();
      }
    } finally {
      navigate(notification.href);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`}
        aria-expanded={isOpen}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm transition hover:border-zinc-300 hover:text-zinc-950"
      >
        <Bell className="h-4.5 w-4.5" />
        {unreadNotificationCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-5 h-5 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-black leading-none text-white">
            {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 z-[80] w-[min(92vw,380px)] overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl shadow-zinc-950/15">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <div>
              <p className="text-sm font-black text-zinc-950">Notifications</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {unreadNotificationCount > 0
                  ? `${unreadNotificationCount} new update${unreadNotificationCount === 1 ? '' : 's'}`
                  : 'You are caught up'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {unreadNotificationCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markNotificationsRead().catch((error) => {
                    console.warn('Unable to mark notifications as read.', error);
                  })}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark read
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close notifications"
                className="rounded-full p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-950"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[min(65vh,520px)] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Bell className="mx-auto h-7 w-7 text-zinc-300" />
                <p className="mt-3 text-sm font-semibold text-zinc-700">No notifications yet</p>
                <p className="mt-1 text-xs text-zinc-400">New team and operations updates will appear here.</p>
              </div>
            ) : (
              notifications.slice(0, 16).map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void openNotification(notification)}
                  className={`flex w-full items-start gap-3 border-b border-zinc-100 px-5 py-4 text-left transition last:border-b-0 hover:bg-zinc-50 ${
                    notification.isUnread ? 'bg-red-50/40' : 'bg-white'
                  }`}
                >
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    notification.isUnread
                      ? 'bg-red-100 text-red-600'
                      : 'bg-zinc-100 text-zinc-500'
                  }`}>
                    <NotificationIcon type={notification.type} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-3">
                      <span className={`text-sm ${notification.isUnread ? 'font-black text-zinc-950' : 'font-semibold text-zinc-700'}`}>
                        {notification.title}
                      </span>
                      <span className="shrink-0 text-[10px] font-bold text-zinc-400">
                        {formatRelativeTime(notification.createdAt)}
                      </span>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs leading-5 text-zinc-500">
                      {notification.body}
                    </span>
                  </span>
                  {notification.isUnread && <span className="mt-3 h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
