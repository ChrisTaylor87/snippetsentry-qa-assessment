import { expect, Locator, Page } from '@playwright/test';

export class UserListPage {
	constructor(private readonly page: Page) {}

	async addUser(user: {
		firstName: string;
		lastName: string;
		email: string;
		isAdmin?: boolean;
        isInvited?: boolean;
	}) {
		console.info(`[UserListPage] Starting user creation for ${user.firstName} ${user.lastName} (${user.email})${user.isAdmin ? ' (admin)' : ''}.`);
		await this.page.getByRole('button', { name: 'Add User' }).click();
		if (user.isAdmin) {
			await this.page.getByRole('checkbox', { name: 'Admin' }).check();
		}
		await this.page.getByRole('textbox', { name: 'First Name*' }).fill(user.firstName);
		await this.page.getByRole('textbox', { name: 'Last Name*' }).fill(user.lastName);
		await this.page.getByRole('textbox', { name: 'Email*' }).fill(user.email);
		await this.page.getByTestId('save-user').click();
		console.info(`[UserListPage] Submitted the Add User form for ${user.firstName} ${user.lastName} (${user.email}).`);
	}

	userRowByEmail(email: string): Locator {
		return this.page.getByRole('row').filter({
			has: this.page.getByText(email, { exact: true }),
		});
	}

	async openUserByEmail(email: string) {
		console.info(`[UserListPage] Opening the user record for ${email}.`);
		const row = this.userRowByEmail(email);
		await expect(row).toHaveCount(1);
		await row.getByTestId('user-name-in-list').click();
		console.info(`[UserListPage] Opened the user record for ${email}.`);
	}

	async searchForUser(email: string) {
		console.info(`[UserListPage] Filtering the user list by ${email || '(no filter)'}.`);
		await this.page.getByRole('textbox', { name: 'Search', exact: true }).fill(email);
	}

	customerNameField(): Locator {
		return this.page.getByRole('textbox', { name: 'Customer Name', exact: true });
	}

	emailField(): Locator {
		return this.page.getByRole('textbox', { name: 'Email*', exact: true });
	}
}
