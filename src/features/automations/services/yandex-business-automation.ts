import { existsSync } from 'fs';
import path from 'path';
import type { Branch } from '@prisma/client';
import type { Locator, Page } from 'playwright';
import { AutomationStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { BaseBusinessAutomation } from './base-business-automation';
import type { AutomationContext } from './types';

/**
 * Yandex Справочник automation — fills the multi-step wizard at
 * https://yandex.ru/sprav/add to create a new business listing.
 *
 * v2 improvements:
 * - ESM-safe (no `require()`)
 * - Retry wrapper on every step
 * - DOM-stable waits between wizard pages
 * - Real working hours filling via DOM controls
 * - Proper SMS/phone verification resumption
 * - Configurable headless mode
 */
export class YandexBusinessAutomation extends BaseBusinessAutomation {
  protected providerName = 'Yandex Business';
  protected createOrganizationUrl = process.env.YANDEX_BUSINESS_ADD_URL ?? 'https://yandex.ru/sprav/add';
  protected storageStateEnvKey = 'YANDEX_BUSINESS_STORAGE_STATE';

  protected selectors = {
    name: 'input[type="text"]',
    category: 'input[name="rubric"], input[type="text"]',
    address: 'input[name="address"], input[type="text"]',
    latitude: 'input[name="latitude"]',
    longitude: 'input[name="longitude"]',
    phone: 'input[type="tel"]',
    email: 'input[type="email"]',
    website: 'input[name="site"], input[type="url"], input[type="text"]',
    description: 'textarea[name="description"], textarea',
    logoUpload: 'input[type="file"][name="logo"]',
    photosUpload: 'input[type="file"][name="photos"], input[type="file"]',
    submit: 'button[type="submit"], button',
  };

  // ═══════════════════════════════════════════════════════════════════
  //  Open Page
  // ═══════════════════════════════════════════════════════════════════

  protected async openCreatePage(page: Page, runId: string) {
    await this.log(runId, 'Opening Yandex business add page');
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
      await this.log(runId, 'Yandex wizard: filling company name');
      await this.fillRequired(runId, page, 'Company name', branch.name, [
        () => page.locator('.Textinput-Control[name="a_n"]'),
        () => page.getByPlaceholder(/Название компании/i),
      ]);
    });
    await this.advanceWizard(page, runId);
    await this.handleExistingCompanyStep(page, runId);

    // ─── Step 2: Category (Вид деятельности) ────────────────────────
    await this.retry(runId, 'Step 2: Category', async () => {
      await this.log(runId, 'Yandex wizard: selecting category');
      await this.selectCategory(page, runId, branch.category || '');
    });
    await this.advanceWizard(page, runId);

    // ─── Step 2.5: Presence question ────────────────────────────────
    await this.handlePresenceStep(page, runId);

    // ─── Step 3: Address ────────────────────────────────────────────
    await this.retry(runId, 'Step 3: Address', async () => {
      await this.log(runId, 'Yandex wizard: filling address');
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
        () => page.locator('input[name="c_p"]'),
        () => page.locator('input[type="tel"]').first(),
        () => page.getByLabel(/Телефон/i),
      ]);
      await this.fillOptional(runId, page, 'Website', branch.website || '', [
        () => page.locator('input[name="c_u"]'),
        () => page.locator('input[type="url"]').first(),
        () => page.getByPlaceholder(/Сайт/i),
      ]);
      await this.fillOptional(runId, page, 'Email', branch.email || '', [
        () => page.locator('input[type="email"]').first(),
        () => page.getByLabel(/email|e-mail|почта/i),
      ]);
    });
    await this.advanceWizard(page, runId);

    // ─── Step 5: Description ────────────────────────────────────────
    await this.retry(runId, 'Step 5: Description', async () => {
      await this.fillOptional(runId, page, 'Description', branch.description || '', [
        () => page.getByLabel(/Описание/i),
        () => page.locator('textarea').first(),
      ]);
    });

    // ─── Step 6: Photos ─────────────────────────────────────────────
    await this.uploadYandexAssets(page, runId, branch);
    await this.advanceWizard(page, runId);

    // ─── Step 7: Working hours ──────────────────────────────────────
    await this.applyWorkingHours(page, branch.workingHours);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Submit
  // ═══════════════════════════════════════════════════════════════════

  protected async submit(page: Page, runId: string): Promise<'submitted' | 'waiting-for-user'> {
    await this.log(runId, 'Yandex wizard: trying to submit or continue');
    await this.advanceWizard(page, runId);

    const needsConfirmation = await this.hasAnyVisibleText(page, [
      /подтверд/i,
      /verify/i,
      /captcha/i,
      /код/i,
      /confirmation/i,
      /позвоним/i,
      /SMS/i,
    ]);

    if (needsConfirmation) {
      await this.pauseForUser(runId, page, 'Yandex requested manual confirmation');
      
      const startTime = Date.now();
      const timeoutMs = 300_000; // 5 minutes
      
      await this.log(runId, 'Yandex: waiting for verification code from UI or direct browser input...');

      while (Date.now() - startTime < timeoutMs) {
        // 1. Check if the code input field is still visible in browser
        const codeInputVisible = await page.locator('input[name="code"]')
          .or(page.locator('input[type="tel"]'))
          .or(page.getByPlaceholder(/код/i))
          .first()
          .isVisible()
          .catch(() => false);

        if (!codeInputVisible) {
          // If code input is not visible, check if we still need confirmation
          const stillNeedsConfirmation = await this.hasAnyVisibleText(page, [
            /подтверд/i,
            /verify/i,
            /captcha/i,
            /код/i,
            /confirmation/i,
            /позвоним/i,
            /SMS/i,
          ]);
          if (!stillNeedsConfirmation) {
            await this.log(runId, 'Yandex: Verification completed directly in browser window.');
            return 'submitted';
          }
        }

        // 2. Check the database for code entered via Dashboard UI
        const run = await prisma.automationRun.findUnique({
          where: { id: runId },
        });

        if (!run || run.status === AutomationStatus.FAILED || run.status === AutomationStatus.CANCELLED) {
          await this.log(runId, 'Yandex: Run status changed externally. Stopping wait.');
          return 'waiting-for-user';
        }

        const stateObj = run.state as any;
        const verificationCode = stateObj?.verificationCode;

        if (verificationCode) {
          await this.log(runId, `Yandex: Found verification code from DB: ${verificationCode.replace(/./g, '*')}`);
          
          try {
            const codeInput = page.locator('input[name="code"]')
              .or(page.locator('input[type="tel"]'))
              .or(page.getByPlaceholder(/код/i))
              .first();

            await codeInput.waitFor({ state: 'visible', timeout: 5000 });
            await codeInput.fill(verificationCode);
            await this.log(runId, 'Yandex: Filled code in browser. Submitting...');

            // Click confirm button
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

            // Wait a bit to check for rejection
            await page.waitForTimeout(2500);

            const errorVisible = await this.hasAnyVisibleText(page, [
              /неверный код/i,
              /ошибка/i,
              /invalid code/i,
            ]);

            if (errorVisible) {
              await this.log(runId, 'Yandex: Verification code was rejected. Waiting for new code.');
              // Clear verificationCode in database and notify user
              const updatedState = { ...(run.state as object), verificationCode: null, reason: 'Код неверный. Попробуйте ещё раз.' };
              await prisma.automationRun.update({
                where: { id: runId },
                data: {
                  status: AutomationStatus.WAITING_FOR_USER,
                  state: updatedState,
                },
              });
            } else {
              // Successfully submitted and no error visible
              const updatedState = { ...(run.state as object), verificationCode: null };
              await prisma.automationRun.update({
                where: { id: runId },
                data: { state: updatedState },
              });
              await this.log(runId, 'Yandex: Code accepted.');
              return 'submitted';
            }
          } catch (fillError) {
            await this.log(runId, `Yandex: Error filling verification code: ${fillError}`);
          }
        }

        // Wait 2 seconds
        await page.waitForTimeout(2000);
      }

      await this.log(runId, 'Yandex: Timeout waiting for verification code.');
      return 'waiting-for-user';
    }

    return 'submitted';
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Resume after SMS/phone verification
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Called when user submits a verification code through the dashboard.
   * Re-opens the browser with stored state, navigates to the pending
   * organization and enters the code.
   */
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

      // Navigate to the companies page where the pending org should appear
      const companiesUrl = process.env.YANDEX_BUSINESS_LOGIN_URL ?? 'https://yandex.ru/sprav/companies';
      await page.goto(companiesUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.waitForDomStable(page);

      // Try to find and fill the verification code input
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
        // Click confirm/submit button
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

      // Check if verification succeeded
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
  //  Working hours — real DOM interaction
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Fills working hours through actual Yandex form controls.
   * Expects workingHours in format:
   *   { "mon": { "from": "09:00", "to": "18:00" }, ... }
   * or "round_the_clock" string for 24/7.
   */
  protected async applyWorkingHours(page: Page, workingHours: unknown) {
    if (!workingHours) return;

    const dayMap: Record<string, string[]> = {
      mon: ['Пн', 'Понедельник'],
      tue: ['Вт', 'Вторник'],
      wed: ['Ср', 'Среда'],
      thu: ['Чт', 'Четверг'],
      fri: ['Пт', 'Пятница'],
      sat: ['Сб', 'Суббота'],
      sun: ['Вс', 'Воскресенье'],
    };

    // Handle 24/7
    if (workingHours === 'round_the_clock' || workingHours === '24/7') {
      const roundTheClockBtn = page.getByText(/круглосуточно/i)
        .or(page.getByLabel(/круглосуточно/i));
      try {
        await roundTheClockBtn.first().click({ timeout: 3_000 });
        return;
      } catch {
        // Button not visible, try day-by-day
      }
    }

    if (typeof workingHours !== 'object' || workingHours === null) return;

    const hours = workingHours as Record<string, { from?: string; to?: string }>;

    for (const [day, schedule] of Object.entries(hours)) {
      if (!schedule?.from || !schedule?.to) continue;
      const labels = dayMap[day.toLowerCase()];
      if (!labels) continue;

      try {
        // Try to find a row for this day and fill times
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
        // Working hours controls may not be visible on this step
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Category selection
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Selects the business category on the "Чем занимается ваша компания?" step.
   *
   * Strategy 1: Click a preset chip matching the text (e.g. "Кафе").
   * Strategy 2: Type in the rubric input and select the first suggestion via keyboard.
   */
  private async selectCategory(page: Page, runId: string, category: string) {
    await this.waitForDomStable(page);

    // ── Strategy 1: Click a preset chip ──
    try {
      const chips = page.locator('.ya-business-chip_clickable');
      const chipCount = await chips.count();

      for (let i = 0; i < chipCount; i++) {
        const chip = chips.nth(i);
        const text = await chip.innerText().catch(() => '');

        if (text.trim().toLowerCase() === category.trim().toLowerCase()) {
          await chip.click();
          await this.waitForDomStable(page);
          await this.log(runId, `Category selected via chip: ${category}`);
          return;
        }
      }
    } catch {
      // Chips not found, try typing
    }

    // ── Strategy 2: Type into the rubric input ──
    await this.log(runId, `Category chip not found, typing: ${category}`);

    const input = page.locator('.Textinput-Control[name="r"]')
      .or(page.getByPlaceholder(/вид деятельности/i));

    await input.first().waitFor({ state: 'visible', timeout: 5_000 });
    await input.first().click();
    await input.first().fill(category);

    // Wait for autocomplete suggestions
    await this.waitForDomStable(page);
    await page.waitForTimeout(400);

    // Select the first suggestion via keyboard
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await this.waitForDomStable(page);

    await this.log(runId, `Category typed and selected via keyboard: ${category}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Presence question
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Handles "У вас есть место, куда могут прийти клиенты?"
   * Selects "Да, есть филиал, магазин или офис".
   */
  private async handlePresenceStep(page: Page, runId: string) {
    const question = page.getByText(/У вас есть место/i);
    try {
      await question.waitFor({ state: 'visible', timeout: 3_000 });
      const offlineBtn = page.locator('.CreateForm-LocationLink_type_offline')
        .or(page.getByText(/Да, есть филиал/i));

      await this.log(runId, 'Yandex wizard: selecting offline presence (Да, есть...)');
      await offlineBtn.first().click({ timeout: 5_000 });
      await this.waitForDomStable(page);
    } catch {
      // Step was not shown or skipped
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Address with suggestion
  // ═══════════════════════════════════════════════════════════════════

  private async fillAddressWithSuggestion(page: Page, runId: string, address: string) {
    await this.waitForDomStable(page);

    // The address input is a textarea.Textarea-Control, NOT a standard input
    const input = page.locator('textarea.Textarea-Control')
      .or(page.locator('textarea'));

    await input.first().waitFor({ state: 'visible', timeout: 5_000 });
    await input.first().click();
    await input.first().fill(address);

    // Wait for address suggestions from map API
    await page.waitForTimeout(600);

    // Try clicking the first suggestion directly
    const suggestion = page
      .locator('.Suggest-Popup .Menu-Item, .Suggest-Popup .Menu-Text, .Menu-Item')
      .filter({ visible: true })
      .first();

    try {
      await suggestion.waitFor({ state: 'visible', timeout: 3_000 });
      const text = await suggestion.innerText().catch(() => '');
      await this.log(runId, `Address suggestion found: "${text}". Clicking it.`);
      await suggestion.click();
    } catch {
      // Fallback to keyboard selection
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
    ];

    for (const button of addNewButtons) {
      try {
        await button.waitFor({ state: 'visible', timeout: 2_500 });
        await button.click();
        await this.waitForDomStable(page);
        await this.log(runId, 'Yandex wizard: selected add new company');
        return;
      } catch {
        // The duplicate-company step is optional.
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  File uploads — ESM-safe
  // ═══════════════════════════════════════════════════════════════════

  private async uploadYandexAssets(page: Page, runId: string, branch: Branch) {
    // 1. Upload Logo if present
    if (branch.logo) {
      await this.uploadIfVisible(page, runId, 'Logo', branch.logo, [
        () => page.locator('input[type="file"][name="logo"]').first(),
        () => page.locator('input[type="file"]').first(),
      ]);
    }

    // 2. Upload Photos
    let photosToUpload = branch.photos;

    if (!photosToUpload || photosToUpload.length === 0) {
      // Look for fallback images — ESM-safe using `existsSync` from `fs`
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
        () => page.locator('input[name="attach"]').first(),
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
        await this.log(runId, `Yandex upload completed: ${label}`);
        return true;
      } catch {
        // Upload controls are often hidden until later wizard steps.
      }
    }

    await this.log(runId, `Yandex upload control not visible yet: ${label}`);
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
      throw new Error(`Yandex field is required but was not found: ${label}`);
    }

    await this.log(runId, `Yandex field filled: ${label}`);
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
      filled ? `Yandex field filled: ${label}` : `Yandex field not visible yet: ${label}`,
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

  /**
   * Clicks the "Продолжить" / "Далее" / "Добавить" button and waits
   * for the DOM to settle — much more reliable than static timeouts.
   */
  private async advanceWizard(page: Page, runId: string) {
    const buttons = [
      page.locator('.CreateForm-Submit').filter({ visible: true }).first(),
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

          // Try normal click first, fallback to force click + JS click
          try {
            await button.click({ timeout: 3_000 });
          } catch {
            await button.click({ force: true }).catch(() => {});
            await button.evaluate((el: HTMLElement) => el.click()).catch(() => {});
          }

          // Wait for DOM to stabilize after page transition
          await this.waitForDomStable(page);
          await this.log(runId, 'Yandex wizard: clicked next button');
          return true;
        }
      } catch {
        // Continue buttons may appear on different wizard steps.
      }
    }

    await this.log(runId, 'Yandex wizard: next button is not visible yet');
    return false;
  }
}
