// Shared by the browser checks: creates a throwaway account through the real sign-in page. Clerk development instances
// treat any "+clerk_test" address as a test address: no email is sent and the code is always 424242.
export const TEST_PASSWORD = "Correct-Horse-Battery-71";
export const TEST_CODE = "424242";
export const testEmail = (tag) => `${tag}-${Date.now()}+clerk_test@example.com`;

export async function createAccount(page, base, email, next = "/") {
  await page.goto(`${base}/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.fill("#email", email);
  await page.fill("#password", TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account", exact: true }).last().click();
  await enterCode(page);
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 30000 });
}

export async function signInWithPassword(page, base, email, password = TEST_PASSWORD) {
  await page.goto(`${base}/sign-in`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  // A device Clerk hasn't seen asks for an emailed code first.
  if (await page.locator("#code").waitFor({ timeout: 4000 }).then(() => true, () => false)) await enterCode(page);
}

async function enterCode(page) {
  await page.locator("#code").waitFor({ timeout: 20000 });
  await page.fill("#code", TEST_CODE);
  await page.getByRole("button", { name: /Continue|Save and sign in/ }).click();
}
