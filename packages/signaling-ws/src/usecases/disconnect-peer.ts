import type { IConnectionRepository } from '../domains/connection.js';

/**
 * Use case: Handle a WebSocket disconnection (peer unregister).
 */
export class DisconnectPeer {
  constructor(private repo: IConnectionRepository) {}

  async execute(connectionId: string): Promise<void> {
    await this.repo.delete(connectionId);
  }
}
