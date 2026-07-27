import type { Connection, IConnectionRepository } from '../../domains/connection.js';

/**
 * Convert a Turso connection URL to the REST API base URL.
 * Handles libsql://, turso://, and https:// URL formats.
 */
function getRestBaseUrl(): string {
  const url = process.env.TURSO_DATABASE_URL || '';
  
  // If it's already an HTTPS REST URL, return the base (without /query suffix)
  if (url.startsWith('https://') || url.startsWith('http://')) {
    return url.replace(/\/query\s*$/, '');
  }
  
  // For libsql:// or turso:// URLs, extract the host and path, then use HTTPS on that same host
  // Format: libsql://<host>/<org>/<db> or turso://<host>/<org>/<db>
  // The REST API endpoint uses the same host as the connection URL with /api/v1/ prefix
  if (url.startsWith('libsql://') || url.startsWith('turso://')) {
    const dbPath = url.replace(/^(libsql|turso):\/\//, '');
    return `https://${dbPath}/api/v1`;
  }
  
  throw new Error('TURSO_DATABASE_URL is not set or has an unsupported format');
}

/**
 * Execute a query against the Turso REST API.
 */
function executeQuery<T>(sql: string, args: unknown[]): Promise<{ rows: T[] }> {
  const authToken = process.env.TURSO_AUTH_TOKEN || '';
  if (!authToken) throw new Error('TURSO_AUTH_TOKEN is not set');
  
  const baseUrl = getRestBaseUrl();
  const url = `${baseUrl}/query`;

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ sql, args })
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Turso API error ${res.status}: ${text}`);
    }
    return res.json() as Promise<{ rows: T[] }>;
  });
}

/**
 * Production database adapter using Turso REST API.
 * Uses native fetch() instead of @libsql/client to avoid complex conditional exports
 * that esbuild cannot properly bundle for Lambda deployment.
 */
export class TursoConnectionRepository implements IConnectionRepository {
  async findAvailable(excluding: string): Promise<Connection | null> {
    const result = await executeQuery<{ id: string; isAvailable: number }>(
      'SELECT * FROM connection WHERE id <> ? AND isAvailable = 1 LIMIT 1',
      [excluding]
    );
    const row = result.rows?.[0];
    return row ? { id: row.id, isAvailable: Boolean(row.isAvailable) } : null;
  }

  async setAvailable(id: string): Promise<void> {
    await executeQuery<number>(
      'UPDATE connection SET isAvailable = 1 WHERE id = ?',
      [id]
    );
  }

  async setUnavailable(id: string): Promise<void> {
    await executeQuery<number>(
      'UPDATE connection SET isAvailable = 0 WHERE id = ?',
      [id]
    );
  }

  async create(connectionId: string): Promise<void> {
    await executeQuery<number>(
      'INSERT INTO connection (id, isAvailable) VALUES (?, ?)',
      [connectionId, 0]
    );
  }

  async delete(connectionId: string): Promise<void> {
    await executeQuery<number>(
      'DELETE FROM connection WHERE id = ?',
      [connectionId]
    );
  }
}