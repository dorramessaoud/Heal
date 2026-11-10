const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const { pool, initDB } = require('./db.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;

// MIME types for static assets
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8',
};

// Helper to send JSON responses
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  });
  res.end(JSON.stringify(data));
}

// Helper to parse JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // -------------------------------------------------------------
  // API ROUTES
  // -------------------------------------------------------------

  // GET /api/problems - List all problems with counts and stats
  if (method === 'GET' && pathname === '/api/problems') {
    try {
      const { rows: problems } = await pool.query(`
        SELECT
          p.id,
          p.slug,
          p.title,
          p.category,
          p.description,
          p.icon,
          p.is_core,
          p.created_at,
          p.status,
          COUNT(DISTINCT r.id) AS report_count,
          COUNT(DISTINCT s.id) AS story_count,
          MIN(r.created_at) AS first_reported_at,
          CASE
            WHEN COUNT(DISTINCT r.id) = 0 THEN 0
            ELSE GREATEST(1, EXTRACT(DAY FROM NOW() - MIN(r.created_at))::INTEGER + 1)
          END AS days_active
        FROM problems p
        LEFT JOIN reports r ON p.id = r.problem_id
        LEFT JOIN stories s ON p.id = s.problem_id
        GROUP BY p.id
        ORDER BY p.is_core DESC, report_count DESC
      `);
      return sendJSON(res, 200, { success: true, problems });
    } catch (err) {
      console.error('Error fetching problems:', err);
      return sendJSON(res, 500, { success: false, error: err.message });
    }
  }

  // POST /api/problems/:id/report - Instant One-Click Report (+1)
  const reportMatch = pathname.match(/^\/api\/problems\/(\d+)\/report$/);
  if (method === 'POST' && reportMatch) {
    try {
      const problemId = parseInt(reportMatch[1], 10);
      const body = await parseBody(req);
      const locationNote = body.location_note || '';

      const { rows: check } = await pool.query('SELECT id, title FROM problems WHERE id = $1', [problemId]);
      if (check.length === 0) {
        return sendJSON(res, 404, { success: false, error: 'Problem not found' });
      }

      await pool.query('INSERT INTO reports (problem_id, location_note) VALUES ($1, $2)', [problemId, locationNote]);

      const { rows: countRows } = await pool.query('SELECT COUNT(*) as count FROM reports WHERE problem_id = $1', [problemId]);

      return sendJSON(res, 200, {
        success: true,
        message: 'Report logged successfully',
        problem_id: problemId,
        new_count: parseInt(countRows[0].count, 10)
      });
    } catch (err) {
      console.error('Error adding report:', err);
      return sendJSON(res, 500, { success: false, error: err.message });
    }
  }

  // POST /api/problems/:id/story - Submit personal story / experience
  const storyMatch = pathname.match(/^\/api\/problems\/(\d+)\/story$/);
  if (method === 'POST' && storyMatch) {
    try {
      const problemId = parseInt(storyMatch[1], 10);
      const body = await parseBody(req);

      if (!body.story_text || !body.story_text.trim()) {
        return sendJSON(res, 400, { success: false, error: 'Story text cannot be empty' });
      }

      await pool.query(
        'INSERT INTO stories (problem_id, story_text, impact_tag, author_alias) VALUES ($1, $2, $3, $4)',
        [
          problemId,
          body.story_text.trim(),
          body.impact_tag || 'General Impact',
          body.author_alias && body.author_alias.trim() ? body.author_alias.trim() : 'Anonymous Student'
        ]
      );

      return sendJSON(res, 201, {
        success: true,
        message: 'Story recorded successfully! Thank you for sharing your experience.'
      });
    } catch (err) {
      console.error('Error submitting story:', err);
      return sendJSON(res, 500, { success: false, error: err.message });
    }
  }

  // POST /api/problems - Add a new custom problem
  if (method === 'POST' && pathname === '/api/problems') {
    try {
      const body = await parseBody(req);
      if (!body.title || !body.title.trim()) {
        return sendJSON(res, 400, { success: false, error: 'Title is required' });
      }

      const title = body.title.trim();
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString().slice(-4);
      const category = body.category && body.category.trim() ? body.category.trim() : 'Campus Barrier';
      const description = body.description && body.description.trim() ? body.description.trim() : 'Problem reported by campus community member.';
      const icon = body.icon && body.icon.trim() ? body.icon.trim() : '⚠️';

      const { rows: newProb } = await pool.query(
        'INSERT INTO problems (slug, title, category, description, icon, is_core) VALUES ($1, $2, $3, $4, $5, 0) RETURNING id',
        [slug, title, category, description, icon]
      );

      // Log an initial report from the creator
      await pool.query('INSERT INTO reports (problem_id) VALUES ($1)', [newProb[0].id]);

      return sendJSON(res, 201, {
        success: true,
        message: 'New problem added to the campus barrier map',
        problem: { id: newProb[0].id, slug, title, category, description, icon, report_count: 1 }
      });
    } catch (err) {
      console.error('Error creating new problem:', err);
      return sendJSON(res, 500, { success: false, error: err.message });
    }
  }

  // GET /api/stories - List all stories
  if (method === 'GET' && pathname === '/api/stories') {
    try {
      const { rows: stories } = await pool.query(`
        SELECT
          s.id,
          s.problem_id,
          p.title AS problem_title,
          p.icon AS problem_icon,
          s.story_text,
          s.impact_tag,
          s.author_alias,
          s.created_at
        FROM stories s
        JOIN problems p ON s.problem_id = p.id
        ORDER BY s.created_at DESC
      `);
      return sendJSON(res, 200, { success: true, stories });
    } catch (err) {
      return sendJSON(res, 500, { success: false, error: err.message });
    }
  }

  // POST /api/problems/:id/status - Update problem status
  const statusMatch = pathname.match(/^\/api\/problems\/(\d+)\/status$/);
  if (method === 'POST' && statusMatch) {
    try {
      const problemId = parseInt(statusMatch[1], 10);
      const body = await parseBody(req);
      const newStatus = body.status || 'active';

      await pool.query('UPDATE problems SET status = $1 WHERE id = $2', [newStatus, problemId]);
      return sendJSON(res, 200, { success: true, message: 'Status updated', status: newStatus });
    } catch (err) {
      return sendJSON(res, 500, { success: false, error: err.message });
    }
  }

  // DELETE /api/stories/:id - Admin moderation
  const deleteStoryMatch = pathname.match(/^\/api\/stories\/(\d+)$/);
  if (method === 'DELETE' && deleteStoryMatch) {
    try {
      const storyId = parseInt(deleteStoryMatch[1], 10);
      await pool.query('DELETE FROM stories WHERE id = $1', [storyId]);
      return sendJSON(res, 200, { success: true, message: 'Story deleted' });
    } catch (err) {
      return sendJSON(res, 500, { success: false, error: err.message });
    }
  }

  // GET /api/stats - Executive statistics
  if (method === 'GET' && pathname === '/api/stats') {
    try {
      const { rows: [{ count: totalReports }] } = await pool.query('SELECT COUNT(*) as count FROM reports');
      const { rows: [{ count: totalStories }] } = await pool.query('SELECT COUNT(*) as count FROM stories');
      const { rows: [{ count: totalProblems }] } = await pool.query('SELECT COUNT(*) as count FROM problems');

      let unresolvedRate = '0%';
      let unresolvedNote = 'No student reports pending';

      if (parseInt(totalReports, 10) > 0) {
        const { rows: [rb] } = await pool.query(`
          SELECT
            COUNT(DISTINCT p.id) as total_flagged,
            SUM(CASE WHEN p.status != 'resolved' THEN 1 ELSE 0 END) as still_unresolved
          FROM problems p
          JOIN reports r ON p.id = r.problem_id
        `);
        if (parseInt(rb.total_flagged, 10) > 0) {
          const rateNum = Math.round((parseInt(rb.still_unresolved, 10) / parseInt(rb.total_flagged, 10)) * 100);
          unresolvedRate = rateNum + '%';
          unresolvedNote = `${rb.still_unresolved} of ${rb.total_flagged} reported spots unresolved`;
        }
      }

      const { rows: breakdown } = await pool.query(`
        SELECT
          p.id,
          p.title,
          p.icon,
          p.category,
          p.is_core,
          p.status,
          COUNT(r.id) as reports,
          MIN(r.created_at) as first_reported_at,
          CASE
            WHEN COUNT(r.id) = 0 THEN 0
            ELSE GREATEST(1, EXTRACT(DAY FROM NOW() - MIN(r.created_at))::INTEGER + 1)
          END AS days_unresolved
        FROM problems p
        LEFT JOIN reports r ON p.id = r.problem_id
        GROUP BY p.id
        ORDER BY reports DESC
      `);

      const { rows: categoryStats } = await pool.query(`
        SELECT
          p.category,
          COUNT(r.id) as reports
        FROM problems p
        LEFT JOIN reports r ON p.id = r.problem_id
        GROUP BY p.category
        ORDER BY reports DESC
      `);

      const { rows: dailyTrend } = await pool.query(`
        SELECT
          DATE(created_at) as report_date,
          COUNT(*) as daily_count
        FROM reports
        GROUP BY DATE(created_at)
        ORDER BY report_date DESC
        LIMIT 10
      `);

      return sendJSON(res, 200, {
        success: true,
        summary: {
          total_reports: parseInt(totalReports, 10),
          total_stories: parseInt(totalStories, 10),
          total_problems: parseInt(totalProblems, 10),
          unresolved_rate: unresolvedRate,
          unresolved_note: unresolvedNote
        },
        breakdown,
        categoryStats,
        dailyTrend
      });
    } catch (err) {
      return sendJSON(res, 500, { success: false, error: err.message });
    }
  }

  // GET /api/export-csv - Downloadable CSV
  if (method === 'GET' && pathname === '/api/export-csv') {
    try {
      const { rows } = await pool.query(`
        SELECT
          p.id AS "Problem_ID",
          p.title AS "Barrier_Title",
          p.category AS "Category",
          p.is_core AS "Is_Core_Problem",
          COALESCE(MIN(r.created_at)::TEXT, 'Not yet reported') AS "First_Flagged_Date",
          COUNT(r.id) AS "Total_Affected_Students",
          CASE
            WHEN COUNT(r.id) = 0 THEN 0
            ELSE GREATEST(1, EXTRACT(DAY FROM NOW() - MIN(r.created_at))::INTEGER + 1)
          END AS "Days_Active"
        FROM problems p
        LEFT JOIN reports r ON p.id = r.problem_id
        GROUP BY p.id
        ORDER BY "Total_Affected_Students" DESC
      `);

      let csv = 'Problem_ID,Barrier_Title,Category,Is_Core_Problem,First_Flagged_Date,Total_Affected_Students,Days_Active\n';
      rows.forEach(r => {
        csv += `"${r.Problem_ID}","${r.Barrier_Title.replace(/"/g, '""')}","${r.Category}","${r.Is_Core_Problem ? 'YES' : 'NO'}","${r.First_Flagged_Date}","${r.Total_Affected_Students}","${r.Days_Active}"\n`;
      });

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="heal_campus_barriers_report.csv"'
      });
      return res.end(csv);
    } catch (err) {
      return sendJSON(res, 500, { success: false, error: err.message });
    }
  }

  // -------------------------------------------------------------
  // STATIC ASSETS (PUBLIC DIR)
  // -------------------------------------------------------------
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  if (!path.extname(filePath)) {
    if (fs.existsSync(filePath + '.html')) {
      filePath = filePath + '.html';
    } else if (fs.existsSync(path.join(filePath, 'index.html'))) {
      filePath = path.join(filePath, 'index.html');
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>404 Not Found - Heal Barrier Map</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
        <body style="font-family:system-ui,sans-serif; text-align:center; padding: 4rem 1rem;">
          <h1>404 - Page Not Found</h1>
          <p>Looking for the barrier report map?</p>
          <a href="/" style="color:#0284c7; font-weight:600;">Return to Home</a>
        </body>
        </html>
      `);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

// Initialize DB then start server
initDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Scan The Barrier Website running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Failed to initialize database:', err);
    process.exit(1);
  });
