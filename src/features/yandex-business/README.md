# Yandex Business integration

This module supports two Yandex access modes:

1. Browser session for Playwright automation. This is what the robot uses to add and edit companies in Yandex Business.
2. OAuth token storage for official API requests. This currently reads available business profiles through Yandex Direct `Businesses.get`.

Public Yandex Direct documentation exposes `Businesses.get` for retrieving organization profiles. It does not expose a public method for creating or editing Yandex Business organizations. Until Yandex provides a partner/private API for that operation, creation and updates should stay in the Playwright automation service with saved browser session.

## Required env

```env
OAUTH_TOKEN_ENCRYPTION_KEY="replace-with-a-strong-32-byte-token-encryption-key"
YANDEX_OAUTH_CLIENT_ID=""
YANDEX_OAUTH_CLIENT_SECRET=""
YANDEX_OAUTH_REDIRECT_URI="http://localhost:3000/api/integrations/yandex/callback"
YANDEX_BUSINESS_LOGIN_URL="https://business.yandex.ru/sprav/add"
YANDEX_BUSINESS_STORAGE_STATE="./storage-states/yandex.json"
```

## Save admin browser session

```bash
npm run yandex:login
```

The command opens a visible Chromium window. The admin logs into Yandex manually. After login, pressing Enter in the terminal saves the Playwright storage state to `YANDEX_BUSINESS_STORAGE_STATE`.

## Routes

- `GET /api/integrations/yandex/connect`
- `GET /api/integrations/yandex/callback`
- `GET /api/integrations/yandex/status`
- `GET /api/integrations/yandex/business-profiles`
