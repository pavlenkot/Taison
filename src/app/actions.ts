"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseAmountToCents, isoDate } from "@/lib/format";
import { slugify } from "@/lib/slug";

/** Витягує обов'язковий непорожній рядок. */
function str(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optional(form: FormData, key: string): string | null {
  const value = str(form, key);
  return value.length > 0 ? value : null;
}

function amount(form: FormData, key = "amount"): number {
  const cents = parseAmountToCents(str(form, key));
  if (cents === null || cents <= 0) {
    throw new Error("Вкажіть суму більшу за нуль");
  }
  return cents;
}

async function client() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

function fail(message: string, error: { message: string } | null): void {
  if (error) throw new Error(`${message}: ${error.message}`);
}

// ---------------------------------------------------------------- операції

export async function addTransaction(form: FormData) {
  const { supabase, userId } = await client();

  const { error } = await supabase.from("transactions").insert({
    user_id: userId,
    kind: str(form, "kind") === "income" ? "income" : "expense",
    amount_cents: amount(form),
    category_id: optional(form, "category_id"),
    merchant: optional(form, "merchant"),
    note: optional(form, "note"),
    occurred_on: str(form, "occurred_on") || isoDate(),
    source: "manual",
  });
  fail("Не вдалося зберегти операцію", error);

  revalidatePath("/transactions");
  revalidatePath("/");
}

export async function updateTransaction(form: FormData) {
  const { supabase } = await client();
  const id = str(form, "id");

  const { error } = await supabase
    .from("transactions")
    .update({
      kind: str(form, "kind") === "income" ? "income" : "expense",
      amount_cents: amount(form),
      category_id: optional(form, "category_id"),
      merchant: optional(form, "merchant"),
      note: optional(form, "note"),
      occurred_on: str(form, "occurred_on") || isoDate(),
      needs_review: false,
    })
    .eq("id", id);
  fail("Не вдалося оновити операцію", error);

  revalidatePath("/transactions");
  revalidatePath("/scan");
  revalidatePath("/");
}

export async function deleteTransaction(form: FormData) {
  const { supabase } = await client();
  const { error } = await supabase.from("transactions").delete().eq("id", str(form, "id"));
  fail("Не вдалося видалити операцію", error);

  revalidatePath("/transactions");
  revalidatePath("/");
}

// ------------------------------------------------------------ підписки

export async function addSubscription(form: FormData) {
  const { supabase, userId } = await client();

  const { error } = await supabase.from("subscriptions").insert({
    user_id: userId,
    name: str(form, "name"),
    amount_cents: amount(form),
    category_id: optional(form, "category_id"),
    recurrence: str(form, "recurrence") || "monthly",
    next_due_on: str(form, "next_due_on") || isoDate(),
    notes: optional(form, "notes"),
  });
  fail("Не вдалося зберегти підписку", error);

  revalidatePath("/subscriptions");
  revalidatePath("/");
}

export async function updateSubscription(form: FormData) {
  const { supabase } = await client();

  const { error } = await supabase
    .from("subscriptions")
    .update({
      name: str(form, "name"),
      amount_cents: amount(form),
      category_id: optional(form, "category_id"),
      recurrence: str(form, "recurrence") || "monthly",
      next_due_on: str(form, "next_due_on"),
      notes: optional(form, "notes"),
      active: form.get("active") === "on",
    })
    .eq("id", str(form, "id"));
  fail("Не вдалося оновити підписку", error);

  revalidatePath("/subscriptions");
  revalidatePath("/");
}

export async function paySubscription(form: FormData) {
  const { supabase } = await client();

  const { error } = await supabase.rpc("pay_subscription", {
    p_subscription_id: str(form, "id"),
    p_paid_on: str(form, "paid_on") || isoDate(),
    p_amount_cents: null,
  });
  fail("Не вдалося провести оплату", error);

  revalidatePath("/subscriptions");
  revalidatePath("/transactions");
  revalidatePath("/archive");
  revalidatePath("/");
}

export async function deleteSubscription(form: FormData) {
  const { supabase } = await client();
  const { error } = await supabase.from("subscriptions").delete().eq("id", str(form, "id"));
  fail("Не вдалося видалити підписку", error);

  revalidatePath("/subscriptions");
  revalidatePath("/");
}

// ---------------------------------------------------------------- цілі

export async function addGoal(form: FormData) {
  const { supabase, userId } = await client();
  const target = parseAmountToCents(str(form, "target"));

  const { error } = await supabase.from("goals").insert({
    user_id: userId,
    title: str(form, "title"),
    target_cents: target && target > 0 ? target : null,
    due_on: optional(form, "due_on"),
    notes: optional(form, "notes"),
  });
  fail("Не вдалося створити ціль", error);

  revalidatePath("/goals");
  revalidatePath("/");
}

export async function addContribution(form: FormData) {
  const { supabase, userId } = await client();

  const { error } = await supabase.from("goal_contributions").insert({
    user_id: userId,
    goal_id: str(form, "goal_id"),
    amount_cents: amount(form),
    made_on: str(form, "made_on") || isoDate(),
    note: optional(form, "note"),
  });
  fail("Не вдалося поповнити ціль", error);

  revalidatePath("/goals");
}

export async function completeGoal(form: FormData) {
  const { supabase } = await client();

  const { error } = await supabase
    .from("goals")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", str(form, "id"));
  fail("Не вдалося закрити ціль", error);

  revalidatePath("/goals");
  revalidatePath("/archive");
}

export async function deleteGoal(form: FormData) {
  const { supabase } = await client();
  const { error } = await supabase.from("goals").delete().eq("id", str(form, "id"));
  fail("Не вдалося видалити ціль", error);

  revalidatePath("/goals");
}

// ------------------------------------------------------------ завдання

export async function addTask(form: FormData) {
  const { supabase, userId } = await client();

  const { error } = await supabase.from("tasks").insert({
    user_id: userId,
    title: str(form, "title"),
    note: optional(form, "note"),
    due_on: str(form, "due_on") || isoDate(),
    repeat: str(form, "repeat") || "none",
  });
  fail("Не вдалося створити завдання", error);

  revalidatePath("/tasks");
  revalidatePath("/");
}

export async function completeTask(form: FormData) {
  const { supabase } = await client();
  const { error } = await supabase.rpc("complete_task", { p_task_id: str(form, "id") });
  fail("Не вдалося завершити завдання", error);

  revalidatePath("/tasks");
  revalidatePath("/archive");
  revalidatePath("/");
}

/** Повернути помилково завершене завдання назад в активні. */
export async function reopenTask(form: FormData) {
  const { supabase } = await client();

  const { error } = await supabase
    .from("tasks")
    .update({ done_at: null, archived_at: null })
    .eq("id", str(form, "id"));
  fail("Не вдалося повернути завдання", error);

  revalidatePath("/tasks");
  revalidatePath("/archive");
  revalidatePath("/");
}

export async function deleteTask(form: FormData) {
  const { supabase } = await client();
  const { error } = await supabase.from("tasks").delete().eq("id", str(form, "id"));
  fail("Не вдалося видалити завдання", error);

  revalidatePath("/tasks");
  revalidatePath("/");
}

// ------------------------------------------------------------ категорії

export async function addCategory(form: FormData) {
  const { supabase, userId } = await client();

  const name = str(form, "name");
  if (name.length === 0) throw new Error("Вкажіть назву категорії");

  const kind = str(form, "kind") === "income" ? "income" : "expense";
  const base = slugify(name, "cat");

  // Слаг має бути унікальним у межах користувача — підбираємо вільний.
  const { data: taken } = await supabase
    .from("categories")
    .select("slug")
    .like("slug", `${base}%`);

  const used = new Set((taken ?? []).map((row: { slug: string }) => row.slug));
  let slug = base;
  let attempt = 2;
  while (used.has(slug)) {
    slug = `${base}_${attempt}`;
    attempt += 1;
  }

  const { error } = await supabase.from("categories").insert({
    user_id: userId,
    name,
    slug,
    kind,
    icon: optional(form, "icon") ?? "📦",
    sort: Number(str(form, "sort")) || 500,
  });
  fail("Не вдалося створити категорію", error);

  revalidatePath("/categories");
  revalidatePath("/transactions");
}

export async function updateCategory(form: FormData) {
  const { supabase } = await client();

  const { error } = await supabase
    .from("categories")
    .update({
      name: str(form, "name"),
      icon: optional(form, "icon") ?? "📦",
      sort: Number(str(form, "sort")) || 500,
      hidden: form.get("hidden") === "on",
    })
    .eq("id", str(form, "id"));
  fail("Не вдалося оновити категорію", error);

  revalidatePath("/categories");
  revalidatePath("/transactions");
}

/** Перемикач видимості окремою дією — щоб ховати в один дотик зі списку. */
export async function toggleCategoryHidden(form: FormData) {
  const { supabase } = await client();

  const { error } = await supabase
    .from("categories")
    .update({ hidden: str(form, "hidden") !== "true" })
    .eq("id", str(form, "id"));
  fail("Не вдалося змінити категорію", error);

  revalidatePath("/categories");
  revalidatePath("/transactions");
}

export async function deleteCategory(form: FormData) {
  const { supabase } = await client();
  const { error } = await supabase.from("categories").delete().eq("id", str(form, "id"));
  fail("Не вдалося видалити категорію", error);

  revalidatePath("/categories");
  revalidatePath("/transactions");
}

// -------------------------------------------------------------- підсумки

export async function markDigestSeen(form: FormData) {
  const { supabase, userId } = await client();

  const { error } = await supabase.from("digest_views").upsert(
    {
      user_id: userId,
      period_kind: str(form, "period_kind"),
      period_start: str(form, "period_start"),
    },
    { onConflict: "user_id,period_kind,period_start" },
  );
  fail("Не вдалося позначити підсумок прочитаним", error);

  revalidatePath("/");
  revalidatePath("/digest");
}

// ------------------------------------------------------------ документи

export async function updateDocument(form: FormData) {
  const { supabase } = await client();

  const issuer = optional(form, "issuer");
  const keywords = str(form, "keywords")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
    .slice(0, 25);

  const amount = parseAmountToCents(str(form, "amount"));

  const { error } = await supabase
    .from("documents")
    .update({
      doc_type: str(form, "doc_type") || "other",
      issuer,
      // Слаг веде за собою теку адресата, тож перераховуємо разом із назвою.
      issuer_slug: issuer ? slugify(issuer, "issuer") : null,
      subject: optional(form, "subject"),
      reference_number: optional(form, "reference_number"),
      document_date: optional(form, "document_date"),
      deadline: optional(form, "deadline"),
      amount_cents: amount && amount > 0 ? amount : null,
      keywords,
    })
    .eq("id", str(form, "id"));
  fail("Не вдалося оновити документ", error);

  revalidatePath("/documents");
}

export async function deleteDocument(form: FormData) {
  const { supabase } = await client();

  const id = str(form, "id");

  // Спершу дізнаємось про файл: рядок documents піде каскадом за receipts,
  // тож видаляємо в правильному порядку і прибираємо сам файл зі сховища.
  const { data: doc } = await supabase
    .from("documents")
    .select("receipt_id, receipts (storage_path)")
    .eq("id", id)
    .maybeSingle();

  const storagePath = (doc as { receipts?: { storage_path: string } | null } | null)?.receipts
    ?.storage_path;

  const { error } = await supabase.from("documents").delete().eq("id", id);
  fail("Не вдалося видалити документ", error);

  const receiptId = (doc as { receipt_id: string | null } | null)?.receipt_id;
  if (receiptId) {
    await supabase.from("receipts").delete().eq("id", receiptId);
  }
  if (storagePath) {
    await supabase.storage.from("receipts").remove([storagePath]);
  }

  revalidatePath("/documents");
  revalidatePath("/receipts");
  // Видаляють із картки документа — залишити користувача на ній не можна:
  // сторінки вже немає, і вона показала б 404.
  redirect("/documents");
}

// ------------------------------------------------------------------ інше


export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
