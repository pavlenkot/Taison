export type Kind = "expense" | "income";
export type Recurrence = "once" | "weekly" | "monthly" | "quarterly" | "yearly";
export type TaskRepeat = "none" | "daily" | "weekdays" | "weekly";
export type GoalStatus = "active" | "done" | "archived";

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  kind: Kind;
  sort: number;
}

export interface Transaction {
  id: string;
  kind: Kind;
  amount_cents: number;
  currency: string;
  category_id: string | null;
  merchant: string | null;
  note: string | null;
  occurred_on: string;
  source: "manual" | "scan" | "shortcut" | "subscription";
  receipt_id: string | null;
  needs_review: boolean;
  created_at: string;
  categories?: Pick<Category, "name" | "icon" | "slug"> | null;
}

export interface Subscription {
  id: string;
  name: string;
  amount_cents: number;
  currency: string;
  category_id: string | null;
  recurrence: Recurrence;
  next_due_on: string;
  notes: string | null;
  active: boolean;
  categories?: Pick<Category, "name" | "icon"> | null;
}

export interface SubscriptionPayment {
  id: string;
  subscription_id: string;
  due_on: string;
  paid_on: string;
  amount_cents: number;
  subscriptions?: Pick<Subscription, "name"> | null;
}

export interface Goal {
  id: string;
  title: string;
  target_cents: number | null;
  currency: string;
  due_on: string | null;
  notes: string | null;
  status: GoalStatus;
  completed_at: string | null;
  created_at: string;
  saved_cents?: number;
}

export interface GoalContribution {
  id: string;
  goal_id: string;
  amount_cents: number;
  made_on: string;
  note: string | null;
}

export interface Task {
  id: string;
  title: string;
  note: string | null;
  due_on: string;
  repeat: TaskRepeat;
  done_at: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface Receipt {
  id: string;
  kind: "receipt" | "document";
  storage_path: string;
  original_name: string | null;
  mime: string | null;
  byte_size: number | null;
  icloud_path: string | null;
  ai_provider: string | null;
  ai_model: string | null;
  created_at: string;
}

/** Рядок, який повертає SQL-функція period_totals. */
export interface PeriodTotal {
  bucket: string;
  kind: Kind;
  category_slug: string;
  category_name: string;
  total_cents: number;
  entries: number;
}

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  once: "Одноразово",
  weekly: "Щотижня",
  monthly: "Щомісяця",
  quarterly: "Щокварталу",
  yearly: "Щороку",
};

export const REPEAT_LABELS: Record<TaskRepeat, string> = {
  none: "Без повтору",
  daily: "Щодня",
  weekdays: "По буднях",
  weekly: "Щотижня",
};
