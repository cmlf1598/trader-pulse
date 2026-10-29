import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Recharts' ResponsiveContainer and base-ui measure elements; jsdom has no ResizeObserver.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

afterEach(() => {
  cleanup();
});

// Toasts are asserted as calls; Sonner's DOM portal is irrelevant to unit tests.
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }),
  Toaster: () => null,
}));
