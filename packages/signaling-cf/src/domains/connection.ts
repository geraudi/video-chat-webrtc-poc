export interface Connection {
  id: string;
  isAvailable: boolean;
}

export interface IConnectionRepository {
  findAvailable(excluding: string): Promise<Connection | null>;
  setAvailable(id: string): Promise<void>;
  setUnavailable(id: string): Promise<void>;
  create(connectionId: string): Promise<void>;
  delete(connectionId: string): Promise<void>;
  countAvailable(): Promise<number>;
}
