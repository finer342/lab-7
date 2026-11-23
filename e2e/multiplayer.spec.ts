import { test, expect } from '@playwright/test';

test.describe('Multiplayer room synchronization & chat', () => {
  test('second browser sees first player movement and receives chat messages', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await page1.goto('/');
    await page2.goto('/');

    await expect(page1.locator('#status')).toHaveText('Connected');
    await expect(page2.locator('#status')).toHaveText('Connected');

    const p1Label = await page1.locator('#player-info').textContent();
    const p1Id = Number(p1Label?.replace('Player #', '').trim());
    expect(p1Id).toBeGreaterThan(0);

    // Wait until player 2 receives initial snapshot of player 1
    await page2.waitForFunction(
      (id) => Boolean((window as unknown as { __SHIPS__?: Record<number, { x: number }> }).__SHIPS__?.[id]),
      p1Id
    );

    const initialPos = await page2.evaluate(
      (id) => (window as unknown as { __SHIPS__: Record<number, { x: number; y: number }> }).__SHIPS__[id],
      p1Id
    );

    // Move player 1 forward
    await page1.keyboard.down('ArrowUp');
    await page1.waitForTimeout(350);
    await page1.keyboard.up('ArrowUp');

    // Assert player 2 observes updated coordinates for player 1
    await expect
      .poll(async () => {
        const current = await page2.evaluate(
          (id) => (window as unknown as { __SHIPS__: Record<number, { x: number; y: number }> }).__SHIPS__[id],
          p1Id
        );
        return Math.hypot(current.x - initialPos.x, current.y - initialPos.y);
      })
      .toBeGreaterThan(10);

    // Send chat message from player 1 and verify player 2 sees it
    const messageText = 'Привіт з першого клієнта!';
    await page1.getByTestId('chat-input').fill(messageText);
    await page1.getByTestId('chat-send').click();

    await expect(page2.getByTestId('chat-log')).toContainText(`#${p1Id}: ${messageText}`);

    await context1.close();
    await context2.close();
  });
});
