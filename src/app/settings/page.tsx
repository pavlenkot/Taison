import { createClient, currentUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { DriveConnect } from "@/components/DriveConnect";
import { activeProvider, aiConfigured } from "@/lib/ai";
import { googleConfigured } from "@/lib/google/tokens";
import { encryptionConfigured } from "@/lib/crypto";
import { folderLink } from "@/lib/google/drive";
import { formatDate, formatBytes } from "@/lib/format";
import {
  disconnectDrive,
  createDriveFolders,
  backupToDrive,
  retryDriveSync,
  signOut,
} from "../actions";

export const dynamic = "force-dynamic";

interface SyncSummary {
  synced: number;
  pending: number;
  failed: number;
  skipped: number;
  stored_bytes: number;
}

/** Безкоштовний тариф Supabase дає один гігабайт на файли. */
const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;

interface Status {
  connected: boolean;
  google_email: string | null;
  drive_root_id: string | null;
  connected_at: string | null;
  last_backup_at: string | null;
}

export default async function SettingsPage() {
  const user = await currentUser();
  const supabase = await createClient();

  const [{ data }, { data: syncData }] = await Promise.all([
    supabase.rpc("google_connection_status"),
    supabase.rpc("drive_sync_summary"),
  ]);

  const status = ((data as Status[]) ?? [])[0] ?? null;
  const sync = ((syncData as SyncSummary[]) ?? [])[0] ?? null;
  const awaiting = (sync?.pending ?? 0) + (sync?.failed ?? 0);
  const usedShare = sync ? Math.min(100, (sync.stored_bytes / STORAGE_LIMIT_BYTES) * 100) : 0;

  const provider = activeProvider();
  const ready = googleConfigured() && encryptionConfigured();

  return (
    <>
      <PageHeader title="Налаштування" subtitle={user?.email ?? ""} />

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Google Диск
        </h2>

        {!ready ? (
          <div className="card border-warn/40 bg-warn/5 text-sm">
            <div className="font-semibold text-warn">Синхронізацію не налаштовано</div>
            <p className="mt-1 text-muted">
              На сервері бракує <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>{" "}
              або <code>TOKEN_ENCRYPTION_KEY</code>. Порядок дій — у docs/GOOGLE.md.
            </p>
          </div>
        ) : status?.connected ? (
          <div className="card">
            <div className="flex items-center gap-3">
              <span className="text-xl">✅</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Підключено</span>
                <span className="block truncate text-xs text-muted">
                  {status.google_email ?? "акаунт Google"}
                  {status.connected_at ? ` · з ${formatDate(status.connected_at.slice(0, 10))}` : ""}
                </span>
              </span>
            </div>

            <p className="mt-3 text-sm text-muted">
              Чеки й документи складаються в теку <strong className="text-ink">Taison</strong> на
              вашому Диску: чеки — по роках, документи — по теках адресатів.
            </p>

            <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
              {status.drive_root_id && (
                <a
                  href={folderLink(status.drive_root_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost"
                >
                  Відкрити теку
                </a>
              )}
              <form action={createDriveFolders}>
                <button type="submit" className="btn-ghost">
                  Перестворити теки
                </button>
              </form>
              <form action={backupToDrive}>
                <button type="submit" className="btn-primary">
                  Резервна копія зараз
                </button>
              </form>
            </div>

            {sync && (
              <div className="mt-3 border-t border-line pt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Дві копії файлів
                </div>

                <div className="mt-1.5 flex items-center gap-3 text-sm">
                  <span className={awaiting > 0 ? "text-warn" : "text-positive"}>
                    {awaiting > 0 ? "⚠" : "✓"}
                  </span>
                  <span className="min-w-0 flex-1">
                    {awaiting > 0 ? (
                      <>
                        {sync.synced} у двох місцях, {awaiting} лише в застосунку
                      </>
                    ) : (
                      <>Усі {sync.synced} файлів лежать і тут, і на Диску</>
                    )}
                  </span>
                  {awaiting > 0 && (
                    <form action={retryDriveSync}>
                      <button type="submit" className="btn-ghost px-2.5 py-1.5 text-xs">
                        Довезти
                      </button>
                    </form>
                  )}
                </div>

                {sync.failed > 0 && (
                  <p className="mt-1 text-xs text-negative">
                    {sync.failed} не вдалося вивантажити — причина видно в журналі Vercel
                  </p>
                )}

                <div className="mt-3 text-xs text-muted">
                  Сховище застосунку: {formatBytes(sync.stored_bytes)} з 1 ГБ
                </div>
                <div
                  className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line"
                  role="progressbar"
                  aria-valuenow={Math.round(usedShare)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Зайнято у сховищі застосунку"
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(usedShare, 1)}%`,
                      background: usedShare > 80 ? "rgb(var(--warn))" : "rgb(var(--series-1))",
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted">
                  Копія на Диску місця тут не займає й не має обмеження
                  безкоштовного тарифу.
                </p>
              </div>
            )}

            <p className="mt-3 text-xs text-muted">
              {status.last_backup_at
                ? `Остання копія: ${formatDate(status.last_backup_at.slice(0, 10))}`
                : "Копію ще не робили"}
              . У книзі окремі аркуші на операції, підписки, цілі, завдання,
              документи й категорії — тобто все, що знає застосунок.
            </p>

            <form action={disconnectDrive} className="mt-3 border-t border-line pt-3">
              <button type="submit" className="text-xs text-muted hover:text-negative">
                Відключити Диск
              </button>
            </form>
          </div>
        ) : (
          <div className="card">
            <DriveConnect label="Підключити Google Диск" />
            <p className="mt-2 text-xs text-muted">
              Застосунок отримає доступ лише до того, що створить сам — до теки
              «Taison». Решту вашого Диска він не бачить.
            </p>
          </div>
        )}
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Розпізнавання
        </h2>
        <div className="card text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Рушій</span>
            <strong>{provider === "claude" ? "Claude" : "Gemini"}</strong>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-muted">Ключ</span>
            <strong className={aiConfigured() ? "" : "text-warn"}>
              {aiConfigured() ? "налаштовано" : "бракує"}
            </strong>
          </div>
          <p className="mt-2 text-xs text-muted">
            Перемикається змінною <code>AI_PROVIDER</code> у Vercel: <code>claude</code> або{" "}
            <code>gemini</code>. Після зміни потрібен повторний деплой.
          </p>
        </div>
      </section>

      <form action={signOut}>
        <button type="submit" className="btn-ghost w-full text-negative">
          Вийти
        </button>
      </form>
    </>
  );
}
