import type { IConnectionRepository } from '../domains/connection.js';

export class DisconnectPeer {
  constructor(private repo: IConnectionRepository) {}

  async execute(connectionId: string): Promise<void> {
    await this.repo.delete(connectionId);
  }
}
