// 交通方式記在 localStorage（pm.prefs，與原型相同）。讀寫都包 try/catch：
// 私密瀏覽或封鎖網站資料時 localStorage 可能丟錯，介面要照常運作。
import { useCallback, useSyncExternalStore } from 'react';
import { TRAVEL_MODES, type TravelMode } from './filter';

const KEY = 'pm.prefs';
const DEFAULT_MODE: TravelMode = 'drive';
const listeners = new Set<() => void>();

function readMode(): TravelMode {
  try {
    const mode = (JSON.parse(localStorage.getItem(KEY) ?? '{}') as { mode?: string }).mode;
    return mode && mode in TRAVEL_MODES ? (mode as TravelMode) : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener('storage', fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', fn);
  };
}

/** 伺服器與第一次渲染都用預設值，避免 hydration 不一致；載入後換成使用者的設定 */
export function useTravelMode(): [TravelMode, (mode: TravelMode) => void] {
  const mode = useSyncExternalStore(subscribe, readMode, () => DEFAULT_MODE);
  const setMode = useCallback((next: TravelMode) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ mode: next }));
    } catch {
      // 存不了就只在這次瀏覽有效
    }
    listeners.forEach((fn) => fn());
  }, []);
  return [mode, setMode];
}
