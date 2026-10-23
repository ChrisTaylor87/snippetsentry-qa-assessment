import { Page, expect } from '@playwright/test';

/**
 * Verifies the status tooltip for the user matched by exact email.
 *
 * @param page - Playwright page showing the user list
 * @param userEmail - Exact email address used to locate the user row
 * @param expectedTooltipText - Expected text displayed in the status tooltip
 */
export async function verifyUserStatusTooltip(
  page: Page,
  userEmail: string,
  expectedTooltipText: string
) {
  console.info(`[Status Tooltip] Locating the status chip for ${userEmail}.`);
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill(userEmail);

  const userRow = page.getByRole('row').filter({
    has: page.getByText(userEmail, { exact: true }),
  });
  await expect(userRow).toHaveCount(1);

  const statusChip = userRow.locator('.v-chip');
  await expect(statusChip).toBeVisible();
  await statusChip.hover();

  const tooltipId = await statusChip.getAttribute('aria-describedby');
  
  if (!tooltipId) {
    throw new Error(`Could not find 'aria-describedby' attribute on status chip for user: ${userEmail}`);
  }

  const tooltip = page.locator(`#${tooltipId}`);
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(expectedTooltipText);
  console.info(`[Status Tooltip] Verified tooltip for ${userEmail}.`);
}

// This function is used to clean up the user list by deleting all users except 
// for the specified preserved emails (The main admin for the customer). 
// It is useful for maintaining a clean state in tests that share a common environment.
export async function deleteUsersExcept(page: Page, preservedEmails: string | string[]) {
  const rows = page.locator('#virtualTable tbody tr');
  const search = page.getByRole('textbox', { name: 'Search', exact: true });
  const emailsToPreserve = Array.isArray(preservedEmails) ? preservedEmails : [preservedEmails];
  const requiredEmail = emailsToPreserve[0];

  if (!requiredEmail) {
    throw new Error('At least one email must be provided to preserve.');
  }

  console.info(`[Cleanup] Starting user-list cleanup; preserving ${emailsToPreserve.join(', ')}.`);
  const requiredRow = rows.filter({
    has: page.getByText(requiredEmail, { exact: true }),
  });
  await search.fill(requiredEmail);
  await expect(requiredRow).toHaveCount(1);
  console.info(`[Cleanup] Verified required account ${requiredEmail} is present.`);
  await search.fill('');

  while (true) {
    let emailToDelete: string | undefined;

    for (let index = 0; index < await rows.count(); index++) {
      const email = (await rows.nth(index).locator('td').last().innerText()).trim();
      if (email && !emailsToPreserve.includes(email)) {
        emailToDelete = email;
        break;
      }
    }

    if (!emailToDelete) {
      break;
    }

    const userRow = rows.filter({
      has: page.getByText(emailToDelete, { exact: true }),
    });
    console.info(`[Cleanup] Removing leftover account ${emailToDelete}.`);
    await userRow.getByTestId('user-name-in-list').click();
    await page.getByTestId('delete-user-button').click();
    await page.getByTestId('confirm').click();
    await expectAndDismissToast(page, 'User status updated successfully');
    await expect(userRow).toHaveCount(0);
    console.info(`[Cleanup] Removed ${emailToDelete}.`);
  }

  await search.fill(requiredEmail);
  await expect(requiredRow).toHaveCount(1);
  await search.fill('');
  console.info('[Cleanup] Complete; protected account remains in the user list.');
}

export async function expectAndDismissToast(page: Page, message: string) {
    const toast = page.getByRole('alert')
        .filter({ hasText: message })
    .last()
    .locator('xpath=..');

    await expect(toast).toBeVisible();
    await expect(toast).toContainText(message);
    console.info(`[Toast] Verified notification: ${message}`);
  const toastTestId = await toast.getAttribute('data-testid');
  if (!toastTestId) {
    throw new Error(`Could not find a test ID for toast: ${message}`);
  }

    await toast.getByRole('button', { name: 'close' }).click();
    console.info(`[Toast] Requested dismissal: ${message}`);
}