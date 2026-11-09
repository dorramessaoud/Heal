const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const dbPath = path.join(__dirname, 'barrier_data.db');
const db = new DatabaseSync(dbPath);

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS problems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
    is_core INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    problem_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    location_note TEXT,
    FOREIGN KEY (problem_id) REFERENCES problems(id)
  );

  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    problem_id INTEGER NOT NULL,
    story_text TEXT NOT NULL,
    impact_tag TEXT,
    author_alias TEXT DEFAULT 'Anonymous Student',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (problem_id) REFERENCES problems(id)
  );
`);

// Seed ONLY the 3 Core Problems (Zero fake reports, zero fake stories)
const countStmt = db.prepare('SELECT COUNT(*) as count FROM problems');
const row = countStmt.get();

if (row.count === 0) {
  const insertProblem = db.prepare(`
    INSERT INTO problems (slug, title, category, description, icon, is_core, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `);

  const now = new Date().toISOString();
  
  insertProblem.run(
    'uncomfortable-seats',
    'Uncomfortable Classroom Seats',
    'Physical / Seating',
    'Rigid, unergonomic benches and broken chairs that cause chronic back pain, physical strain, and make sitting through lectures painful.',
    '💺',
    now
  );

  insertProblem.run(
    'no-elevators',
    'No Elevators / Broken Elevators',
    'Physical / Mobility',
    'Out-of-service elevators force students with mobility impairments, injuries, asthma, or chronic pain to navigate high staircases or avoid upper floors entirely.',
    '🛗',
    now
  );

  insertProblem.run(
    'long-classes',
    'Long Classes Without Accessible Breaks',
    'Sensory / Cognitive / Energy',
    'Continuous 2-to-3 hour sessions without movement or sensory breaks, causing severe fatigue, pain flare-ups, and focus breakdown for students with ADHD and sensory sensitivities.',
    '⏳',
    now
  );
}

module.exports = db;
