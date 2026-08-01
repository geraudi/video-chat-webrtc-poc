import type {
  Connection,
  IConnectionRepository
} from '@repo/signaling-core/domains/connection';

export class DoConnectionRepository implements IConnectionRepository {
  constructor(private ctx: DurableObjectState) {}

  async findAvailable(excluding: string): Promise<Connection | null> {
    const row = this.ctx.storage.sql
      .exec<{
        id: string;
        is_available: number;
      }>(
        'SELECT id, is_available FROM connections WHERE id != ? AND is_available = 1 LIMIT 1',
        excluding
      )
      .toArray()[0];
    return row ? { id: row.id, isAvailable: Boolean(row.is_available) } : null;
  }

  async claimAvailable(excluding: string): Promise<Connection | null> {
    const row = this.ctx.storage.sql
      .exec<{
        id: string;
        is_available: number;
      }>(
        `UPDATE connections
         SET is_available = 0
         WHERE id IN (
           SELECT id FROM connections
           WHERE id != ? AND is_available = 1
           LIMIT 1
         )
         RETURNING id, is_available`,
        excluding
      )
      .toArray()[0];
    return row ? { id: row.id, isAvailable: Boolean(row.is_available) } : null;
  }

  async setAvailable(id: string): Promise<void> {
    this.ctx.storage.sql.exec(
      'UPDATE connections SET is_available = 1 WHERE id = ?',
      id
    );
  }

  async setUnavailable(id: string): Promise<void> {
    this.ctx.storage.sql.exec(
      'UPDATE connections SET is_available = 0 WHERE id = ?',
      id
    );
  }

  async create(connectionId: string): Promise<void> {
    this.ctx.storage.sql.exec(
      'INSERT OR IGNORE INTO connections (id, is_available) VALUES (?, 0)',
      connectionId
    );
  }

  async pair(a: string, b: string): Promise<void> {
    this.ctx.storage.sql.exec(
      `UPDATE connections
       SET stranger_id = ?, is_available = 0
       WHERE id = ?`,
      b,
      a
    );
    this.ctx.storage.sql.exec(
      `UPDATE connections
       SET stranger_id = ?, is_available = 0
       WHERE id = ?`,
      a,
      b
    );
  }

  async getStranger(connectionId: string): Promise<string | null> {
    const row = this.ctx.storage.sql
      .exec<{ stranger_id: string | null }>(
        'SELECT stranger_id FROM connections WHERE id = ?',
        connectionId
      )
      .toArray()[0];
    return row?.stranger_id ?? null;
  }

  async unpair(
    connectionId: string,
    expectedStrangerId: string
  ): Promise<void> {
    this.ctx.storage.sql.exec(
      'UPDATE connections SET stranger_id = NULL WHERE id = ? AND stranger_id = ?',
      connectionId,
      expectedStrangerId
    );
  }

  async delete(connectionId: string): Promise<void> {
    this.ctx.storage.sql.exec(
      'DELETE FROM connections WHERE id = ?',
      connectionId
    );
  }

  async countAvailable(): Promise<number> {
    const row = this.ctx.storage.sql
      .exec<{ n: number }>(
        'SELECT COUNT(*) AS n FROM connections WHERE is_available = 1'
      )
      .toArray()[0];
    return row?.n ?? 0;
  }
}
