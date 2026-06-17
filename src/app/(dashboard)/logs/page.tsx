import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { listAutomationLogs } from '@/features/logs/log-service';
import { providerLabel } from '@/features/automations/provider-label';

export const dynamic = 'force-dynamic';

export default async function LogsPage() {
  const logs = await listAutomationLogs();

  return (
    <>
      <PageHeader title="Logs" description="Действия автоматизаций, ошибки и скриншоты проблем." />
      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/4 backdrop-blur-sm">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase text-slate-400 border-b border-white/8">
            <tr>
              <th className="px-4 py-3">Время</th>
              <th className="px-4 py-3">Площадка</th>
              <th className="px-4 py-3">Филиал</th>
              <th className="px-4 py-3">Уровень</th>
              <th className="px-4 py-3">Сообщение</th>
              <th className="px-4 py-3">Скриншот</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-white/6 hover:bg-white/4 transition-colors">
                <td className="px-4 py-3 text-muted">{log.createdAt.toLocaleString('ru-RU')}</td>
                <td className="px-4 py-3">{providerLabel(log.automationRun.provider)}</td>
                <td className="px-4 py-3">{log.automationRun.branch.name}</td>
                <td className="px-4 py-3">
                  <Badge tone={log.level === 'ERROR' ? 'danger' : log.level === 'WARN' ? 'warning' : 'neutral'}>
                    {log.level}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-slate-200">{log.message}</td>
                <td className="px-4 py-3 text-muted">{log.screenshotPath ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
