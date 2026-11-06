import { SyncFileEntry, SyncFolder, SyncSubdir } from './syncFolder';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const CLIENT_ID_STORAGE_KEY = 'wb_google_oauth_client_id';

export class GoogleDriveAuthExpiredError extends Error {
  constructor(message = 'Google Drive session expired. Please reconnect your Google account.') {
    super(message);
    this.name = 'GoogleDriveAuthExpiredError';
  }
}

export interface GoogleUserInfo {
  displayName: string;
  emailAddress: string;
  photoLink?: string;
}

export interface GoogleTokenSnapshot {
  token: string | null;
  expiresAt: number;
}

export interface DriveFolderItem {
  id: string;
  name: string;
  modifiedTime?: string;
  shared?: boolean;
}

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
  scope?: string;
}

interface GisTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string; hint?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            hint?: string;
            callback: (response: GisTokenResponse) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }) => GisTokenClient;
          hasGrantedAllScopes: (
            tokenResponse: GisTokenResponse,
            firstScope: string,
            ...restScopes: string[]
          ) => boolean;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

let inMemoryAccessToken: string | null = null;
let inMemoryTokenExpiresAt = 0;

export const GoogleDriveAuth = {
  getClientId(): string {
    const envId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();
    if (envId) return envId;
    if (typeof localStorage !== 'undefined') {
      return (localStorage.getItem(CLIENT_ID_STORAGE_KEY) ?? '').trim();
    }
    return '';
  },

  setCustomClientId(clientId: string): void {
    if (typeof localStorage !== 'undefined') {
      const trimmed = clientId.trim();
      if (trimmed) {
        localStorage.setItem(CLIENT_ID_STORAGE_KEY, trimmed);
      } else {
        localStorage.removeItem(CLIENT_ID_STORAGE_KEY);
      }
    }
  },

  hasValidToken(): boolean {
    return (
      inMemoryAccessToken !== null &&
      inMemoryAccessToken.length > 0 &&
      Date.now() < inMemoryTokenExpiresAt - 30_000
    );
  },

  getAccessToken(): string | null {
    return GoogleDriveAuth.hasValidToken() ? inMemoryAccessToken : null;
  },

  getTokenSnapshot(): { token: string | null; expiresAt: number } {
    return { token: inMemoryAccessToken, expiresAt: inMemoryTokenExpiresAt };
  },

  restoreTokenSnapshot(snapshot: { token: string | null; expiresAt: number }): void {
    inMemoryAccessToken = snapshot.token;
    inMemoryTokenExpiresAt = snapshot.expiresAt;
  },

  setAccessToken(token: string, expiresInSeconds = 3599): void {
    inMemoryAccessToken = token;
    inMemoryTokenExpiresAt = Date.now() + expiresInSeconds * 1000;
  },

  clearToken(): void {
    if (inMemoryAccessToken && window.google?.accounts?.oauth2?.revoke) {
      try {
        window.google.accounts.oauth2.revoke(inMemoryAccessToken);
      } catch {
        // Ignore revoke errors
      }
    }
    inMemoryAccessToken = null;
    inMemoryTokenExpiresAt = 0;
  },

  /**
   * Opens Google Identity Services OAuth popup to select a Google account (`prompt: 'select_account'`)
   * or silently re-consent for a known `loginHint`.
   */
  requestAccessToken(options?: {
    selectAccount?: boolean;
    loginHint?: string | null;
  }): Promise<{ accessToken: string; user: GoogleUserInfo }> {
    const clientId = GoogleDriveAuth.getClientId();
    if (!clientId) {
      return Promise.reject(new Error('GOOGLE_CLIENT_ID_MISSING'));
    }
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      return Promise.reject(
        new Error(
          'Google Identity Services script failed to load. Check your internet connection or ad-blocker settings.'
        )
      );
    }

    return new Promise((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        hint: options?.loginHint ?? undefined,
        callback: async (response: GisTokenResponse) => {
          if (response.error || !response.access_token) {
            reject(
              new Error(
                response.error_description ||
                  response.error ||
                  'Google sign-in was cancelled or denied.'
              )
            );
            return;
          }
          if (
            typeof oauth2.hasGrantedAllScopes === 'function' &&
            !oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)
          ) {
            reject(
              new Error(
                'Google Drive permission was not granted. Please check the Google Drive access box when signing in.'
              )
            );
            return;
          }
          GoogleDriveAuth.setAccessToken(
            response.access_token,
            response.expires_in ?? 3599
          );
          try {
            const user = await GoogleDriveClient.fetchCurrentUser(response.access_token);
            resolve({ accessToken: response.access_token, user });
          } catch {
            resolve({
              accessToken: response.access_token,
              user: {
                displayName: options?.loginHint ?? 'Google Account',
                emailAddress: options?.loginHint ?? ''
              }
            });
          }
        },
        error_callback: (err) => {
          if (err?.type === 'popup_closed') {
            reject(new Error('Google sign-in popup was closed before completing.'));
          } else if (err?.type === 'popup_failed_to_open') {
            reject(
              new Error(
                'Browser blocked the Google sign-in popup. Please allow popups for this site.'
              )
            );
          } else {
            reject(new Error(err?.message || 'Google sign-in failed.'));
          }
        }
      });

      client.requestAccessToken({
        prompt: options?.selectAccount !== false ? 'select_account' : '',
        hint: options?.loginHint ?? undefined
      });
    });
  }
};

function escapeDriveQueryValue(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function driveFetch(
  url: string,
  init: RequestInit = {},
  explicitToken?: string
): Promise<Response> {
  const token = explicitToken ?? GoogleDriveAuth.getAccessToken();
  if (!token) {
    throw new GoogleDriveAuthExpiredError();
  }
  const headers = new Headers(init.headers ?? {});
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(url, {
    ...init,
    headers,
    cache: 'no-store'
  });
  if (response.status === 401) {
    GoogleDriveAuth.clearToken();
    throw new GoogleDriveAuthExpiredError();
  }
  return response;
}

export const GoogleDriveClient = {
  async fetchCurrentUser(explicitToken?: string): Promise<GoogleUserInfo> {
    const url = `${DRIVE_API_BASE}/about?fields=user(displayName,emailAddress,photoLink)`;
    const res = await driveFetch(url, {}, explicitToken);
    if (!res.ok) {
      throw new Error(`Failed to fetch Google user info (${res.status})`);
    }
    const data = (await res.json()) as {
      user?: { displayName?: string; emailAddress?: string; photoLink?: string };
    };
    return {
      displayName: data.user?.displayName || 'Google User',
      emailAddress: data.user?.emailAddress || '',
      photoLink: data.user?.photoLink
    };
  },

  async listFolders(params: {
    parentId?: string;
    sharedWithMe?: boolean;
    searchQuery?: string;
  }): Promise<DriveFolderItem[]> {
    const clauses: string[] = [`mimeType = '${FOLDER_MIME}'`, 'trashed = false'];
    if (params.searchQuery && params.searchQuery.trim()) {
      clauses.push(`name contains '${escapeDriveQueryValue(params.searchQuery.trim())}'`);
    } else if (params.sharedWithMe) {
      clauses.push('sharedWithMe = true');
    } else {
      const parent = params.parentId || 'root';
      clauses.push(`'${escapeDriveQueryValue(parent)}' in parents`);
    }

    const q = encodeURIComponent(clauses.join(' and '));
    const fields = encodeURIComponent('nextPageToken,files(id,name,modifiedTime,shared)');
    const allFolders: DriveFolderItem[] = [];
    let pageToken: string | undefined = undefined;
    let pages = 0;

    do {
      pages++;
      const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const url = `${DRIVE_API_BASE}/files?q=${q}&fields=${fields}&orderBy=name_natural&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${tokenParam}`;
      const res = await driveFetch(url);
      if (!res.ok) {
        throw new Error(`Failed to list Google Drive folders (${res.status})`);
      }
      const data = (await res.json()) as {
        nextPageToken?: string;
        files?: DriveFolderItem[];
      };
      if (data.files) {
        allFolders.push(...data.files);
      }
      pageToken = data.nextPageToken;
    } while (pageToken && pages < 10);

    return allFolders;
  },

  async createFolder(name: string, parentId = 'root'): Promise<DriveFolderItem> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Folder name cannot be empty.');
    }
    const url = `${DRIVE_API_BASE}/files?fields=id,name,modifiedTime&supportsAllDrives=true`;
    const res = await driveFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8'
      },
      body: JSON.stringify({
        name: trimmed,
        mimeType: FOLDER_MIME,
        parents: [parentId]
      })
    });
    if (!res.ok) {
      throw new Error(`Failed to create folder "${trimmed}" (${res.status})`);
    }
    return (await res.json()) as DriveFolderItem;
  },

  async verifyFolderAccessible(folderId: string): Promise<boolean> {
    const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(
      folderId
    )}?fields=id,name,trashed&supportsAllDrives=true`;
    const res = await driveFetch(url);
    if (!res.ok) return false;
    const data = (await res.json()) as { id?: string; trashed?: boolean };
    return Boolean(data.id) && !data.trashed;
  }
};

interface DriveRawFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  createdTime?: string;
  size?: string;
}

class GoogleDriveSyncSubdir implements SyncSubdir {
  constructor(protected readonly folderId: string) {}

  protected async listRawChildItems(): Promise<DriveRawFile[]> {
    const q = encodeURIComponent(
      `'${escapeDriveQueryValue(this.folderId)}' in parents and trashed = false`
    );
    const fields = encodeURIComponent(
      'nextPageToken,files(id,name,mimeType,modifiedTime,createdTime,size)'
    );
    const allFiles: DriveRawFile[] = [];
    let pageToken: string | undefined = undefined;
    let pages = 0;

    do {
      pages++;
      const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const url = `${DRIVE_API_BASE}/files?q=${q}&fields=${fields}&pageSize=500&supportsAllDrives=true&includeItemsFromAllDrives=true${tokenParam}`;
      const res = await driveFetch(url);
      if (!res.ok) {
        throw new Error(`Drive listFiles failed with HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        nextPageToken?: string;
        files?: DriveRawFile[];
      };
      if (data.files) {
        allFiles.push(...data.files);
      }
      pageToken = data.nextPageToken;
    } while (pageToken && pages < 20);

    return allFiles;
  }

  async listFiles(): Promise<SyncFileEntry[]> {
    const raw = await this.listRawChildItems();
    return raw
      .filter((f) => f.mimeType !== FOLDER_MIME)
      .map((f) => ({
        id: f.id,
        name: f.name,
        lastModifiedMillis: f.modifiedTime ? Date.parse(f.modifiedTime) || 0 : 0,
        sizeBytes: f.size ? Number.parseInt(f.size, 10) || 0 : 0
      }));
  }

  async readTextById(id: string, fallbackName: string): Promise<string | null> {
    if (!id) return this.readText(fallbackName);
    const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(
      id
    )}?alt=media&supportsAllDrives=true`;
    const res = await driveFetch(url);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Drive readTextById("${fallbackName}") failed with HTTP ${res.status}`);
    }
    return await res.text();
  }

  async readText(name: string): Promise<string | null> {
    const files = await this.listRawChildItems();
    const matches = files
      .filter(
        (f) =>
          f.mimeType !== FOLDER_MIME &&
          f.name.trim().toLowerCase() === name.trim().toLowerCase()
      )
      .sort((a, b) => {
        const ma = a.modifiedTime ? Date.parse(a.modifiedTime) || 0 : 0;
        const mb = b.modifiedTime ? Date.parse(b.modifiedTime) || 0 : 0;
        return mb - ma;
      });
    const target = matches[0];
    if (!target) return null;
    return this.readTextById(target.id, name);
  }

  async writeText(name: string, content: string): Promise<boolean> {
    const files = await this.listRawChildItems();
    const matches = files
      .filter(
        (f) =>
          f.mimeType !== FOLDER_MIME &&
          f.name.trim().toLowerCase() === name.trim().toLowerCase()
      )
      .sort((a, b) => {
        const ma = a.modifiedTime ? Date.parse(a.modifiedTime) || 0 : 0;
        const mb = b.modifiedTime ? Date.parse(b.modifiedTime) || 0 : 0;
        return mb - ma;
      });

    if (matches.length > 0) {
      const primary = matches[0];
      const url = `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(
        primary.id
      )}?uploadType=media&supportsAllDrives=true`;
      const res = await driveFetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'text/csv; charset=UTF-8'
        },
        body: new Blob([content], { type: 'text/csv; charset=UTF-8' })
      });
      if (!res.ok) return false;
      for (const extra of matches.slice(1)) {
        await this.trashFileById(extra.id);
      }
      return true;
    } else {
      const metadata = {
        name,
        mimeType: 'text/csv',
        parents: [this.folderId]
      };
      const boundary = `wb_multipart_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const multipartBody =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: text/csv; charset=UTF-8\r\n\r\n` +
        `${content}\r\n` +
        `--${boundary}--`;

      const url = `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&supportsAllDrives=true`;
      const res = await driveFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartBody
      });
      return res.ok;
    }
  }

  protected async trashFileById(fileId: string): Promise<boolean> {
    const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(
      fileId
    )}?supportsAllDrives=true`;
    const res = await driveFetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8'
      },
      body: JSON.stringify({ trashed: true })
    });
    return res.ok;
  }

  async deleteFileById(id: string, fallbackName: string): Promise<boolean> {
    if (!id) return this.deleteFile(fallbackName);
    return this.trashFileById(id);
  }

  async deleteFile(name: string): Promise<boolean> {
    const files = await this.listRawChildItems();
    const matches = files.filter(
      (f) =>
        f.mimeType !== FOLDER_MIME &&
        f.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
    if (matches.length === 0) return false;
    let allOk = true;
    for (const m of matches) {
      const ok = await this.trashFileById(m.id);
      if (!ok) allOk = false;
    }
    return allOk;
  }
}

export class GoogleDriveSyncFolder extends GoogleDriveSyncSubdir implements SyncFolder {
  readonly displayName: string;
  readonly folderIdOrUri: string;

  constructor(folderId: string, displayName: string) {
    super(folderId);
    this.displayName = displayName;
    this.folderIdOrUri = `gdrive://${folderId}`;
  }

  static parseFolderId(uri: string | null): string | null {
    if (!uri) return null;
    if (uri.startsWith('gdrive://')) {
      return uri.slice('gdrive://'.length).trim() || null;
    }
    return null;
  }

  async isAccessible(): Promise<boolean> {
    return GoogleDriveClient.verifyFolderAccessible(this.folderId);
  }

  async subDirectory(name: string, createIfMissing = true): Promise<SyncSubdir | null> {
    const items = await this.listRawChildItems();
    const folders = items
      .filter(
        (f) =>
          f.mimeType === FOLDER_MIME &&
          f.name.trim().toLowerCase() === name.trim().toLowerCase()
      )
      .sort((a, b) => {
        const ca = a.createdTime ? Date.parse(a.createdTime) || 0 : 0;
        const cb = b.createdTime ? Date.parse(b.createdTime) || 0 : 0;
        if (ca !== cb) return ca - cb;
        return a.id < b.id ? -1 : 1;
      });
    if (folders.length > 0) {
      return new GoogleDriveSyncSubdir(folders[0].id);
    }
    if (!createIfMissing) return null;
    const created = await GoogleDriveClient.createFolder(name, this.folderId);
    return new GoogleDriveSyncSubdir(created.id);
  }
}
