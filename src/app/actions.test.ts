import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  insert: vi.fn(),
  auth: vi.fn(),
  from: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.auth },
    from: mocks.from,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveInvestment, addTransaction, addSubscription } from "./actions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ data: { user: { id: "owner" } } });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockReturnValue({ upsert: mocks.upsert, insert: mocks.insert });
});
const form = (values: Record<string, string>) => {
  const f = new FormData();
  Object.entries(values).forEach(([k, v]) => f.set(k, v));
  return f;
};
it("перезаписує лише вибраний місячний підсумок інвестицій без операції", async () => {
  await saveInvestment(form({ month: "2026-09", amount: "500,00" }));
  expect(mocks.from).toHaveBeenCalledWith("monthly_investments");
  expect(mocks.upsert).toHaveBeenCalledWith(
    { user_id: "owner", month: "2026-09-01", amount_cents: 50000 },
    { onConflict: "user_id,month" },
  );
  expect(mocks.insert).not.toHaveBeenCalled();
  await saveInvestment(form({ month: "2026-10", amount: "0" }));
  expect(mocks.upsert).toHaveBeenLastCalledWith(
    { user_id: "owner", month: "2026-10-01", amount_cents: 0 },
    { onConflict: "user_id,month" },
  );
});
it("відхиляє некоректний місяць і від’ємну суму перед записом", async () => {
  await expect(
    saveInvestment(form({ month: "2026-13", amount: "500" })),
  ).rejects.toThrow("місяць");
  await expect(
    saveInvestment(form({ month: "2026-09", amount: "-1" })),
  ).rejects.toThrow("суму");
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it("зберігає рахунок окремо від способу введення й налаштовує рахунок платежу", async () => {
  await addTransaction(
    form({ kind: "expense", amount: "12,34", financial_account: "cash" }),
  );
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      source: "manual",
      financial_account: "cash",
      amount_cents: 1234,
    }),
  );
  await addSubscription(
    form({ name: "Internet", amount: "39,99", financial_account: "gewerbe" }),
  );
  expect(mocks.insert).toHaveBeenLastCalledWith(
    expect.objectContaining({
      financial_account: "gewerbe",
      amount_cents: 3999,
    }),
  );
});
