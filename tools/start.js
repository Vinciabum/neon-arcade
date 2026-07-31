// 게임의 시작 트리거를 찾아 누른다. 게임마다 시작 방식이 달라서 텍스트 → 캔버스 클릭 → 키 순으로 시도한다.
// 좌표가 아니라 텍스트로 누르는 게 안정적이다.
// 재시작 문구도 시작 문구다. 게임오버 화면에서 다시 시작하는 것이 바로 우리가 원하는 동작이고,
// 이게 빠져 있으면 죽은 게임을 되살릴 방법이 없다 — 실측: cyber-snake의 "RETRY"를 못 찾아
// 스크린샷 10장이 전부 게임오버 화면이었다.
const START_TEXT = /\b(start|play|begin|initiate|jack in|synchronize|sync|launch|enter|go|jump|run|retry|again|restart|replay|resume|continue)\b/i;

export async function clickStartButton(page) {
  const clickable = page.locator('button, a, [role="button"], .btn, div, span');
  const count = Math.min(await clickable.count().catch(() => 0), 80);
  for (let i = 0; i < count; i++) {
    const el = clickable.nth(i);
    const text = (await el.innerText().catch(() => '')).trim();
    if (!text || text.length > 24 || !START_TEXT.test(text)) continue;
    if (!(await el.isVisible().catch(() => false))) continue;
    const ok = await el.click({ timeout: 800 }).then(() => true).catch(() => false);
    if (ok) return true;
  }
  return false;
}

export async function triggerStart(page) {
  if (await clickStartButton(page)) return;

  // 폴백: 캔버스 내부에 그려진 시작 버튼 / "아무 키나" 방식.
  const box = await page.locator('canvas').first().boundingBox().catch(() => null);
  const cx = box ? box.x + box.width / 2 : 450;
  const cy = box ? box.y + box.height / 2 : 300;
  await page.mouse.click(cx, cy).catch(() => {});
  await page.waitForTimeout(150);
  for (const key of ['Enter', 'Space']) {
    await page.keyboard.press(key).catch(() => {});
    await page.waitForTimeout(120);
  }
}
