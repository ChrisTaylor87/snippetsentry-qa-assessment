import { test, expect } from '@playwright/test';
import { loginToUserList, getAppIdToken, sendInviteEmailApi } from '../lib/helpers/auth';
import { deleteUsersExcept, expectAndDismissToast, verifyUserStatusTooltip } from '../lib/helpers/userlist';
import { UserListPage } from '../lib/pages/userlist.page';
import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';

type ExportedUser = {
    Name: string;
    Status: string;
    Email: string;
};

function parseExportedUsers(csv: string): ExportedUser[] {
    return parse(csv, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        trim: true,
    }) as ExportedUser[];
}

function sortUsersByEmail(users: ExportedUser[]): ExportedUser[] {
    return [...users].sort((first, second) => first.Email.localeCompare(second.Email));
}

test.describe('User Management Tests', () => {
    // These tests share a dev tenant, cleanup preserves the main admin, 
    // and the suite is serial to prevent overlapping changes. 
    test.describe.configure({ mode: 'serial' });

    test.beforeEach(async ({ page }) => {
        console.info('[Test Setup] Preparing a clean user list before the next test.');
        await loginToUserList(page);
        await deleteUsersExcept(page, 'taylor.chris2011@gmail.com');
    });

    test('Add Single User', async ({ page, request }) => {
        console.info('[Add Single User] Verifying list controls and creating the UI/API test account.');
        // The following assertions check for the presence of the buttons on the page
        await expect(page.locator('#button-addNewUser')).toContainText('Add User');
        await expect(page.locator('#manage-user-data-table-virtual')).toContainText('Bulk Upload');
        await expect(page.locator('#manage-user-data-table-virtual')).toContainText('Bulk Invite');
        await expect(page.locator('#button-exportCSV')).toContainText('Export');
        await expect(page.locator('#manage-user-data-table-virtual')).toContainText('Clear Filters');
        const userListPage = new UserListPage(page);
        await userListPage.addUser({
            firstName: 'UI/API',
            lastName: 'Tester',
            email: 'taylor.chris2011+test10@gmail.com',
            isAdmin: true,
            isInvited: false
        });
        await expectAndDismissToast(page, 'User added successfully');

        const row = userListPage.userRowByEmail('taylor.chris2011+test10@gmail.com');

        await expect(row.getByText('Pending', { exact: true })).toBeVisible();
        await expect(page.locator('tbody')).toContainText('Pending');
        console.info('[Add Single User] UI verification complete for UI/API Tester; proceeding to send an invite via API.');

        // Now that the user has been created, we will use the API to send an invite to the user 

        // Grab the live session token dynamically from the browser context to trigger the invite via API
        const appIdToken = await getAppIdToken(page);
        const inviteResult = await sendInviteEmailApi(request, 'taylor.chris2011+test10@gmail.com', appIdToken);
        expect(inviteResult.result).toBe('OK_VALID_EMAIL');
        console.info('[Add Single User] API invite was accepted; verifying the invited status in the UI.');

        await userListPage.openUserByEmail('taylor.chris2011+test10@gmail.com');
        await expect(page.getByTestId('sent-email-count-text')).toContainText('Invitation sent: 1');
        await page.goto('https://dev.snippetsentry.com/app/client/users');
        await expect(row.getByText('Invited', { exact: true })).toBeVisible();
        await expect(page.locator('tbody')).toContainText('Invited');
        // ADD THE CONFIRMATION OF THE USER HERE. 
    });

    test('Bulk Upload Users', async ({ page }) => {
        console.info('[Bulk Upload] Opening the upload dialog and selecting the valid CSV fixture.');
        await page.getByRole('button', { name: 'Bulk Upload' }).click();
        // The following assertions check for the presence of specific text and buttons in the bulk upload modal
        await expect(page.getByRole('dialog')).toContainText('Please modify the template in a CSV editor only. Using Google Sheets or Microsoft Excel can cause formatting issues.');
        await expect(page.getByRole('dialog')).toContainText('Add Bulk Users');
        // The below assertion has a 'hard coded' value of the company name, which is not ideal
        // If I knew where that data is configured I would make it dynamic, but for now this will work for the purposes of this test
        await expect(page.getByRole('dialog')).toContainText('Select Customer*Christopher Taylor\'s CompanySelect Customer*');
        await expect(page.getByRole('button', { name: 'Download the bulk upload' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
        
        // The following code takes defined csv files saved in the repo to test the bulk upload functionality. The files are located in the root of the repo and are named bulkUpload5Valid.csv, bulkUploadDupeEmail.csv, and bulkUploadBadData.csv.
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.getByRole('button', { name: 'Browse' }).click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles('bulkUpload5Valid.csv');
        await page.getByTestId('upload-bulk-users').click();
        await expectAndDismissToast(page, 'Bulk users upload successfully');
        console.info('[Bulk Upload] Upload completed; verifying each fixture user is Pending.');
        

        const userListPage = new UserListPage(page);
        for (const email of [
            'test1@test.com',
            'test2@test.com',
            'test3@test.com',
            'test4@test.com',
            'test5@test.com',
        ]) {
            await userListPage.searchForUser(email);
            const row = userListPage.userRowByEmail(email);
            await expect(row).toHaveCount(1);
            await expect(row.getByText('Pending', { exact: true })).toBeVisible();
        } 
        await userListPage.searchForUser('');
        
    });
    test('Bulk Invite Users', async ({ page }) => {
        console.info('[Bulk Invite] Creating three independent accounts for the invitation workflow.');
        const userListPage = new UserListPage(page);
        const bulkInviteUsers = [
            { firstName: 'Bulk', lastName: 'Invite1', email: 'bulk-invite-1@test.com' },
            { firstName: 'Bulk', lastName: 'Invite2', email: 'bulk-invite-2@test.com' },
            { firstName: 'Bulk', lastName: 'Invite3', email: 'bulk-invite-3@test.com' },
        ];
        for (const user of bulkInviteUsers) {
            await userListPage.addUser(user);
            await expectAndDismissToast(page, 'User added successfully');
        }

        const row1 = userListPage.userRowByEmail('bulk-invite-1@test.com');
        const row2 = userListPage.userRowByEmail('bulk-invite-2@test.com');
        const row3 = userListPage.userRowByEmail('bulk-invite-3@test.com');
        
        await row1.getByRole('checkbox').check();
        await row2.getByRole('checkbox').check();
        await row3.getByRole('checkbox').check();
        // Getting a count of the number of users that were selected to be able to verify in the dialog of the modal
        const checkedUserCount = await page.locator('#virtualTable tbody input[type="checkbox"]:checked').count();
        console.info(`[Bulk Invite] ${checkedUserCount} user rows selected; opening the confirmation dialog.`);
        await page.getByRole('button', { name: 'Bulk Invite' }).click();
        await expect(page.getByRole('dialog')).toContainText(`You are going to send an invite to ${checkedUserCount} user(s). SnippetSentry™ invites can only be sent to user accounts that are in a pending or invited status. Selected users that are already Active will not receive an email.`);
        await expect(page.getByRole('dialog')).toContainText('Bulk Invite');
        await expect(page.getByTestId('cancel')).toBeVisible();
        await expect(page.getByTestId('confirm')).toBeVisible();
        // await expect(page.getByTestId('confirm')).toBeVisible();
        // Just showing a different locator that can be used.
        await page.getByTestId('confirm').click();
        await expectAndDismissToast(page, 'All invitations were sent successfully');
        console.info('[Bulk Invite] Invite request completed; verifying each selected user is Invited.');
        
        // Looping through the selected users to verify their status was updated
        for (const email of [
            'bulk-invite-1@test.com',
            'bulk-invite-2@test.com',
            'bulk-invite-3@test.com',
        ]) {
            const row = userListPage.userRowByEmail(email);
            await expect(row).toHaveCount(1);
            await expect(row.getByText('Invited', { exact: true })).toBeVisible();
        }
        
    });

    test('Modify User workflow', async ({ page, headless }, testInfo) => {
        console.info('[Modify User] Creating independent accounts for invite, delete, suspend, and status checks.');
        const userListPage = new UserListPage(page);
        const modifyUsers = [
            { firstName: 'Modify', lastName: 'Invite', email: 'modify-invite@test.com' },
            { firstName: 'Modify', lastName: 'Delete', email: 'modify-delete@test.com' },
            { firstName: 'Modify', lastName: 'Suspended', email: 'modify-suspended@test.com' },
            { firstName: 'Modify', lastName: 'Pending', email: 'modify-pending@test.com' }
        ];
        for (const user of modifyUsers) {
            await userListPage.addUser(user);
            await expectAndDismissToast(page, 'User added successfully');
        }

        const testUser1 = userListPage.userRowByEmail('modify-invite@test.com');
        const testUser2 = userListPage.userRowByEmail('modify-delete@test.com');
        const testUser3 = userListPage.userRowByEmail('modify-suspended@test.com');
        const testUser4 = userListPage.userRowByEmail('modify-pending@test.com');

        // This portion verifies the the presense of elements on the Modify User modal.
        await testUser1.getByTestId('user-name-in-list').click();
        await expect(page.getByRole('navigation')).toContainText('Modify User');
        const customerNameField = userListPage.customerNameField();
        await expect(customerNameField).toHaveValue("Christopher Taylor's Company");
        await expect(customerNameField).toBeDisabled();
        await expect(userListPage.emailField()).toHaveValue('modify-invite@test.com');
        await expect(userListPage.emailField()).toBeDisabled();

        await expect(page.getByRole('textbox', { name: 'Notes' })).toBeEmpty();
        await expect(page.locator('form')).toContainText('Send email invite');
        await expect(page.getByTestId('sent-email-count-text')).toContainText('Invitation sent: 0');
        await page.getByTestId('send-email-invite-button').click();
        await expect(page.getByTestId('sent-email-count-text')).toContainText('Invitation sent: 1');

        await expect(page.getByTestId('archive-button')).toContainText('Suspend');
        await expect(page.getByTestId('delete-user-button')).toContainText('Delete');
        await expect(page.getByTestId('cancel-user-drawer')).toContainText('Cancel');
        await expect (page.getByTestId('save-user')).toContainText('Save');

        const statusTable = page.locator('.v-expansion-panel').filter({ hasText: 'Status Table' });
        await statusTable.scrollIntoViewIfNeeded();
        await expect(statusTable).toBeVisible();
        headless
            ? await expect(page).toHaveScreenshot('StatusTable.png', { maxDiffPixelRatio: 0.01 })
            : console.log('Skipping screenshot comparison in headed mode');

        await page.getByRole('textbox', { name: 'Notes' }).fill('This is a test note');
        await page.getByTestId('save-user').click();
        await expectAndDismissToast(page, 'User Updated successfully');
        await expect(page.getByRole('textbox', { name: 'Notes' })).toHaveValue('This is a test note');

        await page.getByTestId('cancel-user-drawer').click();
    
        // Here we are going to delete a User and verify it's been deleted searching the current 
        // DOM for the deleted user
        await testUser2.getByTestId('user-name-in-list').click();
        await page.getByTestId('delete-user-button').click();
        await expect(page.getByRole('dialog')).toContainText('Please Confirm');
        await expect(page.getByRole('dialog')).toContainText('Are you sure you want to update status of this user?');
        await expect(page.getByTestId('cancel')).toBeVisible();
        await expect(page.getByTestId('confirm')).toBeVisible();
        await page.getByTestId('confirm').click();
        await expectAndDismissToast(page, 'User status updated successfully');
        await userListPage.searchForUser('modify-delete@test.com');
        await expect(testUser2).toHaveCount(0);
        await userListPage.searchForUser('');

        // Here we are going to change the status of a user to suspended and verify 
        // the status has been updated 
        await userListPage.searchForUser('modify-suspended@test.com');
        await testUser3.getByTestId('user-name-in-list').click();
        await page.getByTestId('archive-button').click();
        const suspendDialog = page.getByRole('dialog');
        await expect(suspendDialog).toContainText('Please Confirm');
        await suspendDialog.getByTestId('confirm').click();
        await expectAndDismissToast(page, 'User status updated successfully');
        await userListPage.searchForUser('modify-suspended@test.com');
        await expect(testUser3.getByText('Suspended', { exact: true })).toBeVisible();

        await userListPage.searchForUser('modify-pending@test.com');
        await expect(testUser4.getByText('Pending', { exact: true })).toBeVisible();
        await userListPage.searchForUser('');

        // This next portion is validation of the hover tooltips
        const testCases = [
        { email: 'modify-pending@test.com', expectedTooltip: 'User added but not invited; no login yet. User may have pre-configured devices.' },
        { email: 'taylor.chris2011@gmail.com', expectedTooltip: 'User has logged in.' },
        { email: 'modify-invite@test.com', expectedTooltip: 'User invited to set a password and log in.' },
        { email: 'modify-suspended@test.com', expectedTooltip: 'User cannot log into the system' },
        ];

        for (const { email, expectedTooltip } of testCases) {
            await verifyUserStatusTooltip(page, email, expectedTooltip);
        }
        //TODO: Add a Login Test to check for the suspended user not being able to login

        // This next section is testing the filters and the export functionality
        await page.getByRole('textbox', { name: 'Search' }).click();
        await page.getByRole('textbox', { name: 'Search' }).fill('Modify-');
        const modifyRows = page.locator('#virtualTable tbody tr').filter({
            has: page.getByTestId('user-name-in-list'),
        });
        await expect(modifyRows).toHaveCount(3);
        for (let index = 0; index < 3; index++) {
            await expect(modifyRows.nth(index).locator('td').last()).toHaveText(/^modify-/i);
        }

        // Here we are downloading the filtered list of users and comparing it to a known good CSV file 
        // that is stored in the repo. The file is named exportedUsers.csv 
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Export', exact: true }).click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.csv$/i);

        const downloadPath = testInfo.outputPath(download.suggestedFilename());
        await download.saveAs(downloadPath);

        const [expectedCsv, actualCsv] = await Promise.all([
            readFile('exportedUsers.csv', 'utf8'),
            readFile(downloadPath, 'utf8'),
        ]);
        const actualUsers = sortUsersByEmail(parseExportedUsers(actualCsv));
        const expectedUsers = sortUsersByEmail(parseExportedUsers(expectedCsv));
        console.info(`[Export] Downloaded ${download.suggestedFilename()} with ${actualUsers.length} records; comparing with the expected fixture.`);
        expect(actualUsers).toEqual(expectedUsers);
        console.info('[Export] Downloaded CSV matches exportedUsers.csv.');

        await page.getByRole('button', { name: 'Clear Filters' }).click();
        
        const userStatusFilter = page.getByRole('combobox', {
            name: 'Select User Status',
            exact: true,
        });
        await userStatusFilter.press('ArrowDown');
        await page.getByRole('option', { name: 'Active' }).click();
        await expect(modifyRows).toHaveCount(1);
        await expect(page.locator('tbody')).toContainText('Active');

        await page.getByRole('button', { name: 'Clear Filters' }).click();
        await userListPage.searchForUser('Modify-');
        await userStatusFilter.press('ArrowDown');
        await page.getByRole('option', { name: 'Suspended' }).click();
        await expect(modifyRows).toHaveCount(1);
        await expect(page.locator('tbody')).toContainText('Suspended');

        await userStatusFilter.press('ArrowDown');
        await page.getByRole('option', { name: 'Invited' }).click();
        await expect(modifyRows).toHaveCount(1);
        await expect(page.locator('tbody')).toContainText('Invited');

        await userStatusFilter.press('ArrowDown');
        await page.getByRole('option', { name: 'Pending' }).click();
        await expect(modifyRows).toHaveCount(1);
        await expect(page.locator('tbody')).toContainText('Pending');
        
        await page.getByRole('button', { name: 'Clear Filters' }).click();
        await userListPage.searchForUser('Modify-');
        await expect(modifyRows).toHaveCount(3);

    });
       
});
