import Link from 'next/link';
import { Building2, CheckCircle2, Clock, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonClassName } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { branchStats, listBranches } from '@/features/branches/branch-service';
import { listAutomationRuns } from '@/features/automations/automation-service';
import { statusLabel } from '@/features/branches/presenter';
import { providerLabel } from '@/features/automations/provider-label';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [stats, branches, runs] = await Promise.all([
    branchStats(),
    listBranches(),
    listAutomationRuns()
  ]);

  const statCards = [
    { label: 'Филиалы', value: stats.total, icon: Building2, href: '/branches' },
    { label: 'Готовы', value: stats.ready, icon: CheckCircle2, href: '/branches?status=READY' },
    { label: 'В работе', value: stats.inProgress, icon: Clock, href: '/branches?status=IN_PROGRESS' },
    { label: 'Ошибки', value: stats.failed, icon: TriangleAlert, href: '/branches?status=FAILED' }
  ];

  const badgeTone = (status: string): string => {
    if (status === 'DRAFT' || status === 'Черновик') return 'neutral';
    if (status === 'PUBLISHED' || status === 'Опубликован') return 'success';
    if (status === 'FAILED' || status === 'Ошибка') return 'danger';
    if (status === 'IN_PROGRESS' || status === 'В работе') return 'warning';
    return 'neutral';
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Операционный обзор филиалов, автоматизаций и статусов публикации."
        actions={
          <Link className={buttonClassName()} href="/branches/new">
            Создать филиал
          </Link>
        }
      />
      <div className="grid gap-4 md:grid-cols-4">
        {statCards.map((item) => (
          <Link key={item.label} href={item.href} className="block group">
            <Card className="hover:border-violet-500/20 hover:bg-white/7 transition-all duration-300 transform hover:-translate-y-0.5">
              <CardBody className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted group-hover:text-slate-300 transition-colors">{item.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-ink group-hover:text-violet-400 transition-colors">{item.value}</p>
                </div>
                <item.icon className="h-5 w-5 text-brand-600 group-hover:text-violet-500 transition-colors" />
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardBody>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Последние филиалы</h2>
              <Link className="text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors" href="/branches">
                Все
              </Link>
            </div>
            <div className="grid gap-3">
              {branches.slice(0, 5).map((branch) => (
                <Link
                  key={branch.id}
                  href={`/branches/${branch.id}`}
                  className="flex items-center justify-between rounded-md border border-white/10 bg-white/4 p-3 hover:bg-white/7 hover:border-violet-400/20 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{branch.name}</p>
                    <p className="text-xs text-muted">{branch.address}</p>
                  </div>
                  <Badge tone={badgeTone(branch.status)}>{statusLabel(branch.status)}</Badge>
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Автоматизации</h2>
              <Link className="text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors" href="/automations">
                Все
              </Link>
            </div>
            <div className="grid gap-3">
              {runs.slice(0, 5).map((run) => (
                <div key={run.id} className="rounded-md border border-white/10 bg-white/4 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-ink">{providerLabel(run.provider)}</p>
                    <Badge tone="neutral">{run.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">{run.branch.name}</p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
