import type { ReactNode } from 'react';
import { Bell } from 'lucide-react';
import { logoutAction } from '@/server/actions/auth-actions';
import type { SessionUser } from '@/lib/security/session';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sidebar } from './sidebar';

export function AppShell({
  children,
  user,
  notificationsCount = 0
}: {
  children: ReactNode;
  user: SessionUser;
  notificationsCount?: number;
}) {
  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-line bg-white px-4 lg:px-8">
          <div>
            <p className="text-sm font-semibold text-ink">{user.name}</p>
            <p className="text-xs text-muted">{user.role}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-muted">
              <Bell className="h-4 w-4" />
              <Badge tone={notificationsCount > 0 ? 'warning' : 'neutral'}>{notificationsCount}</Badge>
            </div>
            <form action={logoutAction}>
              <Button variant="secondary" type="submit">
                Выйти
              </Button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
