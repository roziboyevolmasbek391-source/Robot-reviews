import { AutomationProvider } from "@prisma/client";

export interface ProviderAuthState {
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  storageState?: string;
  browserProfilePath?: string;
  metadata?: Record<string, any>;
}

export interface PublishBusinessData {
  name: string;
  category: string;
  description?: string;
  phone?: string;
  website?: string;
  email?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  workingHours?: Record<string, any>;
  photos?: string[];
  logo?: string;
  [key: string]: any;
}

export interface PublishResult {
  success: boolean;
  provider: AutomationProvider;
  message: string;
  error?: string;
  screenshot?: string;
  logs?: string;
}

export interface SessionValidationResult {
  valid: boolean;
  needsReconnect: boolean;
  reason?: string;
}

export interface VerificationStep {
  provider: AutomationProvider;
  step: string;
  code?: string;
}

export interface ProviderAdapter {
  // Connection
  connect(callbackUrl: string): Promise<string>;
  handleCallback(code: string, state: string): Promise<ProviderAuthState>;

  // Session Management
  validateSession(authState: ProviderAuthState): Promise<SessionValidationResult>;
  refreshSession(authState: ProviderAuthState): Promise<ProviderAuthState>;
  reconnect(authState: ProviderAuthState, callbackUrl: string): Promise<string>;

  // Publishing
  publishBusiness(data: PublishBusinessData, authState: ProviderAuthState): Promise<PublishResult>;
  resumeAfterVerification(
    verificationCode: string,
    authState: ProviderAuthState
  ): Promise<PublishResult>;

  // Status
  getStatus(authState: ProviderAuthState): Promise<Record<string, any>>;
}
