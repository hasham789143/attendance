'use client';

import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  History,
  MessageSquare,
  Languages,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../providers/auth-provider';
import { Logo } from '../logo';

const adminNavItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/students', icon: Users, label: 'Residents' },
  { href: '/reports', icon: History, label: 'Reports' },
  { href: '/chat', icon: MessageSquare, label: 'Chat' },
  { href: '/translate', icon: Languages, label: 'Translate' },
];

const studentNavItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/history', icon: History, label: 'My History' },
  { href: '/chat', icon: MessageSquare, label: 'Chat' },
  { href: '/translate', icon: Languages, label: 'Translate' },
];

export function MainSidebar({ className, mobile = false }: { className?: string, mobile?: boolean }) {
  const pathname = usePathname();
  const { userProfile } = useAuth();

  const navItems = userProfile?.role === 'admin' ? adminNavItems : studentNavItems;
  
  if (mobile) {
     return (
        <nav className="grid gap-6 text-lg font-medium">
             {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground',
                  { 'text-foreground': pathname === item.href }
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            ))}
        </nav>
     )
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-14 flex-col border-r bg-background sm:flex">
        <nav className="flex flex-col items-center gap-4 px-2 sm:py-5">
            <Link
                href="#"
                className="group flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full bg-primary text-lg font-semibold text-primary-foreground md:h-8 md:w-8 md:text-base"
                >
                <Logo />
                <span className="sr-only">Hostel Guardian</span>
            </Link>
            {navItems.map(item => (
                <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8",
                        { 'bg-accent text-accent-foreground': pathname.startsWith(item.href) }
                    )}
                    >
                    <item.icon className="h-5 w-5" />
                    <span className="sr-only">{item.label}</span>
                </Link>
            ))}
        </nav>
    </aside>
  );
}
