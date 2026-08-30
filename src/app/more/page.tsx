import { currentUser } from "@/lib/supabase/server";
import { PageHeader, SectionLink } from "@/components/ui";
import { activeProvider } from "@/lib/ai";
import { signOut } from "../actions";

export const dynamic = "force-dynamic";

export default async function MorePage() {
  const user = await currentUser();
  const provider = activeProvider();

  return (
    <>
      <PageHeader title="Ще" subtitle={user?.email ?? ""} />

      <div className="space-y-2">
        <SectionLink
          href="/subscriptions"
          icon="↻"
          title="Підписки та платежі"
          description="Строки оплати й регулярні витрати"
        />
        <SectionLink
          href="/documents"
          icon="📄"
          title="Документи"
          description="Пошук, теки адресатів, строки"
        />
        <SectionLink
          href="/tasks"
          icon="✓"
          title="Щоденні завдання"
          description="Список на сьогодні й далі"
        />
        <SectionLink href="/goals" icon="◈" title="Цілі" description="Прогрес і поповнення" />
        <SectionLink
          href="/digest"
          icon="🗒"
          title="Підсумок"
          description="Куди пішли гроші за тиждень і місяць"
        />
        <SectionLink
          href="/receipts"
          icon="🗂"
          title="Усі скани"
          description="Файли чеків і документів як є"
        />
        <SectionLink
          href="/categories"
          icon="◇"
          title="Категорії"
          description="Свої назви, значки та порядок"
        />
        <SectionLink
          href="/analytics"
          icon="▤"
          title="Аналітика"
          description="Тиждень, місяць, рік і порівняння"
        />
        <SectionLink
          href="/archive"
          icon="⌸"
          title="Архів"
          description="Виконане, оплачене, досягнуте"
        />
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-muted">
        Вивантажити таблицю
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <a href="/api/export?format=xlsx&period=month" className="btn-ghost">
          Excel за цей місяць
        </a>
        <a href="/api/export?format=xlsx&period=year" className="btn-ghost">
          Excel за цей рік
        </a>
        <a href="/api/export?format=csv&period=month" className="btn-ghost">
          CSV за цей місяць
        </a>
        <a href="/api/export?format=csv&period=year" className="btn-ghost">
          CSV за цей рік
        </a>
      </div>
      <p className="mt-2 text-xs text-muted">
        У файлі Excel два аркуші: усі операції та підсумок за категоріями. Витрати
        від&apos;ємні, доходи додатні — як у банківській виписці.
      </p>

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-muted">
        Налаштування
      </h2>
      <div className="card text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Рушій розпізнавання</span>
          <strong>{provider === "claude" ? "Claude" : "Gemini"}</strong>
        </div>
        <p className="mt-2 text-xs text-muted">
          Перемикається змінною <code>AI_PROVIDER</code> у налаштуваннях Vercel:
          значення <code>claude</code> або <code>gemini</code>. Після зміни потрібен
          повторний деплой.
        </p>
      </div>

      <form action={signOut} className="mt-6">
        <button type="submit" className="btn-ghost w-full text-negative">
          Вийти
        </button>
      </form>
    </>
  );
}
