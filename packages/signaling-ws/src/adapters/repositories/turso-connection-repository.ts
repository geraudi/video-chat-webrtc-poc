import { type Client, createClient } from '@libsql/client/web';
import type {
  Connection,
  IConnectionRepository
} from '@repo/signaling-core/domains/connection';

/**
 * Production database adapter backed by Turso.
 * Uses the fetch-based web client, which speaks the actual Turso HTTP
 * protocol and bundles cleanly (no native bindings).
 */
export class TursoConnectionRepository implements IConnectionRepository {
  private readonly client: Client;

  constructor(url: string, authToken: string) {
    this.client = createClient({ url, authToken });
  }

  async findAvailable(excluding: string): Promise<Connection | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM connection WHERE id <> ? AND isAvailable = 1 LIMIT 1',
      args: [excluding]
    });
    const row = result.rows[0];
    return row
      ? { id: String(row.id), isAvailable: Boolean(row.isAvailable) }
      : null;
  }

  async setAvailable(id: string): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE connection SET isAvailable = 1 WHERE id = ?',
      args: [id]
    });
  }

  async setUnavailable(id: string): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE connection SET isAvailable = 0 WHERE id = ?',
      args: [id]
    });
  }

  async create(connectionId: string): Promise<void> {
    await this.client.execute({
      sql: 'INSERT INTO connection (id, isAvailable) VALUES (?, ?)',
      args: [connectionId, 0]
    });
  }

  async delete(connectionId: string): Promise<void> {
    await this.client.execute({
      sql: 'DELETE FROM connection WHERE id = ?',
      args: [connectionId]
    });
  }

  async countAvailable(): Promise<number> {
    const result = await this.client.execute({
      sql: 'SELECT COUNT(*) AS n FROM connection WHERE isAvailable = 1'
    });
    const row = result.rows[0];
    return Number(row?.n ?? 0);
  }
}
