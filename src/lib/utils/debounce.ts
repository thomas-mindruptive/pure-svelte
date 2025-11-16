export function debounce<T extends (...args: any[]) => void>(fn: T, wait: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  function debounced(this: unknown, ...args: Parameters<T>) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn.apply(this, args);
    }, wait);
  }
  (debounced as any).cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  return debounced as T & { cancel: () => void };
}


