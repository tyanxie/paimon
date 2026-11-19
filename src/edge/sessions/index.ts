import type {
  SessionIndex,
  SessionQuery,
  SessionQueryResult,
  SessionSummary,
} from "./types";

export class MemorySessionIndex implements SessionIndex {
  private directories = new Map<string, Map<string, SessionSummary>>();

  async replaceDirectory(
    directory: string,
    sessions: SessionSummary[],
  ): Promise<void> {
    this.directories.set(
      directory,
      new Map(sessions.map((session) => [session.path, session])),
    );
  }

  async updateSession(
    directory: string,
    session: SessionSummary,
  ): Promise<void> {
    let sessions = this.directories.get(directory);
    if (!sessions) {
      sessions = new Map();
      this.directories.set(directory, sessions);
    }
    sessions.set(session.path, session);
  }

  async removeSession(directory: string, path: string): Promise<void> {
    this.directories.get(directory)?.delete(path);
  }

  async query(
    directory: string,
    params?: SessionQuery,
  ): Promise<SessionQueryResult> {
    const filter = params?.filter?.toLowerCase();
    const offset = params?.offset ?? 0;
    const limit = params?.limit ?? 20;
    const sessions = [...(this.directories.get(directory)?.values() ?? [])]
      .filter(
        (session) =>
          !filter ||
          session.name?.toLowerCase().includes(filter) ||
          session.firstMessage.toLowerCase().includes(filter),
      )
      .sort(
        (a, b) =>
          Date.parse(b.modified) - Date.parse(a.modified) ||
          b.path.localeCompare(a.path),
      );
    const page = sessions.slice(offset, offset + limit);
    return {
      sessions: page.map((session) => ({ ...session })),
      total: sessions.length,
      hasMore: offset + page.length < sessions.length,
    };
  }
}
