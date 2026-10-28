import type { TestContext } from "node:test";

// Only the Storage contract used by the app; descriptor cleanup also restores
// environments where localStorage is absent or has a throwing native getter.
export function mockStorage(t: TestContext, initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const native = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: native });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });
  return { values, native };
}
