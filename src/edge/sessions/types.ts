export interface SessionSummary {
  path: string;
  id: string;
  name?: string;
  cwd: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
}

export interface SessionQuery {
  offset?: number;
  limit?: number;
  filter?: string;
}

export interface SessionQueryResult {
  sessions: SessionSummary[];
  total: number;
  hasMore: boolean;
}

export interface SessionIndex {
  replaceDirectory(
    directory: string,
    sessions: SessionSummary[],
  ): Promise<void>;
  updateSession(directory: string, session: SessionSummary): Promise<void>;
  removeSession(directory: string, path: string): Promise<void>;
  query(directory: string, params?: SessionQuery): Promise<SessionQueryResult>;
}
