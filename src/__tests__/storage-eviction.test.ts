import { describe, it, expect, beforeEach } from "vitest";

// localStorage isn't in the node test env; mock one with a byte cap so setItem
// throws QuotaExceededError once the serialized history grows too large.
class MockStorage {
  store = new Map<string, string>();
  constructor(private cap: number) {}
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string) {
    let total = v.length;
    for (const [kk, vv] of this.store) if (kk !== k) total += vv.length;
    if (total > this.cap) {
      const e = new Error("quota") as Error & { name: string };
      e.name = "QuotaExceededError";
      throw e;
    }
    this.store.set(k, v);
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  clear() {
    this.store.clear();
  }
}

const g = globalThis as unknown as {
  window?: object;
  localStorage?: MockStorage;
};

const N = 10_000;
const bigRaw = { blob: "x".repeat(N) } as never;

async function freshStorage(cap: number) {
  g.window = {};
  g.localStorage = new MockStorage(cap);
  const mod = await import("@/lib/storage");
  return mod;
}

describe("saveHistory quota eviction", () => {
  beforeEach(() => {
    g.localStorage?.clear();
  });

  it("evicts the oldest analysis when storage is full, keeping the newest", async () => {
    const { storage, Vendor } = await freshStorage(2.5 * N);

    const rep = {} as never;
    storage.saveAnalysis(
      "id1",
      Vendor.ANTHROPIC,
      2026,
      0,
      "Org1",
      "o1",
      rep,
      bigRaw
    );
    storage.saveAnalysis(
      "id2",
      Vendor.ANTHROPIC,
      2026,
      1,
      "Org2",
      "o2",
      rep,
      bigRaw
    );
    // Third write overflows → oldest (id1) must be evicted, id2 + id3 survive.
    storage.saveAnalysis(
      "id3",
      Vendor.ANTHROPIC,
      2026,
      2,
      "Org3",
      "o3",
      rep,
      bigRaw
    );

    expect(storage.getAnalysis("id1")).toBeNull();
    expect(storage.getAnalysis("id2")).not.toBeNull();
    expect(storage.getAnalysis("id3")).not.toBeNull();
  });
});
