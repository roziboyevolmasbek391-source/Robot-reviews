import { notFound } from 'next/navigation';
import { AutomationProvider } from '@prisma/client';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { BranchForm } from '@/features/branches/branch-form';
import { getBranch } from '@/features/branches/branch-service';
import { statusLabel } from '@/features/branches/presenter';
import { DeleteBranchButton } from '@/features/branches/delete-branch-button';
import { AutomationStartForm } from '@/features/automations/automation-start-form';
import { BranchPlatformsStatus } from '@/features/branches/branch-platforms-status';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BranchDetailsPage({ params }: PageProps) {
  const { id } = await params;
  const branch = await getBranch(id);

  if (!branch) {
    notFound();
  }

  const branchFormRecord = {
    id: branch.id,
    name: branch.name,
    category: branch.category || "",
    address: branch.address,
    latitude: Number(branch.latitude),
    longitude: Number(branch.longitude),
    phone: branch.phone || "",
    email: branch.email || "",
    website: branch.website || "",
    description: branch.description || "",
    workingHours: branch.workingHours,
    photos: branch.photos,
    logo: branch.logo,
    status: branch.status
  };

  return (
    <>
      <PageHeader
        title={branch.name}
        description={branch.address}
        actions={
          <>
            <Badge>{statusLabel(branch.status)}</Badge>
            <DeleteBranchButton branchId={branch.id} />
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-ink">Данные филиала</h2>
          </CardHeader>
          <CardBody>
            <BranchForm branch={branchFormRecord} />
          </CardBody>
        </Card>
        <div className="grid content-start gap-6">
          <AutomationStartForm branches={[{ id: branch.id, name: branch.name }]} />
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-ink">История</h2>
            </CardHeader>
            <CardBody className="grid gap-3">
              {branch.history.map((entry) => (
                <div key={entry.id} className="rounded-md border border-line p-3">
                  <p className="text-sm font-medium text-ink">{entry.action}</p>
                  <p className="text-xs text-muted">
                    {entry.createdAt.toLocaleString('ru-RU')} {entry.user ? `- ${entry.user.name}` : ''}
                  </p>
                </div>
              ))}
            </CardBody>
          </Card>
          <BranchPlatformsStatus branchId={branch.id} initialRuns={branch.automationRuns} />
        </div>
      </div>
    </>
  );
}
