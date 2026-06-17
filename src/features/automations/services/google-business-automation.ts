import type { Page } from 'playwright';
import { BaseBusinessAutomation } from './base-business-automation';
import type { AutomationContext } from './types';
import { prisma } from '@/lib/db/prisma';
import { AutomationStatus } from '@prisma/client';

export class GoogleBusinessAutomation extends BaseBusinessAutomation {
  protected providerName = 'Google Business Profile';
  protected createOrganizationUrl = 'https://business.google.com/create';
  protected storageStateEnvKey = 'GOOGLE_BUSINESS_STORAGE_STATE';

  protected selectors = {
    name: '[data-testid="business-name"], input[aria-label*="Business name"]',
    category: '[data-testid="business-category"], input[aria-label*="Business category"]',
    address: '[data-testid="business-address"], input[aria-label*="Address"]',
    latitude: '[data-testid="latitude"], input[name="latitude"]',
    longitude: '[data-testid="longitude"], input[name="longitude"]',
    phone: '[data-testid="phone"], input[type="tel"]',
    email: '[data-testid="email"], input[type="email"]',
    website: '[data-testid="website"], input[name="website"]',
    description: '[data-testid="description"], textarea',
    logoUpload: 'input[type="file"][name="logo"]',
    photosUpload: 'input[type="file"][name="photos"]',
    submit: '[data-testid="submit"], button[type="submit"]',
  };

  protected async fillBranch(page: Page, context: AutomationContext) {
    const { branch, runId } = context;
    await page.waitForLoadState('domcontentloaded');
    await this.waitForDomStable(page);

    await this.log(runId, 'Google: starting wizard automation');

    const maxSteps = 15;
    for (let step = 0; step < maxSteps; step++) {
      await this.waitForDomStable(page);
      await page.waitForTimeout(1000); // wait for transitions to stabilize

      // Get page title for logging
      const titleText = await page.locator('h1, h2, .C70G6c').first().innerText().catch(() => '');
      await this.log(runId, `Google step ${step + 1}: current page title is "${titleText}"`);

      // 1. Confirm Info step ("Подтвердите информацию")
      if (await this.hasAnyVisibleText(page, [/Подтвердите информацию/i, /Confirm/i])) {
        await this.log(runId, 'Google: Confirm Info step detected. Clicking Далее/Next.');
        const daleeBtn = page.getByRole('button', { name: /Далее|Next/i }).first();
        if (await daleeBtn.isVisible().catch(() => false)) {
          await daleeBtn.click();
        } else {
          // fallback to clicking any element containing Далее
          await page.locator('button:has-text("Далее"), button:has-text("Next")').first().click();
        }
        continue;
      }

      // 2. Name & Category step ("Создайте профиль компании")
      if (
        await this.hasAnyVisibleText(page, [/Создайте профиль компании|Create your business profile/i]) ||
        await page.locator('input[aria-label*="Название"], input[aria-label*="Name"]').first().isVisible().catch(() => false)
      ) {
        await this.log(runId, 'Google: Create Profile step detected. Filling name and category.');

        // Fill Name
        const nameInput = page.locator('input[aria-label*="Название"], input[aria-label*="Name"], input[type="text"]').first();
        await nameInput.waitFor({ state: 'visible', timeout: 5000 });
        await nameInput.fill(branch.name);
        await this.log(runId, `Google: Filled name "${branch.name}"`);

        // Fill Category
        const catInput = page.locator('input[aria-label*="Вид деятельности"], input[aria-label*="Category"], input[type="text"]').nth(1);
        await catInput.waitFor({ state: 'visible', timeout: 5000 });
        await catInput.click();
        await catInput.fill(branch.category || '');
        await this.log(runId, `Google: Typing category "${branch.category || ''}"`);

        // Autocomplete selection
        await page.waitForTimeout(1500);
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(200);
        await page.keyboard.press('Enter');
        await this.log(runId, 'Google: Selected category from suggestions');

        await page.waitForTimeout(800);

        // Click Next
        const daleeBtn = page.getByRole('button', { name: /Далее|Next/i }).first();
        await daleeBtn.click();
        continue;
      }

      // 3. Physical location presence step
      if (
        await this.hasAnyVisibleText(page, [
          /Хотите добавить/i,
          /посетить клиенты/i,
          /Add a location/i
        ])
      ) {
        await this.log(runId, 'Google: Presence step detected. Selecting Yes (Да).');
        
        // Find and click the "Да" or "Yes" button/label
        const yesRadio = page.getByLabel(/^Да$|^Yes$/i).first();
        const yesText = page.getByText(/^Да$|^Yes$/i).first();
        const yesLabel = page.locator('label:has-text("Да"), label:has-text("Yes")').first();

        try {
          if (await yesRadio.isVisible().catch(() => false)) {
            await yesRadio.click();
          } else if (await yesText.isVisible().catch(() => false)) {
            await yesText.click();
          } else if (await yesLabel.isVisible().catch(() => false)) {
            await yesLabel.click();
          } else {
            // Fallback: search for radio elements or click label
            await page.locator('input[type="radio"]').first().click().catch(() => {});
          }
        } catch (e) {
          await this.log(runId, 'Google: Warning clicking Yes: ' + String(e));
        }

        await page.waitForTimeout(500);

        const daleeBtn = page.getByRole('button', { name: /Далее|Next/i }).first();
        if (await daleeBtn.isVisible().catch(() => false)) {
          await daleeBtn.click();
        } else {
          await page.locator('button:has-text("Далее"), button:has-text("Next")').first().click();
        }
        continue;
      }

      // 4. Address Step - Automate filling address details
      if (await this.hasAnyVisibleText(page, [/Введите адрес/i, /Укажите адрес/i, /Address/i, /Где находится/i, /Где вы находитесь/i])) {
        await this.log(runId, 'Google: Address step detected. Filling address, index, city, province.');

        try {
          // Fill Address Line 1
          let addressInput = page.locator('input[aria-label*="Адрес, строка 1"], input[aria-label*="Street address"], input[aria-label*="Address"]').first();
          if (!await addressInput.isVisible().catch(() => false)) {
            addressInput = page.locator('input[type="text"]').nth(0);
          }
          await addressInput.waitFor({ state: 'visible', timeout: 5000 });
          await addressInput.fill(branch.address);
          await this.log(runId, `Google: Filled Address Line 1 with "${branch.address}"`);

          // Fill Index (Postal Code)
          let indexInput = page.locator('input[aria-label*="Индекс"], input[aria-label*="Postal code"], input[aria-label*="Index"]').first();
          if (!await indexInput.isVisible().catch(() => false)) {
            indexInput = page.locator('input[type="text"]').nth(1);
          }
          await indexInput.waitFor({ state: 'visible', timeout: 5000 });
          await indexInput.fill('100100');
          await this.log(runId, 'Google: Filled Index with "100100"');

          // Fill City (Город)
          let cityInput = page.locator('input[aria-label*="Город"], input[aria-label*="City"]').first();
          if (!await cityInput.isVisible().catch(() => false)) {
            cityInput = page.locator('input[type="text"]').nth(2);
          }
          await cityInput.waitFor({ state: 'visible', timeout: 5000 });
          await cityInput.fill('Ташкент');
          await this.log(runId, 'Google: Filled City with "Ташкент"');

          // Fill Province (Провинция)
          let provinceDropdown = page.getByRole('combobox', { name: /Провинция|Province/i }).first();
          if (!await provinceDropdown.isVisible().catch(() => false)) {
            provinceDropdown = page.locator('[role="combobox"]').last();
          }
          
          await provinceDropdown.waitFor({ state: 'visible', timeout: 5000 });
          await provinceDropdown.click();
          await page.waitForTimeout(1000); // wait for options to open

          let provinceOption = page.locator('[role="option"]:has-text("Ташкентская"), [role="option"]:has-text("Tashkentskaya")').first();
          if (!await provinceOption.isVisible().catch(() => false)) {
            provinceOption = page.locator('[role="option"]:has-text("Ташкент"), [role="option"]:has-text("Tashkent")').first();
          }
          if (!await provinceOption.isVisible().catch(() => false)) {
            provinceOption = page.getByText('Ташкентская').first();
          }
          if (!await provinceOption.isVisible().catch(() => false)) {
            provinceOption = page.getByText('Ташкент').first();
          }

          await provinceOption.waitFor({ state: 'visible', timeout: 5000 });
          await provinceOption.click();
          await this.log(runId, 'Google: Selected Province "Ташкентская"');

        } catch (e) {
          await this.log(runId, 'Google Address autofill failed: ' + String(e) + '. Pausing for manual entry.');
          await this.pauseForUser(runId, page, 'Не удалось автоматически заполнить адрес. Пожалуйста, заполните его вручную.');
          
          // Wait in a loop until user does it manually
          try {
            const addressInput = page.locator('input[type="text"]').first();
            await addressInput.waitFor({ state: 'hidden', timeout: 300_000 });
          } catch {}
          continue;
        }

        await page.waitForTimeout(1000);

        // Click Далее/Next
        const daleeBtn = page.getByRole('button', { name: /Далее|Next/i }).first();
        if (await daleeBtn.isVisible().catch(() => false)) {
          await daleeBtn.click();
        } else {
          await page.locator('button:has-text("Далее"), button:has-text("Next")').first().click();
        }
        continue;
      }

      // 4.5. Duplicate Check Step ("Это ваша компания?")
      if (await this.hasAnyVisibleText(page, [/Это ваша компания/i, /Is this your business/i, /Is this your company/i])) {
        await this.log(runId, 'Google: Duplicate check step detected. Selecting "None of these/Ничего не подходит" if visible.');

        // Find and select "None of these" option (usually "Ничего не подходит" or "Ни одна из них")
        const noneOption = page.locator('label:has-text("Ничего не подходит"), label:has-text("Ни одна"), label:has-text("None"), label:has-text("Это не моя")').first()
          .or(page.getByText(/Ничего не подходит/i).first())
          .or(page.getByText(/Ни одна из этих/i).first())
          .or(page.getByText(/Это не моя/i).first());

        if (await noneOption.isVisible().catch(() => false)) {
          await noneOption.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(200);
          await noneOption.click();
          await this.log(runId, 'Google: Selected "None of these/Ничего не подходит"');
        } else {
          // Attempt to scroll page down to reveal the option if it is hidden below the fold
          await page.evaluate(() => window.scrollBy(0, 400)).catch(() => {});
          await page.waitForTimeout(500);

          if (await noneOption.isVisible().catch(() => false)) {
            await noneOption.scrollIntoViewIfNeeded().catch(() => {});
            await noneOption.click();
            await this.log(runId, 'Google: Selected "None of these/Ничего не подходит" after scrolling');
          } else {
            await this.log(runId, 'Google: Option "None of these" not visible even after scrolling. Pausing for user.');
            await this.pauseForUser(runId, page, 'Пожалуйста, выберите "Ничего не подходит" и нажмите Далее.');
            try {
              await page.waitForFunction(() => !document.body.innerText.includes("Это ваша компания"), { timeout: 300_000 });
            } catch {}
            continue;
          }
        }

        await page.waitForTimeout(500);

        const daleeBtn = page.getByRole('button', { name: /Далее|Next/i }).first();
        if (await daleeBtn.isVisible().catch(() => false)) {
          await daleeBtn.click();
        } else {
          await page.locator('button:has-text("Далее"), button:has-text("Next")').first().click();
        }
        continue;
      }

      // 4.6. Delivery/Service Area step ("Вы предлагаете доставку или выезжаете к клиентам?")
      if (
        await this.hasAnyVisibleText(page, [
          /Вы предлагаете доставку/i,
          /выезжаете к клиентам/i,
          /Do you provide deliveries/i
        ])
      ) {
        await this.log(runId, 'Google: Delivery/Service area step detected. Selecting No (Нет).');

        const noRadio = page.getByLabel(/^Нет$|^No$/i).first();
        const noText = page.getByText(/^Нет$|^No$/i).first();
        const noLabel = page.locator('label:has-text("Нет"), label:has-text("No")').first();

        try {
          if (await noRadio.isVisible().catch(() => false)) {
            await noRadio.click();
          } else if (await noText.isVisible().catch(() => false)) {
            await noText.click();
          } else if (await noLabel.isVisible().catch(() => false)) {
            await noLabel.click();
          } else {
            // Fallback: click the second radio button (usually "Нет" is the second option)
            await page.locator('input[type="radio"]').nth(1).click().catch(() => {});
          }
        } catch (e) {
          await this.log(runId, 'Google: Warning clicking No: ' + String(e));
        }

        await page.waitForTimeout(500);

        const daleeBtn = page.getByRole('button', { name: /Далее|Next/i }).first();
        if (await daleeBtn.isVisible().catch(() => false)) {
          await daleeBtn.click();
        } else {
          await page.locator('button:has-text("Далее"), button:has-text("Next")').first().click();
        }
        continue;
      }

      // 5. Contact Info Step
      if (await this.hasAnyVisibleText(page, [/Укажите контактные данные/i, /Contact info/i, /Номер телефона/i])) {
        await this.log(runId, 'Google: Contact step detected. Filling details.');
        const phoneInput = page.locator('input[type="tel"]').first();
        if (await phoneInput.isVisible().catch(() => false)) {
          let phoneValue = branch.phone || '';
          const digits = phoneValue.replace(/\D/g, '');
          if (digits.length === 9) {
            phoneValue = `+998${digits}`;
          } else if (digits.length === 12 && digits.startsWith('998')) {
            phoneValue = `+${digits}`;
          }
          await phoneInput.fill(phoneValue);
        }

        const webInput = page.locator('input[type="url"]').first();
        if (await webInput.isVisible().catch(() => false)) {
          await webInput.fill(branch.website || '');
        }

        const daleeBtn = page.getByRole('button', { name: /Далее|Next/i }).first();
        await daleeBtn.click();
        continue;
      }

      // 5.5. Verification Method Step ("Выберите способ подтверждения")
      if (await this.hasAnyVisibleText(page, [/Выберите способ подтверждения/i, /Choose a way to verify/i, /Способ подтверждения/i])) {
        await this.log(runId, 'Google: Verification step detected. Clicking "Verify later/Подтвердить позже".');

        const laterBtn = page.locator('button:has-text("Подтвердить позже"), a:has-text("Подтвердить позже"), div:has-text("Подтвердить позже"), span:has-text("Подтвердить позже")').last()
          .or(page.getByText(/Подтвердить позже|Verify later/i).first())
          .or(page.getByRole('button', { name: /Подтвердить позже|Verify later/i }).first());

        if (await laterBtn.isVisible().catch(() => false)) {
          await laterBtn.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(200);
          await laterBtn.click();
          await this.log(runId, 'Google: Clicked "Verify later/Подтвердить позже"');
        } else {
          await this.log(runId, 'Google: "Verify later" option not visible. Pausing for user.');
          await this.pauseForUser(runId, page, 'Пожалуйста, выберите "Подтвердить позже" вручную в окне Chrome.');
          try {
            await page.waitForFunction(() => !document.body.innerText.includes("Выберите способ подтверждения"), { timeout: 300_000 });
          } catch {}
          continue;
        }

        await page.waitForTimeout(1000);
        continue;
      }

      // 5.6. Skip Optional Steps (Services, Hours, Messaging, Photos, Description, etc.)
      if (
        await this.hasAnyVisibleText(page, [
          /Добавить услуги/i,
          /Укажите часы работы/i,
          /Добавить обмен сообщениями/i,
          /Добавить описание/i,
          /Добавить фотографии/i,
          /Увеличьте эффективность/i,
          /Получите купон/i,
          /Add services/i,
          /Add business hours/i,
          /Add messaging/i,
          /Add description/i,
          /Add photos/i
        ])
      ) {
        await this.log(runId, `Google: Optional step "${titleText}" detected. Clicking Пропустить/Skip.`);

        const skipBtn = page.getByRole('button', { name: /Пропустить|Skip/i }).first()
          .or(page.locator('button:has-text("Пропустить")').first())
          .or(page.locator('button:has-text("Skip")').first());

        if (await skipBtn.isVisible().catch(() => false)) {
          await skipBtn.click();
          await this.log(runId, 'Google: Clicked "Пропустить/Skip"');
        } else {
          // If skip is not visible, maybe there's only "Далее" (Next) or "Не сейчас"
          const nextBtn = page.getByRole('button', { name: /Далее|Next|Не сейчас/i }).first();
          if (await nextBtn.isVisible().catch(() => false)) {
            await nextBtn.click();
            await this.log(runId, 'Google: Clicked "Далее/Next" as fallback');
          } else {
            await this.log(runId, 'Google: No skip/next button found. Pausing for user.');
            await this.pauseForUser(runId, page, `Пожалуйста, пройдите шаг "${titleText}" вручную.`);
            try {
              await page.waitForFunction((t) => !document.body.innerText.includes(t), titleText, { timeout: 300_000 });
            } catch {}
          }
        }

        await page.waitForTimeout(1000);
        continue;
      }

      // 6. Generic/Fallback step: if we don't recognize the screen, block and let the user do it
      await this.log(runId, `Google: Reached screen "${titleText}" that is not fully automated. Waiting for user interaction...`);
      await this.pauseForUser(runId, page, `Пожалуйста, заполните информацию на шаге: "${titleText}" в окне Chrome.`);

      // Wait until the title changes (meaning user clicked Next or navigated away)
      try {
        await page.waitForFunction(
          (oldTitle) => {
            const h1 = document.querySelector('h1, h2, .C70G6c');
            return !h1 || h1.textContent !== oldTitle;
          },
          titleText,
          { timeout: 300_000 }
        );
        
        await this.log(runId, 'Google: Fallback step finished by user. Resuming.');
        await prisma.automationRun.update({
          where: { id: runId },
          data: { status: AutomationStatus.RUNNING }
        });
      } catch (e) {
        await this.log(runId, 'Google: Timeout waiting for user interaction on fallback step. Closing.');
        throw new Error('Timeout waiting for user interaction');
      }
      continue;
    }
  }

  protected async applyWorkingHours(page: Page, workingHours: unknown) {
    if (workingHours) {
      await page.evaluate((hours) => {
        window.localStorage.setItem('google-business-working-hours-draft', JSON.stringify(hours));
      }, workingHours);
    }
  }
}
