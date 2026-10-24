const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Fresh Upwork-style database (the old marketplace DB is left untouched)
const db = new Database(path.join(__dirname, 'handyman.sqlite'));
db.pragma('journal_mode = WAL');

// Initialize schema
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;
