import { createClient, currentUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { DriveConnect } from "@/components/DriveConnect";
import { PushSetup } from "@/components/PushSetup";
import { ActionForm } from "@/components/ActionForm";
import { ExportPanel } from "@/components/ExportPanel";
import { Sheet } from "@/components/Sheet";
import { Icon } from "@/components/Icon";
import { aiConfigured } from "@/lib/ai";
import { googleConfigured } from "@/lib/google/tokens";
import { encryptionConfigured } from "@/lib/crypto";
import { folderLink } from "@/lib/google/drive";
import { formatSavedAt, formatBytes } from "@/lib/format";
import {
  disconnectDrive,
  createDriveFolders,
  backupToDrive,
  retryDriveSync,
  signOut,
} from "../actions";
export const dynamic = "force-dynamic";
interface Status {
  connected: boolean;
  google_email: string | null;
  drive_root_id: string | null;
  last_backup_at: string | null;
}
interface Sync {
  synced: number;
  pending: number;
  failed: number;
  stored_bytes: number;
}
export default async function SettingsPage() {
  const [user, supabase] = await Promise.all([currentUser(), createClient()]);
  const [{ data }, { data: syncData }] = await Promise.all([
    supabase.rpc("google_connection_status"),
    supabase.rpc("drive_sync_summary"),
  ]);
  const status = ((data as Status[]) ?? [])[0],
    sync = ((syncData as Sync[]) ?? [])[0];
  const ready = googleConfigured() && encryptionConfigured(),
    connected = ready && status?.connected;
  const awaiting = (sync?.pending ?? 0) + (sync?.failed ?? 0);
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  return (
    <>
      <PageHeader title="Налаштування" subtitle={user?.email ?? ""} />
      <div className="space-y-4">
        <section className="card">
          <div className="flex gap-3 items-center mb-4">
            <span className="icon-circle">
              <Icon name="cloud" size={32} />
            </span>
            <div className="flex-1">
              <h2>Google Диск</h2>
              <p
                className={
                  "text-sm mt-1 " + (connected ? "text-positive" : "text-muted")
                }
              >
                {connected
                  ? "Підключено"
                  : ready
                    ? "Не підключено"
                    : "Поки недоступно"}
              </p>
            </div>
            {connected && (
              <Sheet
                title="Керування Google Диском"
                className="icon-button"
                trigger="•••"
              >
                <ActionForm action={createDriveFolders}>
                  <button className="btn-ghost w-full">
                    Перестворити теки
                  </button>
                </ActionForm>
                <ActionForm action={disconnectDrive} className="mt-3">
                  <button className="btn-danger w-full">Відключити Диск</button>
                </ActionForm>
              </Sheet>
            )}
          </div>
          {connected ? (
            <>
              <p className="text-sm text-muted">
                {status.google_email ?? "Акаунт Google"}
              </p>
              <p className="mt-3 text-sm text-muted">
                {awaiting > 0
                  ? awaiting + " файлів чекають на резервну копію"
                  : sync
                    ? "Усі " + sync.synced + " файлів синхронізовані"
                    : "Копії чеків і документів зберігаються у вашій теці застосунку на Google Диску."}
              </p>
              <p className="text-xs text-muted mt-3">
                {status.last_backup_at
                  ? "Остання копія: " + formatSavedAt(status.last_backup_at)
                  : "Резервну копію ще не створено"}
              </p>
              <ActionForm action={backupToDrive} className="mt-4">
                <button className="btn-primary w-full">
                  Резервна копія зараз
                </button>
              </ActionForm>
              {status.drive_root_id && (
                <a
                  href={folderLink(status.drive_root_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost mt-3 w-full"
                >
                  Відкрити теку ↗
                </a>
              )}
              {awaiting > 0 && (
                <ActionForm action={retryDriveSync} className="mt-3">
                  <button className="btn-outline w-full">
                    Повторити синхронізацію
                  </button>
                </ActionForm>
              )}
              {sync && (
                <p className="mt-4 text-xs text-muted">
                  Збережені файли у застосунку:{" "}
                  {formatBytes(Number(sync.stored_bytes))}
                </p>
              )}
            </>
          ) : ready ? (
            <>
              <DriveConnect label="Підключити Google Диск" />
              <p className="text-xs text-muted mt-3">
                Доступ лише до файлів, створених застосунком у вашій теці на Google Диску.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">
              Резервне копіювання поки недоступне. Збережені дані залишаються у
              застосунку.
            </p>
          )}
        </section>
        <section className="card">
          <div className="flex items-center gap-3 mb-4">
            <span className="icon-circle">
              <Icon name="bell" size={32} />
            </span>
            <div>
              <h2>Нагадування</h2>
              <p className="text-xs text-muted">
                Документи, платежі та завдання
              </p>
            </div>
          </div>
          {vapid ? (
            <PushSetup vapidPublicKey={vapid} />
          ) : (
            <p className="text-sm text-muted">Нагадування поки недоступні.</p>
          )}
        </section>
        <section className="card">
          <div className="flex items-center gap-3">
            <span className="icon-circle text-positive">
              <Icon name="documents" size={32} />
            </span>
            <h2 className="flex-1">Розпізнавання</h2>
            <span
              className={
                aiConfigured() ? "text-positive text-sm" : "text-muted text-sm"
              }
            >
              {aiConfigured() ? "Готове" : "Недоступне"}
            </span>
          </div>
        </section>
        <ExportPanel />
        <ActionForm action={signOut}>
          <button className="btn-ghost w-full text-negative">
            <Icon name="logout" size={20} />
            Вийти з акаунта
          </button>
        </ActionForm>
      </div>
    </>
  );
}
