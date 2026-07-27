import type {
  Connection,
  IConnectionRepository
} from '../../domains/connection.js';

/**
 * In-memory connection repository for local development and testing
 */
export class InMemoryConnectionRepository implements IConnectionRepository {
  private store: Map<string, Connection> = new Map();

  async findAvailable(excluding: string): Promise<Connection | null> {
    for (const [id, conn] of this.store.entries()) {
      if (id !== excluding && conn.isAvailable) {
        return { ...conn };
      }
    }
    return null;
  }

  async setAvailable(id: string): Promise<void> {
    const existing = this.store.get(id);
    if (existing) {
      this.store.set(id, { ...existing, isAvailable: true });
    }
  }

  async setUnavailable(id: string): Promise<void> {
    const existing = this.store.get(id);
    if (existing) {
      this.store.set(id, { ...existing, isAvailable: false });
    }
  }

  async create(connectionId: string): Promise<void> {
    this.store.set(connectionId, { id: connectionId, isAvailable: false });
  }

  async delete(connectionId: string): Promise<void> {
    this.store.delete(connectionId);
  }

  /**
   * Get all connections (useful for debugging/testing)
   */
  getAll(): Map<string, Connection> {
    return new Map(this.store);
  }

  /**
   * Count how many connections are currently flagged as available (waiting
   * for a match). Used by the local server's /health endpoint so tests can
   * synchronize on real matching state.
   */
  countAvailable(): number {
    let count = 0;
    for (const conn of this.store.values()) {
      if (conn.isAvailable) count++;
    }
    return count;
  }

  /**
   * Clear all connections (useful for testing)
   */
  clear(): void {
    this.store.clear();
  }
}
