import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { getSession } from '@/lib/security/session';
import { YandexIntegrationPanel } from '@/features/yandex-business/yandex-integration-panel';
import { GoogleIntegrationPanel } from '@/features/google-business/google-integration-panel';
import { TwoGISIntegrationPanel } from '@/features/twogis-business/twogis-integration-panel';

const settings = [
  'DATABASE_URL',
  'JWT_SECRET',
  'OPENAI_API_KEY',
  'YANDEX_OAUTH_CLIENT_ID',
  'YANDEX_OAUTH_CLIENT_SECRET',
  'YANDEX_OAUTH_REDIRECT_URI',
  'OAUTH_TOKEN_ENCRYPTION_KEY',
  'GOOGLE_BUSINESS_STORAGE_STATE',
  'YANDEX_BUSINESS_STORAGE_STATE',
  'TWOGIS_STORAGE_STATE',
  'AUTOMATION_SCREENSHOT_DIR'
];

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await getSession();

  return (
    <>
      <PageHeader title="Settings" description="Окружение, роли и состояние интеграций." />
      <div className="grid gap-6">
        <YandexIntegrationPanel />
        <GoogleIntegrationPanel />
        <TwoGISIntegrationPanel />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="mb-4 text-base font-semibold text-ink">Текущий пользователь</h2>
            <div className="grid gap-2 text-sm">
              <p>{session?.name}</p>
              <p className="text-muted">{session?.email}</p>
              <Badge>{session?.role}</Badge>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="mb-4 text-base font-semibold text-ink">Переменные окружения</h2>
            <div className="grid gap-2">
              {settings.map((key) => (
                <div key={key} className="flex items-center justify-between rounded-md border border-line p-3">
                  <span className="text-sm text-ink">{key}</span>
                  <Badge tone={process.env[key] ? 'success' : 'warning'}>
                    {process.env[key] ? 'задано' : 'не задано'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
