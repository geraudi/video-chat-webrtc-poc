import type {
  Connection,
  IConnectionRepository
} from '../../domains/connection.js';

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

  async delete(connectionId: string): Promise<void> {
    this.ctx.storage.sql.exec(
      'DELETE FROM connections WHERE id = ?',
      connectionId
    );
  }
}
