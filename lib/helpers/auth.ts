import { APIRequestContext, Page, expect } from '@playwright/test';

export async function loginToUserList(page: Page) {
  console.info('[Auth] Opening the user management page.');
  await page.goto('https://dev.snippetsentry.com/app/client/users');
  console.info('[Auth] Submitting the login form.');
  await page.getByRole('textbox', { name: 'Email*' }).fill('taylor.chris2011@gmail.com');
  await page.getByRole('textbox', { name: 'Password*' }).fill('T3stMySkills!');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.locator('#button-addNewUser')).toContainText('Add User');
  console.info('[Auth] Login complete; the user list is ready.');
}

const GRAPHQL_URL = 'https://dev.snippetsentry.com/graphql';

/** Reuses the browser's authenticated session for direct GraphQL requests. */
export async function getAppIdToken(page: Page): Promise<string> {
  console.info('[Auth] Reading the appIdToken cookie from the authenticated browser context.');
  const cookies = await page.context().cookies('https://dev.snippetsentry.com');
  const authCookie = cookies.find((c) => c.name === 'appIdToken');

  if (!authCookie || !authCookie.value) {
    throw new Error("Could not find 'appIdToken' cookie in the browser context. Ensure you are logged in first!");
  }

  console.info('[Auth] Authentication cookie found; value omitted from logs.');
  return authCookie.value;
}

export async function sendInviteEmailApi(
  request: APIRequestContext,
  email: string,
  appIdToken: string
) {
  console.info(`[Auth API] Sending invite request for ${email}.`);
  const response = await request.post(GRAPHQL_URL, {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Cookie': `appIdToken=${appIdToken}`,
    },
    data: {
      operationName: 'AuthzSendInviteEmail',
      query: `
        mutation AuthzSendInviteEmail($query: VerifyUserEmailQuery!) {
          AuthzSendInviteEmail(query: $query) {
            result
            __typename
          }
        }
      `,
      variables: {
        query: {
          email: email,
          sendInviteEmail: true,
        },
      },
    },
  });

  console.info(`[Auth API] Invite request for ${email} returned HTTP ${response.status()}.`);
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  expect(json.errors).toBeUndefined();
  console.info(`[Auth API] Invite request accepted for ${email}: ${json.data.AuthzSendInviteEmail.result}.`);
  return json.data.AuthzSendInviteEmail;
}

