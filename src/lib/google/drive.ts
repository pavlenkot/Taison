import { randomBytes } from "node:crypto";

const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export interface DriveFile {
  id: string;
  name: string;
  webViewLink?: string;
}

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DriveError";
  }
}

async function call(
  token: string,
  url: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new DriveError(
      `Google Диск відповів ${response.status}: ${detail.slice(0, 200)}`,
      response.status,
    );
  }

  return (await response.json()) as Record<string, unknown>;
}

/** Назва в запиті йде в одинарних лапках, тож власні лапки треба екранувати. */
function quote(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Знаходить теку за назвою або створює її.
 *
 * З дозволом drive.file застосунок бачить лише те, що створив сам, — тож
 * пошук завжди знайде або нашу теку, або нічого. Чужі теки з такою ж
 * назвою нам не видно й зачепити їх неможливо.
 */
export async function ensureFolder(
  token: string,
  name: string,
  parentId = "root",
): Promise<string> {
  const query = [
    `mimeType='${FOLDER_MIME}'`,
    `name='${quote(name)}'`,
    `'${parentId}' in parents`,
    "trashed=false",
  ].join(" and ");

  const found = (await call(
    token,
    `${FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`,
  )) as { files?: DriveFile[] };

  if (found.files && found.files.length > 0) {
    return found.files[0].id;
  }

  const created = (await call(token, FILES_URL + "?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  })) as { id: string };

  return created.id;
}

/** Послідовно створює вкладені теки і повертає ідентифікатор останньої. */
export async function ensureFolderPath(
  token: string,
  path: string[],
  rootId = "root",
): Promise<string> {
  let current = rootId;
  for (const segment of path) {
    current = await ensureFolder(token, segment, current);
  }
  return current;
}

export async function uploadFile(
  token: string,
  file: { name: string; mimeType: string; parentId: string; data: Buffer },
): Promise<DriveFile> {
  const boundary = `taison-${randomBytes(12).toString("hex")}`;
  const metadata = JSON.stringify({ name: file.name, parents: [file.parentId] });

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    ),
    Buffer.from(`--${boundary}\r\nContent-Type: ${file.mimeType}\r\n\r\n`),
    file.data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const created = (await call(
    token,
    `${UPLOAD_URL}?uploadType=multipart&fields=id,name,webViewLink`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: new Uint8Array(body),
    },
  )) as unknown as DriveFile;

  return created;
}

/** Посилання на теку, щоб відкрити її просто з застосунку. */
export function folderLink(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
