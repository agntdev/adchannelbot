/** Durable ad/feed records. The Worker binds D1 as `DB`; no keyspace scans. */
export interface D1Result { meta?: { last_row_id?: number | string } }
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<D1Result>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
}
export interface D1Database { prepare(query: string): D1Statement; exec(query: string): Promise<unknown> }

export interface Ad {
  id: number;
  ownerId: string;
  title: string;
  body: string;
  imageUrl?: string;
  videoUrl?: string;
  link?: string;
  sourceType: "manual" | "feed";
  timestamp: number;
  postedStatus: "posted" | "deleted" | "failed";
  contentHash: string;
  channelId?: string;
  channelMessageId?: number;
}

type Row = Omit<Ad, "imageUrl" | "videoUrl" | "link" | "channelId" | "channelMessageId"> & {
  imageUrl: string | null; videoUrl: string | null; link: string | null;
  channelId: string | null; channelMessageId: number | null;
};

function adFromRow(row: Row): Ad {
  return { ...row, id: Number(row.id), timestamp: Number(row.timestamp),
    imageUrl: row.imageUrl ?? undefined, videoUrl: row.videoUrl ?? undefined,
    link: row.link ?? undefined, channelId: row.channelId ?? undefined,
    channelMessageId: row.channelMessageId ?? undefined };
}

export class AdsStore {
  private ready = false;
  constructor(private readonly db: D1Database) {}
  private async schema(): Promise<void> {
    if (this.ready) return;
    await this.db.exec(`CREATE TABLE IF NOT EXISTS ads (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ownerId TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
      imageUrl TEXT, videoUrl TEXT, link TEXT, sourceType TEXT NOT NULL, timestamp INTEGER NOT NULL,
      postedStatus TEXT NOT NULL, contentHash TEXT NOT NULL, channelId TEXT, channelMessageId INTEGER,
      UNIQUE(ownerId, contentHash));
      CREATE INDEX IF NOT EXISTS ads_owner_recent ON ads(ownerId, timestamp DESC);
      CREATE TABLE IF NOT EXISTS feed_history (ownerId TEXT NOT NULL, itemHash TEXT NOT NULL, seenAt INTEGER NOT NULL,
      PRIMARY KEY(ownerId, itemHash));
      CREATE TABLE IF NOT EXISTS feed_state (ownerId TEXT PRIMARY KEY, feedUrl TEXT NOT NULL, lastPolled INTEGER NOT NULL);`);
    this.ready = true;
  }
  async findByHash(ownerId: string, contentHash: string): Promise<Ad | undefined> {
    await this.schema();
    const row = await this.db.prepare("SELECT * FROM ads WHERE ownerId = ? AND contentHash = ?").bind(ownerId, contentHash).first<Row>();
    return row ? adFromRow(row) : undefined;
  }
  async add(ad: Omit<Ad, "id">): Promise<Ad> {
    await this.schema();
    const r = await this.db.prepare(`INSERT INTO ads (ownerId,title,body,imageUrl,videoUrl,link,sourceType,timestamp,postedStatus,contentHash,channelId,channelMessageId)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(ad.ownerId, ad.title, ad.body, ad.imageUrl ?? null, ad.videoUrl ?? null,
      ad.link ?? null, ad.sourceType, ad.timestamp, ad.postedStatus, ad.contentHash, ad.channelId ?? null,
      ad.channelMessageId ?? null).run();
    return { ...ad, id: Number(r.meta?.last_row_id) };
  }
  async recent(ownerId: string): Promise<Ad[]> {
    await this.schema();
    const rows = await this.db.prepare("SELECT * FROM ads WHERE ownerId = ? ORDER BY timestamp DESC LIMIT 10").bind(ownerId).all<Row>();
    return rows.results.map(adFromRow);
  }
  async byId(ownerId: string, id: number): Promise<Ad | undefined> {
    await this.schema();
    const row = await this.db.prepare("SELECT * FROM ads WHERE ownerId = ? AND id = ?").bind(ownerId, id).first<Row>();
    return row ? adFromRow(row) : undefined;
  }
  async setStatus(ownerId: string, id: number, status: Ad["postedStatus"], channelMessageId?: number): Promise<void> {
    await this.schema();
    await this.db.prepare("UPDATE ads SET postedStatus = ?, channelMessageId = COALESCE(?, channelMessageId) WHERE ownerId = ? AND id = ?")
      .bind(status, channelMessageId ?? null, ownerId, id).run();
  }
  async hasFeedItem(ownerId: string, hash: string): Promise<boolean> {
    await this.schema();
    const prior = await this.db.prepare("SELECT itemHash FROM feed_history WHERE ownerId = ? AND itemHash = ?").bind(ownerId, hash).first<{ itemHash: string }>();
    return prior !== null;
  }
  async markFeedItem(ownerId: string, hash: string, now: number, feedUrl: string): Promise<void> {
    await this.schema();
    await this.db.prepare("INSERT INTO feed_history (ownerId,itemHash,seenAt) VALUES (?,?,?)").bind(ownerId, hash, now).run();
    await this.db.prepare("INSERT INTO feed_state (ownerId,feedUrl,lastPolled) VALUES (?,?,?) ON CONFLICT(ownerId) DO UPDATE SET feedUrl=excluded.feedUrl,lastPolled=excluded.lastPolled")
      .bind(ownerId, feedUrl, now).run();
  }
}

export function databaseFrom(ctx: { env?: { DB?: unknown } }): D1Database | undefined {
  const db = ctx.env?.DB;
  return db && typeof (db as D1Database).prepare === "function" ? db as D1Database : undefined;
}
