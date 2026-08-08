import {
  Bot,
  BookOpen,
  BriefcaseBusiness,
  Bug,
  FilePenLine,
  Home,
  LayoutGrid,
  MessageSquare,
  Newspaper,
  Palette,
  Settings2,
  ShieldCheck,
  TrendingUp,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '../types';

export type OsNavigationItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  roles?: UserRole[];
  end?: boolean;
};

export type OsNavigationGroup = {
  id: 'workspace' | 'operators' | 'content-growth' | 'system' | 'admin';
  label: string;
  items: OsNavigationItem[];
};

const adminRoles: UserRole[] = ['admin', 'master-admin'];
const masterOnly: UserRole[] = ['master-admin'];

export const osNavigationGroups: OsNavigationGroup[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { icon: ShieldCheck, label: 'Command Center', path: '/command-center' },
      { icon: Home, label: 'Home', path: '/', end: true },
      { icon: Wrench, label: 'Tasks', path: '/tasks' },
      { icon: MessageSquare, label: 'Team Chat', path: '/team-chat' },
      { icon: Users, label: 'Team', path: '/team' },
    ],
  },
  {
    id: 'operators',
    label: 'Operators',
    items: [
      { icon: Bot, label: 'Operator Desks', path: '/operator-desks' },
      { icon: BookOpen, label: 'Execution', path: '/execution' },
    ],
  },
  {
    id: 'content-growth',
    label: 'Content & Growth',
    items: [
      { icon: LayoutGrid, label: 'Docs', path: '/content' },
      { icon: Newspaper, label: 'Blogs Hub', path: '/blogs' },
      { icon: Palette, label: 'Creative Hub', path: '/creative-hub' },
      { icon: FilePenLine, label: 'Business Plan', path: '/business-plan' },
      { icon: TrendingUp, label: 'Growth Pipeline', path: '/growth' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { icon: BriefcaseBusiness, label: 'Systems', path: '/systems', roles: adminRoles },
      { icon: Bug, label: 'Technical Studio', path: '/technical-studio', roles: masterOnly },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    items: [
      { icon: Settings2, label: 'Settings', path: '/settings', roles: adminRoles },
    ],
  },
];

export function canSeeNavigationItem(item: OsNavigationItem, role: UserRole) {
  return !item.roles || item.roles.includes(role);
}
