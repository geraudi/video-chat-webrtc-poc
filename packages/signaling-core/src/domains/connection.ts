/**
 * Domain model for a peer connection
 */
export interface Connection {
  id: string;
  isAvailable: boolean;
}

/**
 * Port (interface) for connection persistence
 */
export interface IConnectionRepository {
  /**
   * Find an available peer, excluding the given connection ID
   */
  findAvailable(excluding: string): Promise<Connection | null>;

  /**
   * Atomically find and claim an available peer, excluding the given
   * connection ID. The peer is marked unavailable in the same operation, so
   * concurrent callers can never be matched with the same peer.
   */
  claimAvailable(excluding: string): Promise<Connection | null>;

  /**
   * Mark a connection as available for matching
   */
  setAvailable(id: string): Promise<void>;

  /**
   * Mark a connection as unavailable (matched/in a call)
   */
  setUnavailable(id: string): Promise<void>;

  /**
   * Create a new connection record
   */
  create(connectionId: string): Promise<void>;

  /**
   * Pair two connections (set each other as strangers) and mark both
   * unavailable. Used when a match is established.
   */
  pair(a: string, b: string): Promise<void>;

  /**
   * Return the stranger's connection id for a connection, or null if unpaired.
   */
  getStranger(connectionId: string): Promise<string | null>;

  /**
   * Clear the stranger association of a connection, but only if it still
   * points at expectedStrangerId. Guarding against the expected value prevents
   * a stale cleanup from clobbering a newer pairing.
   */
  unpair(connectionId: string, expectedStrangerId: string): Promise<void>;

  /**
   * Delete a connection record
   */
  delete(connectionId: string): Promise<void>;

  /**
   * Count how many connections are currently flagged as available (waiting
   * for a match). Used by health/debug endpoints to expose matching state.
   */
  countAvailable(): Promise<number>;
}
