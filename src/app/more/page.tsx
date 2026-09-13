import { PageHeader, SectionLink } from "@/components/ui";
export const dynamic = "force-dynamic";
const DESTINATIONS = [
  ["/subscriptions", "Платежі", "Строки оплати й регулярні витрати"],
  ["/tasks", "Завдання", "Прострочені, сьогодні й далі"],
  ["/goals", "Цілі", "Накопичення та прогрес"],
  ["/analytics", "Аналітика", "Категорії та динаміка"],
  ["/documents", "Документи", "Теки за установами та строки"],
  ["/receipts", "Скани", "Оригінали з датою й часом"],
  ["/digest", "Підсумок", "Спільні витрати, доходи та різниця"],
  ["/categories", "Категорії", "Назви, іконки та видимість"],
  ["/archive", "Архів", "Виконане, оплачене, досягнуте"],
  ["/settings", "Налаштування", "Резервні копії, нагадування й експорт"],
];
export default function MorePage() {
  return (
    <>
      <PageHeader title="Ще" subtitle="Taison" />
      <div className="menu-grid">
        {DESTINATIONS.map(([href, title, description]) => (
          <SectionLink
            key={href}
            href={href}
            title={title}
            description={description}
          />
        ))}
      </div>
    </>
  );
}
