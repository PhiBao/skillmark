import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

export interface ListingRow {
  name: string;
  version: string;
  description: string;
  manifestHash: string;
  sig: string;
  bundleSha256: string;
  sizeBytes: number;
  price: string | null;
  payTo: string | null;
  publisherAccount: string;
  status: string;
  publishedAt: string;
}

export interface Store {
  db: Database.Database;
  insertListing(row: ListingRow): void;
  getListing(name: string, version: string): ListingRow | undefined;
  listListings(): ListingRow[];
  addSettlement(row: {
    name: string;
    version: string;
    txHash: string;
    payer: string;
    amountMicroCcd: string;
  }): void;
  settlements(
    name: string,
    version: string,
    limit?: number,
  ): Array<{ txHash: string; payer: string; amountMicroCcd: string; createdAt: string }>;
  settlementCount(name: string, version: string): number;
  listingHistory(
    name: string,
    version?: string,
  ): Array<{
    name: string;
    version: string;
    manifestHash: string;
    keyHex: string;
    keyNamespace: string;
    keyType: string;
    price: string | null;
    payTo: string | null;
    publisherAccount: string;
    publishedAt: string;
  }>;
  addKeyHistory(row: { key: string; name: string; version: string; result: string }): void;
}

export function openStore(dataDir: string): Store {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, "index.sqlite"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      name TEXT NOT NULL, version TEXT NOT NULL, description TEXT NOT NULL,
      manifestHash TEXT NOT NULL, sig TEXT NOT NULL, bundleSha256 TEXT NOT NULL,
      sizeBytes INTEGER NOT NULL, price TEXT, payTo TEXT, publisherAccount TEXT NOT NULL,
      status TEXT NOT NULL, publishedAt TEXT NOT NULL,
      PRIMARY KEY (name, version)
    );
    CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, version TEXT NOT NULL,
      txHash TEXT NOT NULL, payer TEXT NOT NULL, amountMicroCcd TEXT NOT NULL, createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS key_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, name TEXT NOT NULL,
      version TEXT NOT NULL, result TEXT NOT NULL, createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS listing_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, version TEXT NOT NULL,
      manifestHash TEXT NOT NULL, keyHex TEXT NOT NULL, keyNamespace TEXT NOT NULL,
      keyType TEXT NOT NULL, price TEXT, payTo TEXT, publisherAccount TEXT NOT NULL,
      publishedAt TEXT NOT NULL, UNIQUE(name, version, manifestHash)
    );
    DELETE FROM settlements WHERE id NOT IN (
      SELECT MIN(id) FROM settlements GROUP BY name, version, txHash
    );
    CREATE UNIQUE INDEX IF NOT EXISTS settlement_identity
      ON settlements(name, version, txHash);
  `);
  const insertListing = db.prepare(
    `INSERT INTO listings (name,version,description,manifestHash,sig,bundleSha256,sizeBytes,price,payTo,publisherAccount,status,publishedAt)
     VALUES (@name,@version,@description,@manifestHash,@sig,@bundleSha256,@sizeBytes,@price,@payTo,@publisherAccount,@status,@publishedAt)
     ON CONFLICT(name,version) DO UPDATE SET description=excluded.description, manifestHash=excluded.manifestHash,
       sig=excluded.sig, bundleSha256=excluded.bundleSha256, sizeBytes=excluded.sizeBytes, price=excluded.price,
       payTo=excluded.payTo, publisherAccount=excluded.publisherAccount, status=excluded.status, publishedAt=excluded.publishedAt`,
  );
  const getListingStmt = db.prepare("SELECT * FROM listings WHERE name = ? AND version = ?");
  const listListingsStmt = db.prepare("SELECT * FROM listings ORDER BY publishedAt DESC");
  const addSettlementStmt = db.prepare(
    "INSERT OR IGNORE INTO settlements (name,version,txHash,payer,amountMicroCcd,createdAt) VALUES (?,?,?,?,?,?)",
  );
  const settlementsStmt = db.prepare(
    "SELECT txHash,payer,amountMicroCcd,createdAt FROM settlements WHERE name=? AND version=? ORDER BY id DESC LIMIT ?",
  );
  const settlementCountStmt = db.prepare(
    "SELECT COUNT(*) AS count FROM settlements WHERE name=? AND version=?",
  );
  const insertListingEventStmt = db.prepare(
    `INSERT OR IGNORE INTO listing_events
      (name,version,manifestHash,keyHex,keyNamespace,keyType,price,payTo,publisherAccount,publishedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  const listingHistoryStmt = db.prepare(
    "SELECT name,version,manifestHash,keyHex,keyNamespace,keyType,price,payTo,publisherAccount,publishedAt FROM listing_events WHERE name=? ORDER BY id DESC",
  );
  const listingVersionHistoryStmt = db.prepare(
    "SELECT name,version,manifestHash,keyHex,keyNamespace,keyType,price,payTo,publisherAccount,publishedAt FROM listing_events WHERE name=? AND version=? ORDER BY id DESC",
  );
  const addKeyHistoryStmt = db.prepare(
    "INSERT INTO key_history (key,name,version,result,createdAt) VALUES (?,?,?,?,?)",
  );
  return {
    db,
    insertListing: (row) => {
      insertListing.run(row);
      const key = (
        JSON.parse(row.sig) as {
          statement?: {
            key?: { namespace?: string; key_type?: string; public_key_hex?: string };
          };
        }
      ).statement?.key;
      if (key?.public_key_hex) {
        insertListingEventStmt.run(
          row.name,
          row.version,
          row.manifestHash,
          key.public_key_hex,
          key.namespace ?? "skillmark:v1",
          key.key_type ?? "ed25519",
          row.price,
          row.payTo,
          row.publisherAccount,
          row.publishedAt,
        );
      }
    },
    getListing: (name, version) => getListingStmt.get(name, version) as ListingRow | undefined,
    listListings: () => listListingsStmt.all() as ListingRow[],
    addSettlement: (row) => {
      addSettlementStmt.run(
        row.name,
        row.version,
        row.txHash,
        row.payer,
        row.amountMicroCcd,
        new Date().toISOString(),
      );
    },
    settlements: (name, version, limit = 5) =>
      settlementsStmt.all(name, version, limit) as Array<{
        txHash: string;
        payer: string;
        amountMicroCcd: string;
        createdAt: string;
      }>,
    settlementCount: (name, version) =>
      (settlementCountStmt.get(name, version) as { count: number }).count,
    listingHistory: (name, version) =>
      (version ? listingVersionHistoryStmt : listingHistoryStmt).all(
        name,
        ...(version ? [version] : []),
      ) as Array<{
        name: string;
        version: string;
        manifestHash: string;
        keyHex: string;
        keyNamespace: string;
        keyType: string;
        price: string | null;
        payTo: string | null;
        publisherAccount: string;
        publishedAt: string;
      }>,
    addKeyHistory: (row) => {
      addKeyHistoryStmt.run(row.key, row.name, row.version, row.result, new Date().toISOString());
    },
  };
}
