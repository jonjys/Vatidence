import { describe, expect, it } from "vitest";
import {
  REQUESTER_VAT_STORAGE_KEY,
  readRememberedRequesterVat,
  rememberRequesterVat,
} from "@/lib/requester-memory";

function memoryStore(initial: Record<string, string> = {}): Storage {
  const data = { ...initial };
  return {
    get length() {
      return Object.keys(data).length;
    },
    clear() {
      for (const key of Object.keys(data)) delete data[key];
    },
    getItem(key: string) {
      return data[key] ?? null;
    },
    key() {
      return null;
    },
    removeItem(key: string) {
      delete data[key];
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
  };
}

describe("requester VAT memory", () => {
  it("persists only a format-valid VAT and returns the canonical form", () => {
    const store = memoryStore();
    rememberRequesterVat(store, "de811907980");
    expect(store.getItem(REQUESTER_VAT_STORAGE_KEY)).toBe("DE811907980");
    expect(readRememberedRequesterVat(store)).toBe("DE811907980");
  });

  it("ignores junk, missing storage, and a thrown getItem", () => {
    const store = memoryStore();
    rememberRequesterVat(store, "not-a-vat");
    expect(readRememberedRequesterVat(store)).toBeNull();
    expect(readRememberedRequesterVat(null)).toBeNull();
    expect(
      readRememberedRequesterVat({
        getItem() {
          throw new Error("blocked");
        },
      }),
    ).toBeNull();
  });
});
