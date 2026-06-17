import Link from 'next/link';
import { Bot, Building2, Gauge, History, KeyRound, ListChecks, Settings } from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Gauge },
  { href: '/branches', label: 'Branches', icon: Building2 },
  { href: '/automations', label: 'Automations', icon: ListChecks },
  { href: '/logs', label: 'Logs', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings }
];

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-line bg-white lg:block">
      <div className="flex h-16 items-center gap-2 border-b border-line px-5">
        <Bot className="h-6 w-6 text-brand-600" />
        <span className="text-base font-semibold">Branch AI</span>
      </div>
      <nav className="grid gap-1 p-3">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted hover:bg-surface hover:text-ink"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-4 border-t border-line p-3 text-xs text-muted">
        <div className="flex items-center gap-2 rounded-md bg-surface p-3">
          <KeyRound className="h-4 w-4" />
          JWT + RBAC
        </div>
      </div>
    </aside>
  );
}
