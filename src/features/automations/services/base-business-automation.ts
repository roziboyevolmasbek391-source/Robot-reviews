import { AutomationStatus, BranchStatus, LogLevel, type Branch } from '@prisma/client';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/db/prisma';
import { createAutomationLog } from '@/features/logs/log-service';
import { createNotification } from '@/features/notifications/notification-service';
import type { AutomationContext } from './types';

/**
 * Base class for all provider-specific browser automations.
 *
 * Improvements over v1:
 * - ESM-safe (no `require()` calls)
 * - Headless mode controlled via PLAYWRIGHT_HEADLESS env
 * - Retry wrapper for flaky steps
 * - Proper DOM-stable waits between wizard steps
 */
export abstract class BaseBusinessAutomation {
  protected abstract providerName: string;
  protected abstract createOrganizationUrl: string;
  protected abstract storageStateEnvKey: string;
  protected keepBrowserOpen = false;

  // ─────────────────────────── Main entry ───────────────────────────

  async run(context: AutomationContext) {
    await this.markStarted(context.runId);

    let browser: Browser | null = null;
    this.keepBrowserOpen = false;

    try {
      const headless = (process.env.PLAYWRIGHT_HEADLESS ?? 'false') === 'true';
      browser = await chromium.launch({
        headless,
        channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined,
      });

      const browserContext = await this.createContext(browser);
      const page = await browserContext.newPage();

      await this.log(context.runId, `Запуск автоматизации ${this.providerName} (headless=${headless})`);
      await this.openCreatePage(page, context.runId);
      await this.fillBranch(page, context);
      const submitResult = await this.submit(page, context.runId);

      if (submitResult === 'waiting-for-user') {
        // Browser stays open; user will confirm later
        return;
      }

      await this.markCompleted(context.runId, context.branch.id);
      await this.log(context.runId, `Автоматизация ${this.providerName} завершена`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown automation error';
      await this.markFailed(context.runId, message);
      throw error;
    } finally {
      if (this.keepBrowserOpen) {
        console.log(`[${this.providerName}] Keeping browser window open for user manual confirmation/interaction.`);
      } else {
        await browser?.close();
      }
    }
  }

  // ─────────────────────── Browser context ──────────────────────────

  protected async createContext(browser: Browser): Promise<BrowserContext> {
    const storageState = process.env[this.storageStateEnvKey];

    if (!storageState) {
      throw new Error(`${this.storageStateEnvKey} is not configured`);
    }

    return browser.newContext({
      storageState,
      viewport: { width: 1440, height: 900 },
      locale: 'ru-RU',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    });
  }

  // ──────────────────── Abstract / overridable ──────────────────────

  protected async openCreatePage(page: Page, runId: string) {
    await this.log(runId, `Открываю страницу: ${this.createOrganizationUrl}`);

    await page.goto(this.createOrganizationUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await this.waitForDomStable(page);
  }

  protected abstract fillBranch(page: Page, context: AutomationContext): Promise<void>;

  protected async submit(page: Page, runId: string): Promise<'submitted' | 'waiting-for-user'> {
    await this.log(runId, 'Отправляю форму');

    const needsConfirmation = await this.hasAnyVisibleText(page, [
      /подтверд/i,
      /verify/i,
      /captcha/i,
      /код/i,
      /confirmation/i,
    ]);

    if (needsConfirmation) {
      await this.pauseForUser(runId, page, 'Площадка запросила ручное подтверждение');
      return 'waiting-for-user';
    }

    return 'submitted';
  }

  protected abstract selectors: {
    name: string;
    category: string;
    address: string;
    latitude: string;
    longitude: string;
    phone: string;
    email: string;
    website: string;
    description: string;
    logoUpload: string;
    photosUpload: string;
    submit: string;
  };

  protected abstract applyWorkingHours(page: Page, workingHours: unknown): Promise<void>;

  // ──────────────────── Retry helper ────────────────────────────────

  /**
   * Retries `fn` up to `maxAttempts` times with a pause between.
   * Useful for steps that may fail due to slow DOM rendering.
   */
  protected async retry<T>(
    runId: string,
    label: string,
    fn: () => Promise<T>,
    maxAttempts = 3,
    delayMs = 500,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const msg = error instanceof Error ? error.message : String(error);
        await this.log(runId, `${label}: попытка ${attempt}/${maxAttempts} не удалась — ${msg}`);

        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, delayMs * attempt));
        }
      }
    }

    throw lastError;
  }

  // ──────────────────── DOM helpers ─────────────────────────────────

  /**
   * Waits until the DOM stops changing (no new mutations for 300ms).
   * Much more reliable than a static waitForTimeout.
   */
  protected async waitForDomStable(page: Page, timeoutMs = 5_000) {
    try {
      await page.waitForFunction(
        () => {
          return new Promise<boolean>((resolve) => {
            let timer: ReturnType<typeof setTimeout>;
            const observer = new MutationObserver(() => {
              clearTimeout(timer);
              timer = setTimeout(() => {
                observer.disconnect();
                resolve(true);
              }, 300);
            });
            observer.observe(document.body, { childList: true, subtree: true });
            timer = setTimeout(() => {
              observer.disconnect();
              resolve(true);
            }, 300);
          });
        },
        undefined,
        { timeout: timeoutMs },
      );
    } catch {
      // Timeout is acceptable — page might already be stable
    }
  }

  protected async hasAnyVisibleText(page: Page, patterns: RegExp[]) {
    for (const pattern of patterns) {
      const visible = await page.getByText(pattern).first().isVisible().catch(() => false);
      if (visible) return true;
    }
    return false;
  }

  // ─────────────────── User confirmation ────────────────────────────

  protected async pauseForUser(runId: string, page: Page, reason: string) {
    this.keepBrowserOpen = true;
    const screenshotPath = await this.captureScreenshot(runId, page, 'confirmation-required');

    const run = await prisma.automationRun.findUnique({
      where: { id: runId },
      select: { requestedByUserId: true },
    });

    await prisma.automationRun.update({
      where: { id: runId },
      data: {
        status: AutomationStatus.WAITING_FOR_USER,
        state: { reason, screenshotPath },
      },
    });

    await createNotification({
      userId: run?.requestedByUserId,
      automationRunId: runId,
      title: 'Требуется подтверждение',
      body: `${this.providerName}: ${reason}`,
    });

    await this.log(runId, `Требуется подтверждение пользователя: ${reason}`, LogLevel.WARN, screenshotPath);
  }

  // ──────────────────── Screenshots ─────────────────────────────────

  protected async captureScreenshot(runId: string, page: Page, label: string) {
    const screenshotDir = process.env.AUTOMATION_SCREENSHOT_DIR ?? './screenshots';
    await mkdir(screenshotDir, { recursive: true });
    const screenshotPath = path.join(screenshotDir, `${runId}-${label}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return screenshotPath;
  }

  // ──────────────────── Logging ─────────────────────────────────────

  protected async log(
    runId: string,
    message: string,
    level: LogLevel = LogLevel.INFO,
    screenshotPath?: string,
  ) {
    console.log(`[${this.providerName}] [${level}] ${message}`);
    await createAutomationLog({
      automationRunId: runId,
      level,
      message,
      screenshotPath,
      metadata: { provider: this.providerName },
    });
  }

  // ──────────────────── Status management ───────────────────────────

  protected async markStarted(runId: string) {
    await prisma.automationRun.update({
      where: { id: runId },
      data: { status: AutomationStatus.RUNNING, startedAt: new Date() },
    });
  }

  protected async markCompleted(runId: string, branchId: string) {
    await prisma.$transaction([
      prisma.automationRun.update({
        where: { id: runId },
        data: { status: AutomationStatus.COMPLETED, finishedAt: new Date() },
      }),
      prisma.branch.update({
        where: { id: branchId },
        data: { status: BranchStatus.PUBLISHED },
      }),
    ]);
  }

  protected async markFailed(runId: string, message: string) {
    await prisma.automationRun.update({
      where: { id: runId },
      data: { status: AutomationStatus.FAILED, finishedAt: new Date() },
    });
    await this.log(runId, message, LogLevel.ERROR);
  }
}
