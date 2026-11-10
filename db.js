const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  const client = await pool.connect();
  try {
    // Create tables if they don't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS problems (
        id SERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        icon TEXT NOT NULL,
        is_core INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        status TEXT DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        problem_id INTEGER NOT NULL REFERENCES problems(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        location_note TEXT
      );

      CREATE TABLE IF NOT EXISTS stories (
        id SERIAL PRIMARY KEY,
        problem_id INTEGER NOT NULL REFERENCES problems(id),
        story_text TEXT NOT NULL,
        impact_tag TEXT,
        author_alias TEXT DEFAULT 'Anonymous Student',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Seed only if no problems exist yet
    const { rows } = await client.query('SELECT COUNT(*) as count FROM problems');
    if (parseInt(rows[0].count, 10) === 0) {
      const now = new Date().toISOString();
      const insert = `
        INSERT INTO problems (slug, title, category, description, icon, is_core, created_at)
        VALUES ($1, $2, $3, $4, $5, 1, $6)
      `;

      await client.query(insert, [
        'uncomfortable-seats',
        'Uncomfortable Classroom Seats',
        'Physical / Seating',
        'Rigid, unergonomic benches and broken chairs that cause chronic back pain, physical strain, and make sitting through lectures painful.',
        '💺',
        now
      ]);

      await client.query(insert, [
        'no-elevators',
        'No Elevators / Broken Elevators',
        'Physical / Mobility',
        'Out-of-service elevators force students with mobility impairments, injuries, asthma, or chronic pain to navigate high staircases or avoid upper floors entirely.',
        '🛗',
        now
      ]);

      await client.query(insert, [
        'long-classes',
        'Long Classes Without Accessible Breaks',
        'Sensory / Cognitive / Energy',
        'Continuous 2-to-3 hour sessions without movement or sensory breaks, causing severe fatigue, pain flare-ups, and focus breakdown for students with ADHD and sensory sensitivities.',
        '⏳',
        now
      ]);

      console.log('✅ Database seeded with 3 core barriers');
    }

    console.log('✅ Database initialized successfully');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
