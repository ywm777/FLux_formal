import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test.describe("全链路", () => {
  test("本地工作台 → 云端登录 → 空白画布 → 发布", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
    await expect(page.getByText("本地空间").first()).toBeVisible();

    await page.getByRole("button", { name: "打开空间菜单" }).click();
    await page.getByRole("menuitem", { name: "切换到云端空间" }).click();
    await expect(page.getByRole("dialog", { name: "登录云端空间" })).toBeVisible();

    await page.getByRole("tab", { name: "注册", exact: true }).click();
    await page.getByLabel("昵称（可选）").fill("E2E");
    await page.getByLabel("邮箱").fill(`e2e-${Date.now()}@example.com`);
    await page.getByLabel("密码", { exact: true }).fill("password123");
    await page.getByLabel("确认密码", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "注册并登录" }).click();

    await expect(page.getByRole("dialog", { name: "登录云端空间" })).toHaveCount(0);
    await expect(page.getByText("云端空间").first()).toBeVisible();
    await page.getByRole("button", { name: "新建工作流" }).click();
    await expect(page.locator(".react-flow")).toBeVisible();
    await expect(page.locator(".react-flow__node")).toHaveCount(0);

    const published = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/api\/workflows\/[^/]+\/publish$/.test(response.url()),
    );
    const publish = page.getByTitle("发布工作流");
    await expect(publish).toBeVisible();
    await publish.click();
    expect((await published).ok()).toBe(true);
    await page.screenshot({
      path: join(tmpdir(), "flux-full-chain-success.png"),
      fullPage: false,
    });

    expect(consoleErrors).toEqual([]);
  });
});
