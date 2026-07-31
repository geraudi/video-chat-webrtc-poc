import type { IConnectionRepository } from '../domains/connection.js';

export class ConnectPeer {
  constructor(private repo: IConnectionRepository) {}

  async execute(connectionId: string): Promise<void> {
    await this.repo.create(connectionId);
  }
}
