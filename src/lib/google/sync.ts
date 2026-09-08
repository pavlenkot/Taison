import { getAccessToken, loadFolders, saveFolders, type DriveFolders } from "./tokens";
import { ensureFolder, ensureFolderPath, uploadFile, DriveError, folderLink } from "./drive";
import { safeFileName } from "../slug";

const ROOT = "Taison";
const RECEIPTS = "Чеки";
const DOCUMENTS = "Документи";
const BACKUPS = "Резервні копії";

export interface FiledFile {
  id: string;
  link?: string;
}

export interface FiledDocument {
  file: FiledFile;
  meta?: FiledFile;
  folder: string;
}

/**
 * Створює (або знаходить) дерево тек і запам'ятовує ідентифікатори,
 * щоб не шукати їх на кожному скані.
 */
async function ensureTree(userId: string, token: string, force = false): Promise<DriveFolders> {
  const cached = await loadFolders(userId);
  if (!force && cached.root && cached.receipts && cached.documents && cached.backups) {
    return cached;
  }

  const root = await ensureFolder(token, ROOT);
  const folders: DriveFolders = {
    root,
    receipts: await ensureFolder(token, RECEIPTS, root),
    documents: await ensureFolder(token, DOCUMENTS, root),
    backups: await ensureFolder(token, BACKUPS, root),
  };

  await saveFolders(userId, folders);
  return folders;
}

/**
 * Виконує дію, а якщо Диск відповів «немає такої теки» — перебудовує дерево
 * і пробує ще раз. Так видалена вручну тека полагодиться сама, без походу
 * в налаштування.
 */
async function withFreshTree<T>(
  userId: string,
  token: string,
  action: (folders: DriveFolders) => Promise<T>,
): Promise<T> {
  try {
    return await action(await ensureTree(userId, token));
  } catch (error) {
    if (error instanceof DriveError && (error.status === 404 || error.status === 400)) {
      return action(await ensureTree(userId, token, true));
    }
    throw error;
  }
}

/** null — Диск не підключено; це не помилка, просто нема куди складати. */
async function tokenFor(userId: string): Promise<string | null> {
  try {
    return await getAccessToken(userId);
  } catch {
    return null;
  }
}

export async function fileReceiptToDrive(
  userId: string,
  receipt: { pdf: Buffer; fileName: string; occurredOn: string },
): Promise<FiledFile | null> {
  const token = await tokenFor(userId);
  if (!token) return null;

  const year = receipt.occurredOn.slice(0, 4) || String(new Date().getFullYear());

  return withFreshTree(userId, token, async (folders) => {
    const target = await ensureFolder(token, year, folders.receipts!);
    const file = await uploadFile(token, {
      name: `${safeFileName(receipt.fileName, 110)}.pdf`,
      mimeType: "application/pdf",
      parentId: target,
      data: receipt.pdf,
    });
    return { id: file.id, link: file.webViewLink };
  });
}

export async function fileDocumentToDrive(
  userId: string,
  doc: { pdf: Buffer; metadata: string; folderName: string; fileName: string },
): Promise<FiledDocument | null> {
  const token = await tokenFor(userId);
  if (!token) return null;

  const folder = safeFileName(doc.folderName, 40) || "Без адресата";
  const base = safeFileName(doc.fileName, 110) || "Документ";

  return withFreshTree(userId, token, async (folders) => {
    const target = await ensureFolder(token, folder, folders.documents!);

    const file = await uploadFile(token, {
      name: `${base}.pdf`,
      mimeType: "application/pdf",
      parentId: target,
      data: doc.pdf,
    });

    // Текстовий супутник поруч: пошук Google Диска читає його вміст,
    // тож документ знаходиться за будь-яким словом із метаданих.
    const meta = await uploadFile(token, {
      name: `${base}.txt`,
      mimeType: "text/plain",
      parentId: target,
      data: Buffer.from(doc.metadata, "utf8"),
    });

    return {
      file: { id: file.id, link: file.webViewLink },
      meta: { id: meta.id, link: meta.webViewLink },
      folder,
    };
  });
}

export async function uploadBackupToDrive(
  userId: string,
  backup: { name: string; mimeType: string; data: Buffer },
): Promise<FiledFile | null> {
  const token = await tokenFor(userId);
  if (!token) return null;

  return withFreshTree(userId, token, async (folders) => {
    const file = await uploadFile(token, {
      name: backup.name,
      mimeType: backup.mimeType,
      parentId: folders.backups!,
      data: backup.data,
    });
    return { id: file.id, link: file.webViewLink };
  });
}

/** Готує дерево одразу після підключення, щоб теки з'явилися на Диску відразу. */
export async function prepareDrive(userId: string): Promise<string | null> {
  const token = await tokenFor(userId);
  if (!token) return null;

  const folders = await ensureTree(userId, token, true);
  return folders.root ? folderLink(folders.root) : null;
}

export { ensureFolderPath, folderLink };
