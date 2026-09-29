import { expect, test } from '@playwright/test';

/**
 * P0 冒烟（04 §7）：登录页渲染 + 双语切换（T0.8 验收路径）。
 * 注册→落笔全链路需要 API + PG，用 E2E_API=1 显式开启（CI 有全栈时跑）。
 */
test('登录页渲染（zh-CN 默认）', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '登录 Linkbase' })).toBeVisible();
  await expect(page.getByLabel('邮箱')).toBeVisible();
});

test('切换语言后文案变 en', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('语言').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Sign in to Linkbase' })).toBeVisible();
});

test.describe('注册 → 直接进入工作空间（零仪式，02 §1.1）', () => {
  test.skip(!process.env.E2E_API, '需要 API + PostgreSQL（E2E_API=1）');

  test('注册后无任何建容器步骤即可看到快速开始页', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('昵称').fill('E2E 用户');
    await page.getByLabel('邮箱').fill(`e2e-${Date.now()}@linkbase.test`);
    await page.getByLabel('密码').fill('password-123');
    await page.getByRole('button', { name: '注册并进入' }).click();
    await expect(page.getByText('快速开始')).toBeVisible({ timeout: 10_000 });
  });
});
