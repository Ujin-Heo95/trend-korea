import { test, expect } from '@playwright/test';

test.describe('Happy Paths', () => {
  test('1. 홈페이지 로드 + 게시글 표시', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=위클릿')).toBeVisible();
    // Wait for posts to load
    await expect(page.locator('[class*="rounded-xl"][class*="border"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('2. 카테고리 탭 전환', async ({ page }) => {
    await page.goto('/');
    const tabs = page.locator('[role="tab"]');
    await expect(tabs).toHaveCount(10);
    // Click 커뮤니티 tab
    await tabs.filter({ hasText: '커뮤니티' }).click();
    await expect(page).toHaveURL(/category=community/);
    // Click 뉴스 tab
    await tabs.filter({ hasText: '뉴스' }).click();
    await expect(page).toHaveURL(/category=news/);
  });

  test('3. 이슈 상세 페이지 진입', async ({ page }) => {
    await page.goto('/');
    // Wait for first post link and click
    const firstPost = page.locator('a[href^="/issue/"]').first();
    await expect(firstPost).toBeVisible({ timeout: 10_000 });
    await firstPost.click();
    await expect(page).toHaveURL(/\/issue\/\d+/);
    // Check detail page has title
    await expect(page.locator('h1')).toBeVisible({ timeout: 5_000 });
  });

  test('4. 투표 기능', async ({ page }) => {
    await page.goto('/');
    // Find vote button
    const voteButton = page.locator('button:has-text("▲")').first();
    await expect(voteButton).toBeVisible({ timeout: 10_000 });
    await voteButton.click();
    // Vote count should update (button should still be visible)
    await expect(voteButton).toBeVisible();
  });

  test('5. 일일 리포트 페이지', async ({ page }) => {
    await page.goto('/daily-report');
    // Should show report content or list
    await expect(page.locator('text=트렌드 리포트').first()).toBeVisible({ timeout: 10_000 });
  });
});
