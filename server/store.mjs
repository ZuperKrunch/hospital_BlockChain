import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export function openStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(path, { timeout: 5000 })
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS profiles (
      wallet TEXT PRIMARY KEY, name TEXT NOT NULL, specialty TEXT NOT NULL DEFAULT '',
      clinic TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
      birth_date TEXT NOT NULL DEFAULT '', gender TEXT NOT NULL DEFAULT ''
    ) STRICT;
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY, patient TEXT NOT NULL, doctor TEXT NOT NULL,
      starts INTEGER NOT NULL, ends INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','checked_in','completed','cancelled')),
      CHECK(starts < ends)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS visits_doctor ON appointments(doctor, starts);
    CREATE INDEX IF NOT EXISTS visits_patient ON appointments(patient, starts);
    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY, appointment TEXT NOT NULL UNIQUE REFERENCES appointments(id),
      description TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0),
      status TEXT NOT NULL CHECK(status IN ('unpaid','paid','void')), updated INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY, appointment TEXT NOT NULL UNIQUE REFERENCES appointments(id),
      patient TEXT NOT NULL, doctor TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS versions (
      record TEXT NOT NULL REFERENCES records(id), version INTEGER NOT NULL,
      body TEXT NOT NULL, salt TEXT NOT NULL, commitment TEXT NOT NULL,
      active INTEGER NOT NULL, created INTEGER NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(record, version)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS terminals (
      token_hash TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
    ) STRICT;
    CREATE TABLE IF NOT EXISTS emergencies (
      id TEXT PRIMARY KEY, patient TEXT NOT NULL, actor TEXT NOT NULL, terminal TEXT NOT NULL,
      reason TEXT NOT NULL, starts INTEGER NOT NULL, ends INTEGER NOT NULL, closed INTEGER,
      report TEXT NOT NULL DEFAULT ''
    ) STRICT;
  `)
  if (!db.prepare('PRAGMA table_info(versions)').all().some(column => column.name === 'tx_hash')) {
    db.exec(`ALTER TABLE versions ADD COLUMN tx_hash TEXT NOT NULL DEFAULT ''`)
  }
  return {
    all: (sql, ...args) => db.prepare(sql).all(...args),
    get: (sql, ...args) => db.prepare(sql).get(...args),
    run: (sql, ...args) => db.prepare(sql).run(...args),
    atomic(fn) {
      db.exec('BEGIN IMMEDIATE')
      try { const result = fn(); db.exec('COMMIT'); return result }
      catch (error) { db.exec('ROLLBACK'); throw error }
    },
    close: () => db.close(),
  }
}
