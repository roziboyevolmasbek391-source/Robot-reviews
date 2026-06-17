import { existsSync } from 'fs';
import path from 'path';
import type { Branch } from '@prisma/client';
import type { Locator, Page } from 'playwright';
import { AutomationStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { BaseBusinessAutomation } from './base-business-automation';
import type { AutomationContext } from './types';

/**
 * 2GIS Partner Cabinet automation — fills the wizard at
 * https://account.2gis.com/add-organization to create a new business listing.
 *
 * Implemented to match YandexBusinessAutomation quality:
 * - ESM-safe (no `require()`)
 * - Retry wrapper on every step
 * - DOM-stable waits between wizard pages
 * - Autocomplete suggestion selecting for Address and Category
 * - Working hours formatting & filling
 * - Proper SMS/verification code resumption via DB polling
 * - Configurable headless mode
 */
export class TwoGISAutomation extends BaseBusinessAutomation {
  protected providerName = '2ГИС';
  protected createOrganizationUrl = process.env.TWOGIS_BUSINESS_ADD_URL ?? 'https://account.2gis.com/add-organization';
  protected storageStateEnvKey = 'TWOGIS_STORAGE_STATE';

  protected selectors = {
    name: 'input[name="name"], input[placeholder*="Название"], input[type="text"]',
    category: 'input[name="rubric"], input[placeholder*="рубрика"], input[placeholder*="Деятельность"], input[type="text"]',
    address: 'input[name="address"], input[placeholder*="Адрес"], input[type="text"]',
    latitude: 'input[name="lat"], input[name="latitude"]',
    longitude: 'input[name="lon"], input[name="longitude"]',
    phone: 'input[type="tel"]',
    email: 'input[type="email"]',
    website: 'input[name="website"], input[type="url"], input[type="text"]',
    description: 'textarea[name="description"], textarea',
    logoUpload: 'input[type="file"][name="logo"], input[type="file"]',
    photosUpload: 'input[type="file"][name="photos"], input[type="file"]',
    submit: 'button[type="submit"], button',
  };

  // ═══════════════════════════════════════════════════════════════════
  //  Open Page
  // ═══════════════════════════════════════════════════════════════════

  protected async openCreatePage(page: Page, runId: string) {
    await this.log(runId, 'Opening 2GIS business add page');
    await page.goto(this.createOrganizationUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await this.waitForDomStable(page);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Fill Branch — all wizard steps
  // ═══════════════════════════════════════════════════════════════════

  protected async fillBranch(page: Page, context: AutomationContext) {
    await page.waitForLoadState('domcontentloaded');
    await this.waitForDomStable(page);

    const { branch, runId } = context;

    // ─── Step 1: Company name ───────────────────────────────────────
    await this.retry(runId, 'Step 1: Company name', async () => {
      await this.log(runId, '2GIS wizard: filling company name');
      await this.fillRequired(runId, page, 'Company name', branch.name, [
        () => page.locator('input[name="name"]'),
        () => page.getByPlaceholder(/Название компании|Введите название/i),
      ]);
    });
    await this.advanceWizard(page, runId);
    await this.handleExistingCompanyStep(page, runId);

    // ─── Step 2: Category (Вид деятельности) ────────────────────────
    await this.retry(runId, 'Step 2: Category', async () => {
      await this.log(runId, '2GIS wizard: selecting category');
      await this.selectCategory(page, runId, branch.category || '');
    });
    await this.advanceWizard(page, runId);

    // ─── Step 3: Address ────────────────────────────────────────────
    await this.retry(runId, 'Step 3: Address', async () => {
      await this.log(runId, '2GIS wizard: filling address');
      await this.fillAddressWithSuggestion(page, runId, branch.address);
    });
    await this.advanceWizard(page, runId);

    // ─── Step 4: Contact details ────────────────────────────────────
    await this.retry(runId, 'Step 4: Contacts', async () => {
      let phoneValue = branch.phone || '';
      const digits = phoneValue.replace(/\D/g, '');
      if (digits.length === 9) {
        phoneValue = `+998${digits}`;
      } else if (digits.length === 12 && digits.startsWith('998')) {
        phoneValue = `+${digits}`;
      }

      await this.fillOptional(runId, page, 'Phone', phoneValue, [
        () => page.locator('input[name="phone"]'),
        () => page.locator('input[type="tel"]').first(),
        () => page.getByLabel(/Телефон/i),
      ]);
      await this.fillOptional(runId, page, 'Website', branch.website || '', [
        () => page.locator('input[name="website"]'),
        () => page.locator('input[type="url"]').first(),
        () => page.getByPlaceholder(/Сайт/i),
      ]);
      await this.fillOptional(runId, page, 'Email', branch.email || '', [
        () => page.locator('input[name="email"]'),
        () => page.locator('input[type="email"]').first(),
        () => page.getByLabel(/email|e-mail|почта/i),
      ]);
    });
    await this.advanceWizard(page, runId);

    // ─── Step 5: Description ────────────────────────────────────────
    await this.retry(runId, 'Step 5: Description', async () => {
      await this.fillOptional(runId, page, 'Description', branch.description || '', [
        () => page.getByLabel(/Описание/i),
        () => page.locator('textarea[name="description"]'),
        () => page.locator('textarea').first(),
      ]);
    });

    // ─── Step 6: Photos ─────────────────────────────────────────────
    await this.uploadAssets(page, runId, branch);
    await this.advanceWizard(page, runId);

    // ─── Step 7: Working hours ──────────────────────────────────────
    await this.applyWorkingHours(page, branch.workingHours);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Submit / SMS flow
  // ═══════════════════════════════════════════════════════════════════

  protected async submit(page: Page, runId: string): Promise<'submitted' | 'waiting-for-user'> {
    await this.log(runId, '2GIS wizard: trying to submit or continue');
    await this.advanceWizard(page, runId);

    const needsConfirmation = await this.hasAnyVisibleText(page, [
      /подтверд/i,
      /verify/i,
      /captcha/i,
      /код/i,
      /confirmation/i,
      /звонок|позвонить/i,
      /SMS|СМС/i,
    ]);

    if (needsConfirmation) {
      await this.pauseForUser(runId, page, '2GIS requested manual confirmation');
      
      const startTime = Date.now();
      const timeoutMs = 300_000; // 5 minutes
      
      await this.log(runId, '2GIS: waiting for verification code from UI or direct browser input...');

      while (Date.now() - startTime < timeoutMs) {
        // Check if browser code input is still visible
        const codeInputVisible = await page.locator('input[name="code"]')
          .or(page.locator('input[type="tel"]'))
          .or(page.getByPlaceholder(/код/i))
          .first()
          .isVisible()
          .catch(() => false);

        if (!codeInputVisible) {
          const stillNeedsConfirmation = await this.hasAnyVisibleText(page, [
            /подтверд/i,
            /verify/i,
            /captcha/i,
            /код/i,
            /confirmation/i,
            /звонок|позвонить/i,
            /SMS/i,
          ]);
          if (!stillNeedsConfirmation) {
            await this.log(runId, '2GIS: Verification completed directly in browser window.');
            return 'submitted';
          }
        }

        // Check if code was sent from Dashboard UI
        const run = await prisma.automationRun.findUnique({
          where: { id: runId },
        });

        if (!run || run.status === AutomationStatus.FAILED || run.status === AutomationStatus.CANCELLED) {
          await this.log(runId, '2GIS: Run status changed externally. Stopping.');
          return 'waiting-for-user';
        }

        const stateObj = run.state as any;
        const verificationCode = stateObj?.verificationCode;

        if (verificationCode) {
          await this.log(runId, `2GIS: Found verification code from DB: ${verificationCode.replace(/./g, '*')}`);
          
          try {
            const codeInput = page.locator('input[name="code"]')
              .or(page.locator('input[type="tel"]'))
              .or(page.getByPlaceholder(/код/i))
              .first();

            await codeInput.waitFor({ state: 'visible', timeout: 5000 });
            await codeInput.fill(verificationCode);
            await this.log(runId, '2GIS: Filled code in browser. Submitting...');

            const confirmBtn = page.getByRole('button', { name: /подтвердить|отправить|confirm/i })
              .or(page.locator('button[type="submit"]'))
              .first();

            await page.waitForTimeout(500);
            if (await confirmBtn.isVisible()) {
              await confirmBtn.click();
            } else {
              await page.keyboard.press('Enter');
            }
            await this.waitForDomStable(page);

            await page.waitForTimeout(2500);

            const errorVisible = await this.hasAnyVisibleText(page, [
              /неверный код/i,
              /ошибка/i,
              /invalid code/i,
            ]);

            if (errorVisible) {
              await this.log(runId, '2GIS: Verification code was rejected. Waiting for new code.');
              const updatedState = { ...(run.state as object), verificationCode: null, reason: 'Код неверный. Попробуйте ещё раз.' };
              await prisma.automationRun.update({
                where: { id: runId },
                data: {
                  status: AutomationStatus.WAITING_FOR_USER,
                  state: updatedState,
                },
              });
            } else {
              const updatedState = { ...(run.state as object), verificationCode: null };
              await prisma.automationRun.update({
                where: { id: runId },
                data: { state: updatedState },
              });
              await this.log(runId, '2GIS: Code accepted.');
              return 'submitted';
            }
          } catch (fillError) {
            await this.log(runId, `2GIS: Error filling verification code: ${fillError}`);
          }
        }

        await page.waitForTimeout(2000);
      }

      await this.log(runId, '2GIS: Timeout waiting for verification code.');
      return 'waiting-for-user';
    }

    return 'submitted';
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Resume after verification
  // ═══════════════════════════════════════════════════════════════════

  async resumeAfterVerification(runId: string, verificationCode: string) {
    const run = await prisma.automationRun.findUnique({
      where: { id: runId },
      include: { branch: true },
    });

    if (!run) throw new Error(`Automation run ${runId} not found`);

    this.keepBrowserOpen = false;
    const { chromium } = await import('playwright');
    const headless = (process.env.PLAYWRIGHT_HEADLESS ?? 'false') === 'true';
    const browser = await chromium.launch({ headless });

    try {
      const context = await this.createContext(browser);
      const page = await context.newPage();

      const firmsUrl = process.env.TWOGIS_BUSINESS_LOGIN_URL ?? 'https://account.2gis.com/firms';
      await page.goto(firmsUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.waitForDomStable(page);

      const codeFilled = await this.retry(runId, 'Verification code entry', async () => {
        const codeInput = page.locator('input[name="code"]')
          .or(page.locator('input[type="tel"]'))
          .or(page.getByPlaceholder(/код/i));

        await codeInput.first().waitFor({ state: 'visible', timeout: 10_000 });
        await codeInput.first().fill(verificationCode);
        await this.log(runId, `Verification code entered: ${verificationCode.replace(/./g, '*')}`);
        return true;
      });

      if (codeFilled) {
        const confirmBtn = page.getByRole('button', { name: /подтвердить|отправить|confirm/i })
          .or(page.locator('button[type="submit"]'));

        try {
          await confirmBtn.first().click({ timeout: 5_000 });
          await this.waitForDomStable(page);
          await this.log(runId, 'Verification code submitted');
        } catch {
          await this.log(runId, 'Could not find confirm button, trying Enter key');
          await page.keyboard.press('Enter');
          await this.waitForDomStable(page);
        }
      }

      const stillNeedsVerification = await this.hasAnyVisibleText(page, [
        /неверный код/i,
        /ошибка/i,
        /invalid code/i,
      ]);

      if (stillNeedsVerification) {
        await this.log(runId, 'Verification code was rejected', undefined);
        await this.pauseForUser(runId, page, 'Код подтверждения отклонён. Попробуйте ещё раз.');
        return;
      }

      await this.markCompleted(runId, run.branch.id);
      await this.log(runId, 'Verification successful, automation completed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Verification resumption failed';
      await this.markFailed(runId, message);
      throw error;
    } finally {
      if (this.keepBrowserOpen) {
        console.log(`[${this.providerName}] Keeping browser open after verification resume pause.`);
      } else {
        await browser.close();
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Working hours
  // ═══════════════════════════════════════════════════════════════════

  protected async applyWorkingHours(page: Page, workingHours: unknown) {
    if (!workingHours) return;

    const dayMap: Record<string, string[]> = {
      mon: ['Пн', 'Понедельник', 'Monday'],
      tue: ['Вт', 'Вторник', 'Tuesday'],
      wed: ['Ср', 'Среда', 'Wednesday'],
      thu: ['Чт', 'Четверг', 'Thursday'],
      fri: ['Пт', 'Пятница', 'Friday'],
      sat: ['Сб', 'Суббота', 'Saturday'],
      sun: ['Вс', 'Воскресенье', 'Sunday'],
    };

    if (workingHours === 'round_the_clock' || workingHours === '24/7') {
      const roundTheClockBtn = page.getByText(/круглосуточно/i)
        .or(page.getByLabel(/круглосуточно/i))
        .or(page.getByText(/24 часа/i));
      try {
        await roundTheClockBtn.first().click({ timeout: 3_000 });
        return;
      } catch {
        // Fallback to day-by-day
      }
    }

    if (typeof workingHours !== 'object' || workingHours === null) return;

    const hours = workingHours as Record<string, { from?: string; to?: string }>;

    for (const [day, schedule] of Object.entries(hours)) {
      if (!schedule?.from || !schedule?.to) continue;
      const labels = dayMap[day.toLowerCase()];
      if (!labels) continue;

      try {
        for (const label of labels) {
          const row = page.locator(`text=${label}`).locator('..').locator('..');
          const fromInput = row.locator('input').first();
          const toInput = row.locator('input').nth(1);

          try {
            await fromInput.waitFor({ state: 'visible', timeout: 1_500 });
            await fromInput.fill(schedule.from);
            await toInput.fill(schedule.to);
            break;
          } catch {
            continue;
          }
        }
      } catch {
        // Quietly fail day-by-day click if inputs are not reachable
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Category autocomplete selection
  // ═══════════════════════════════════════════════════════════════════

  private async selectCategory(page: Page, runId: string, category: string) {
    await this.waitForDomStable(page);

    const input = page.locator('input[name="rubric"]')
      .or(page.getByPlaceholder(/рубрика/i))
      .or(page.getByPlaceholder(/вид деятельности/i));

    await input.first().waitFor({ state: 'visible', timeout: 5_000 });
    await input.first().click();
    await input.first().fill(category);

    await this.waitForDomStable(page);
    await page.waitForTimeout(600);

    // Click the first autocomplete suggestion
    const suggestion = page.locator('[class*="suggest"], [class*="item"], [role="option"]')
      .filter({ visible: true })
      .first();

    try {
      await suggestion.waitFor({ state: 'visible', timeout: 3_000 });
      await suggestion.click();
    } catch {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(50);
      await page.keyboard.press('Enter');
    }

    await this.waitForDomStable(page);
    await this.log(runId, `2GIS category selected: ${category}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Address autocomplete selection
  // ═══════════════════════════════════════════════════════════════════

  private async fillAddressWithSuggestion(page: Page, runId: string, address: string) {
    await this.waitForDomStable(page);

    const input = page.locator('input[name="address"]')
      .or(page.getByPlaceholder(/Адрес/i))
      .or(page.locator('input[type="text"]').first());

    await input.first().waitFor({ state: 'visible', timeout: 5_000 });
    await input.first().click();
    await input.first().fill(address);

    await page.waitForTimeout(800);

    const suggestion = page.locator('[class*="suggest"], [class*="address"], [role="option"]')
      .filter({ visible: true })
      .first();

    try {
      await suggestion.waitFor({ state: 'visible', timeout: 3_000 });
      const text = await suggestion.innerText().catch(() => '');
      await this.log(runId, `Address suggestion found: "${text}". Clicking it.`);
      await suggestion.click();
    } catch {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(50);
      await page.keyboard.press('Enter');
    }

    await this.waitForDomStable(page);
    await this.log(runId, `Address filled and selected: ${address}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Existing company duplicate check
  // ═══════════════════════════════════════════════════════════════════

  private async handleExistingCompanyStep(page: Page, runId: string) {
    const addNewButtons = [
      page.getByRole('button', { name: /Добавить.*нов/i }),
      page.getByText(/добавьте.*свою/i).first(),
      page.getByRole('button', { name: /Всё равно добавить/i }),
    ];

    for (const button of addNewButtons) {
      try {
        await button.waitFor({ state: 'visible', timeout: 2_500 });
        await button.click();
        await this.waitForDomStable(page);
        await this.log(runId, '2GIS wizard: selected add new company over duplicates');
        return;
      } catch {
        // Duplicate screen is optional
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  File uploads
  // ═══════════════════════════════════════════════════════════════════

  private async uploadAssets(page: Page, runId: string, branch: Branch) {
    if (branch.logo) {
      await this.uploadIfVisible(page, runId, 'Logo', branch.logo, [
        () => page.locator('input[type="file"][name="logo"]').first(),
        () => page.locator('input[type="file"]').first(),
      ]);
    }

    let photosToUpload = branch.photos;

    if (!photosToUpload || photosToUpload.length === 0) {
      const fallbacks = [
        path.resolve('public/placeholder-business.jpg'),
        path.resolve('public/images/default-storefront.jpg'),
      ];

      for (const f of fallbacks) {
        if (existsSync(f)) {
          photosToUpload = [f];
          await this.log(runId, `Using fallback photo: ${f}`);
          break;
        }
      }
    }

    if (photosToUpload && photosToUpload.length > 0) {
      await this.uploadIfVisible(page, runId, 'Photos', photosToUpload, [
        () => page.locator('input[type="file"][name="photos"]').first(),
        () => page.locator('input[type="file"]').first(),
      ]);
    }
  }

  private async uploadIfVisible(
    page: Page,
    runId: string,
    label: string,
    files: string | string[],
    locators: Array<() => Locator>,
  ) {
    for (const buildLocator of locators) {
      const locator = buildLocator();

      try {
        await locator.waitFor({ state: 'attached', timeout: 1_500 });
        await locator.setInputFiles(files);
        await this.log(runId, `2GIS upload completed: ${label}`);
        return true;
      } catch {
        // Upload block might be skipped or on a different tab
      }
    }

    await this.log(runId, `2GIS upload control not visible yet: ${label}`);
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Field helpers
  // ═══════════════════════════════════════════════════════════════════

  private async fillRequired(
    runId: string,
    page: Page,
    label: string,
    value: string,
    locators: Array<() => Locator>,
  ) {
    const filled = await this.fillFirstVisible(page, value, locators, 15_000);
    if (!filled) {
      throw new Error(`2GIS field is required but was not found: ${label}`);
    }
    await this.log(runId, `2GIS field filled: ${label}`);
  }

  private async fillOptional(
    runId: string,
    page: Page,
    label: string,
    value: string,
    locators: Array<() => Locator>,
  ) {
    const filled = await this.fillFirstVisible(page, value, locators, 2_500);
    await this.log(
      runId,
      filled ? `2GIS field filled: ${label}` : `2GIS field not visible yet: ${label}`,
    );
  }

  private async fillFirstVisible(
    page: Page,
    value: string,
    locators: Array<() => Locator>,
    timeout: number,
  ) {
    for (const buildLocator of locators) {
      const locator = buildLocator().first();

      try {
        await locator.waitFor({ state: 'attached', timeout });
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.click().catch(() => {});
        await locator.fill(value);
        return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Wizard navigation
  // ═══════════════════════════════════════════════════════════════════

  private async advanceWizard(page: Page, runId: string) {
    const buttons = [
      page.locator('button[type="submit"]').filter({ visible: true }).first(),
      page.getByRole('button', { name: /Продолжить/i }).filter({ visible: true }).first(),
      page.getByRole('button', { name: /Далее/i }).filter({ visible: true }).first(),
      page.getByRole('button', { name: /Добавить/i }).filter({ visible: true }).first(),
    ];

    for (const button of buttons) {
      try {
        await button.waitFor({ state: 'visible', timeout: 2_500 });
        if (await button.isEnabled()) {
          await button.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(50);

          try {
            await button.click({ timeout: 3_000 });
          } catch {
            await button.click({ force: true }).catch(() => {});
            await button.evaluate((el: HTMLElement) => el.click()).catch(() => {});
          }

          await this.waitForDomStable(page);
          await this.log(runId, '2GIS wizard: clicked next button');
          return true;
        }
      } catch {
        // Buttons differ by wizard step
      }
    }

    await this.log(runId, '2GIS wizard: next button is not visible yet');
    return false;
  }
}
