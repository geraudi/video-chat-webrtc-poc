import type { IConnectionRepository } from '../domains/connection.js';

/**
 * Use case: Handle a new WebSocket connection (peer registers).
 */
export class ConnectPeer {
  constructor(private repo: IConnectionRepository) {}

  async execute(connectionId: string): Promise<void> {
    await this.repo.create(connectionId);
  }
}