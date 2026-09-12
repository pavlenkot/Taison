import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scopedToUser } from "./scoped";
import { buildBackupWorkbook } from "../backup";

interface Seen {
  table: string;
  filter: [string, unknown] | null;
}

/** Мінімальна підробка клієнта: запам'ятовує, з яким фільтром пішов запит. */
function spyClient(seen: Seen[]): SupabaseClient {
  const from = (table: string) => {
    const entry: Seen = { table, filter: null };
    seen.push(entry);

    const query: Record<string, unknown> = {};
    query.select = () => query;
    query.eq = (column: string, value: unknown) => {
      entry.filter = [column, value];
      return query;
    };
    query.order = () => query;
    query.then = (resolve: (r: { data: unknown[]; error: null }) => void) =>
      resolve({ data: [], error: null });

    return query;
  };

  return { from } as unknown as SupabaseClient;
}

describe("звуження адмін-клієнта до одного користувача", () => {
  it("кожен запит резервної книги фільтрується по user_id", async () => {
    // Це головний запобіжник від витоку: крон працює ключем service_role,
    // який RLS обходить. Якби хоч один запит лишився без фільтра, у книгу
    // одного користувача потрапили б чужі операції — і поїхали б на його Диск.
    const seen: Seen[] = [];
    await buildBackupWorkbook(scopedToUser(spyClient(seen), "user-1"));

    expect(seen.length).toBeGreaterThan(0);
    for (const call of seen) {
      expect(call.filter).toEqual(["user_id", "user-1"]);
    }
  });

  it("охоплює всі таблиці, які потрапляють у книгу", async () => {
    const seen: Seen[] = [];
    await buildBackupWorkbook(scopedToUser(spyClient(seen), "user-1"));

    const tables = seen.map((call) => call.table);
    for (const table of [
      "transactions",
      "subscriptions",
      "goals",
      "tasks",
      "documents",
      "categories",
    ]) {
      expect(tables).toContain(table);
    }
  });

  it("різні користувачі отримують різні фільтри", async () => {
    const first: Seen[] = [];
    const second: Seen[] = [];
    await buildBackupWorkbook(scopedToUser(spyClient(first), "user-1"));
    await buildBackupWorkbook(scopedToUser(spyClient(second), "user-2"));

    expect(first.every((c) => c.filter?.[1] === "user-1")).toBe(true);
    expect(second.every((c) => c.filter?.[1] === "user-2")).toBe(true);
  });
});
