'use client';

import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  History,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../providers/auth-provider';
import { Logo } from '../logo';

const adminNavItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/students', icon: Users, label: 'Students' },
];

const studentNavItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/history', icon: History, label: 'My History' },
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
    <div className={cn('hidden border-r bg-muted/40 md:block', className)}>
      <div className="flex h-full max-h-screen flex-col gap-2">
        <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
          <Logo />
        </div>
        <div className="flex-1">
          <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
                  {
                    'bg-muted text-primary': pathname === item.href,
                  }
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
