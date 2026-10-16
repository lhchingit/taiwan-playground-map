// 限制同時進行的請求數。建置時會一次產生上千個場地頁，每頁同時發好幾個查詢；
// 不限制的話會塞爆 Supabase 前面的閘道（本機 Kong 只有 512 條連線，超過就回 500）。

/** 同一時間最多執行 max 個，其餘依序排隊；失敗也會釋放名額 */
export function createLimiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  // 有人在排隊時，名額直接交給下一個（active 不變），避免新來的插隊超過上限
  const release = () => {
    const next = queue.shift();
    if (next) next();
    else active--;
  };
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve));
    else active++;
    try {
      return await task();
    } finally {
      release();
    }
  };
}

/** 包住 fetch：同一個 limiter 底下最多 max 個請求同時進行 */
export function limitedFetch(fetchImpl: typeof fetch, max: number): typeof fetch {
  const run = createLimiter(max);
  return (input, init) => run(() => fetchImpl(input, init));
}
