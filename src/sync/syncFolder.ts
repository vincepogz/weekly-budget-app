/**
 * Async abstraction over a linked sync folder (Google Drive folder, Browser FileSystemDirectoryHandle,
 * or in-memory test folder). Mirrors Kotlin `SyncFolder.kt` and `SyncSubdir`.
 */

export interface SyncFileEntry {
  id?: string;
  name: string;
  lastModifiedMillis: number;
  sizeBytes: number;
}

export interface SyncSubdir {
  listFiles(): Promise<SyncFileEntry[]>;
  readText(name: string): Promise<string | null>;
  readTextById?(id: string, fallbackName: string): Promise<string | null>;
  writeText(name: string, content: string): Promise<boolean>;
  deleteFile(name: string): Promise<boolean>;
  deleteFileById?(id: string, fallbackName: string): Promise<boolean>;
}

export interface SyncFolder extends SyncSubdir {
  readonly displayName: string;
  readonly folderIdOrUri: string;
  isAccessible(): Promise<boolean>;
  subDirectory(name: string, createIfMissing?: boolean): Promise<SyncSubdir | null>;
}

/**
 * In-memory `SyncFolder` implementation used for unit tests, golden convergence tests,
 * and failure-injection simulations.
 */
export class InMemorySyncSubdir implements SyncSubdir {
  protected files = new Map<string, { content: string; lastModifiedMillis: number }>();

  async listFiles(): Promise<SyncFileEntry[]> {
    const out: SyncFileEntry[] = [];
    for (const [name, entry] of this.files.entries()) {
      out.push({
        id: name,
        name,
        lastModifiedMillis: entry.lastModifiedMillis,
        sizeBytes: new TextEncoder().encode(entry.content).length
      });
    }
    return out;
  }

  async readText(name: string): Promise<string | null> {
    return this.files.get(name)?.content ?? null;
  }

  async readTextById(id: string, fallbackName: string): Promise<string | null> {
    return this.files.get(id)?.content ?? this.files.get(fallbackName)?.content ?? null;
  }

  async writeText(name: string, content: string): Promise<boolean> {
    this.files.set(name, { content, lastModifiedMillis: Date.now() });
    return true;
  }

  async deleteFile(name: string): Promise<boolean> {
    return this.files.delete(name);
  }

  async deleteFileById(id: string, fallbackName: string): Promise<boolean> {
    return this.files.delete(id) || this.files.delete(fallbackName);
  }
}

export class InMemorySyncFolder extends InMemorySyncSubdir implements SyncFolder {
  readonly displayName: string;
  readonly folderIdOrUri: string;
  private subdirs = new Map<string, InMemorySyncSubdir>();
  accessible = true;

  constructor(displayName = 'Test Folder', folderIdOrUri = 'mem://test-folder') {
    super();
    this.displayName = displayName;
    this.folderIdOrUri = folderIdOrUri;
  }

  async isAccessible(): Promise<boolean> {
    return this.accessible;
  }

  async subDirectory(name: string, createIfMissing = true): Promise<SyncSubdir | null> {
    const existing = this.subdirs.get(name);
    if (existing) return existing;
    if (!createIfMissing) return null;
    const created = new InMemorySyncSubdir();
    this.subdirs.set(name, created);
    return created;
  }
}

/**
 * Browser File System Access API (`FileSystemDirectoryHandle`) implementation of `SyncFolder`.
 */
export class FsaSyncSubdir implements SyncSubdir {
  constructor(protected readonly dirHandle: FileSystemDirectoryHandle) {}

  async listFiles(): Promise<SyncFileEntry[]> {
    const entries: SyncFileEntry[] = [];
    const iterable = (this.dirHandle as unknown as {
      values(): AsyncIterable<FileSystemHandle>;
    }).values();
    for await (const handle of iterable) {
      if (handle.kind === 'file' && !handle.name.endsWith('.crswap')) {
        try {
          const file = await (handle as FileSystemFileHandle).getFile();
          entries.push({
            id: handle.name,
            name: handle.name,
            lastModifiedMillis: file.lastModified || 0,
            sizeBytes: file.size || 0
          });
        } catch {
          // Ignore transient files
        }
      }
    }
    return entries;
  }

  async readText(name: string): Promise<string | null> {
    try {
      const fileHandle = await this.dirHandle.getFileHandle(name, { create: false });
      const file = await fileHandle.getFile();
      return await file.text();
    } catch {
      return null;
    }
  }

  async readTextById(_id: string, fallbackName: string): Promise<string | null> {
    return this.readText(fallbackName);
  }

  async writeText(name: string, content: string): Promise<boolean> {
    try {
      const fileHandle = await this.dirHandle.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch {
      return false;
    }
  }

  async deleteFile(name: string): Promise<boolean> {
    try {
      await this.dirHandle.removeEntry(name);
      return true;
    } catch {
      return false;
    }
  }

  async deleteFileById(_id: string, fallbackName: string): Promise<boolean> {
    return this.deleteFile(fallbackName);
  }
}

export class FsaSyncFolder extends FsaSyncSubdir implements SyncFolder {
  readonly displayName: string;
  readonly folderIdOrUri: string;

  constructor(dirHandle: FileSystemDirectoryHandle) {
    super(dirHandle);
    this.displayName = dirHandle.name || 'Local Folder';
    this.folderIdOrUri = `fsa://${dirHandle.name}`;
  }

  async isAccessible(): Promise<boolean> {
    try {
      const h = this.dirHandle as unknown as {
        queryPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
        requestPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
      };
      if (typeof h.queryPermission === 'function') {
        const perm = await h.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') return true;
        if (typeof h.requestPermission === 'function') {
          const req = await h.requestPermission({ mode: 'readwrite' });
          return req === 'granted';
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  async subDirectory(name: string, createIfMissing = true): Promise<SyncSubdir | null> {
    try {
      const subHandle = await this.dirHandle.getDirectoryHandle(name, {
        create: createIfMissing
      });
      return new FsaSyncSubdir(subHandle);
    } catch {
      return null;
    }
  }
}
