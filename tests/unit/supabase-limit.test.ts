import { describe, expect, it } from 'vitest';
import { createLimiter, limitedFetch } from '@/lib/supabase/limit';

const tick = () => new Promise((r) => setTimeout(r, 1));

describe('createLimiter', () => {
  it('同時最多執行 max 個，全部都會完成且回傳值正確', async () => {
    const run = createLimiter(3);
    let active = 0;
    let peak = 0;
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        run(async () => {
          active++;
          peak = Math.max(peak, active);
          await tick();
          active--;
          return i * 2;
        }),
      ),
    );
    expect(peak).toBe(3);
    expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i * 2));
  });

  it('失敗的任務會釋放名額，後面的不會卡住', async () => {
    const run = createLimiter(1);
    const failed = run(async () => {
      await tick();
      throw new Error('壞了');
    });
    const next = run(async () => 'ok');
    await expect(failed).rejects.toThrow('壞了');
    await expect(next).resolves.toBe('ok');
  });

  it('名額交給排隊的人時，新來的不會插隊超過上限', async () => {
    const run = createLimiter(1);
    let active = 0;
    let peak = 0;
    const task = async () => {
      active++;
      peak = Math.max(peak, active);
      await tick();
      active--;
    };
    const first = run(task);
    const queued = run(task);
    await first;
    const late = run(task); // first 剛結束、queued 還沒開始的這一刻進來
    await Promise.all([queued, late]);
    expect(peak).toBe(1);
  });
});

describe('limitedFetch', () => {
  it('把參數原封不動交給原本的 fetch，並限制同時請求數', async () => {
    let active = 0;
    let peak = 0;
    const calls: string[] = [];
    const fake = (async (input: RequestInfo | URL) => {
      active++;
      peak = Math.max(peak, active);
      calls.push(String(input));
      await tick();
      active--;
      return new Response('{}');
    }) as typeof fetch;
    const f = limitedFetch(fake, 2);
    await Promise.all(Array.from({ length: 6 }, (_, i) => f(`http://x/${i}`)));
    expect(peak).toBe(2);
    expect(calls.sort()).toEqual(Array.from({ length: 6 }, (_, i) => `http://x/${i}`));
  });
});
