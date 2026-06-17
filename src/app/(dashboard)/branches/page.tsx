import Link from 'next/link';
import { Plus, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonClassName } from '@/components/ui/button';
import { ChatPanel } from '@/features/chat/chat-panel';
import { listBranches } from '@/features/branches/branch-service';
import { formatBranchCoordinates, statusLabel } from '@/features/branches/presenter';

export const dynamic = 'force-dynamic';

function badgeTone(status: string): 'neutral' | 'success' | 'danger' | 'warning' {
  if (status === 'PUBLISHED') return 'success';
  if (status === 'FAILED') return 'danger';
  if (status === 'IN_PROGRESS' || status === 'NEEDS_CONFIRMATION') return 'warning';
  return 'neutral';
}

export default async function BranchesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const allBranches = await listBranches();
  
  const branches = status
    ? allBranches.filter((branch) => branch.status === status)
    : allBranches;

  return (
    <>
      <PageHeader
        title="Branches"
        description="Создание, редактирование и подготовка филиалов к публикации."
        actions={
          <Link className={buttonClassName()} href="/branches/new">
            <Plus className="h-4 w-4" />
            Создать
          </Link>
        }
      />
      <ChatPanel />

      {status && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-violet-500/20 bg-violet-500/5 px-4 py-2.5 text-sm text-slate-300">
          <div className="flex items-center gap-2">
            <span>Показаны филиалы со статусом:</span>
            <Badge tone={badgeTone(status)}>{statusLabel(status)}</Badge>
          </div>
          <Link
            href="/branches"
            className="flex items-center gap-1 text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Сбросить фильтр
          </Link>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-white/4 backdrop-blur-sm">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase text-slate-400 border-b border-white/8">
            <tr>
              <th className="px-4 py-3">Название</th>
              <th className="px-4 py-3">Категория</th>
              <th className="px-4 py-3">Адрес</th>
              <th className="px-4 py-3">Координаты</th>
              <th className="px-4 py-3">Статус</th>
            </tr>
          </thead>
          <tbody>
            {branches.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {status ? `Нет филиалов со статусом "${statusLabel(status)}"` : 'Нет созданных филиалов'}
                </td>
              </tr>
            ) : (
              branches.map((branch) => (
                <tr key={branch.id} className="border-t border-white/6 hover:bg-white/4 transition-colors">
                  <td className="px-4 py-3">
                    <Link className="font-medium text-violet-400 hover:text-violet-300" href={`/branches/${branch.id}`}>
                      {branch.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{branch.category}</td>
                  <td className="px-4 py-3 text-muted">{branch.address}</td>
                  <td className="px-4 py-3 text-muted">{formatBranchCoordinates(branch)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={badgeTone(branch.status)}>{statusLabel(branch.status)}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
