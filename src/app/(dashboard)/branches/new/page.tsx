import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { BranchForm } from '@/features/branches/branch-form';

export default function NewBranchPage() {
  return (
    <>
      <PageHeader title="Новый филиал" description="Заполните данные для карточек Google, Яндекс и 2ГИС." />
      <Card>
        <CardBody>
          <BranchForm />
        </CardBody>
      </Card>
    </>
  );
}
