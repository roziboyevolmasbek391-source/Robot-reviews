import { PageHeader } from '@/components/layout/page-header';
import { listBranches } from '@/features/branches/branch-service';
import { listAutomationRuns } from '@/features/automations/automation-service';
import { AutomationStartForm } from '@/features/automations/automation-start-form';
import { AutomationRunCard } from '@/features/automations/automation-run-card';

export const dynamic = 'force-dynamic';

export default async function AutomationsPage() {
  const [branches, runs] = await Promise.all([listBranches(), listAutomationRuns()]);
  const branchOptions = branches.map((branch) => ({
    id: branch.id,
    name: branch.name
  }));

  // Serialize to avoid passing Date objects from Server to Client component
  const serializedRuns = JSON.parse(JSON.stringify(runs));

  return (
    <>
      <PageHeader title="Automations" description="Запуск и мониторинг публикаций на внешних площадках." />
      <AutomationStartForm branches={branchOptions} />
      <div className="mt-6 grid gap-4">
        {serializedRuns.map((run: any) => (
          <AutomationRunCard key={run.id} run={run} />
        ))}
      </div>
    </>
  );
}
