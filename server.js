const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const db = require('./db.js');

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
      if (body.length > 1e6) { // 1MB limit
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
      const stmt = db.prepare(`
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
            ELSE MAX(1, CAST((julianday('now') - julianday(MIN(r.created_at))) AS INTEGER) + 1)
          END AS days_active
        FROM problems p
        LEFT JOIN reports r ON p.id = r.problem_id
        LEFT JOIN stories s ON p.id = s.problem_id
        GROUP BY p.id
        ORDER BY p.is_core DESC, report_count DESC
      `);
      const problems = stmt.all();
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

      const check = db.prepare('SELECT id, title FROM problems WHERE id = ?').get(problemId);
      if (!check) {
        return sendJSON(res, 404, { success: false, error: 'Problem not found' });
      }

      const insertStmt = db.prepare('INSERT INTO reports (problem_id, location_note) VALUES (?, ?)');
      insertStmt.run(problemId, locationNote);

      const countRow = db.prepare('SELECT COUNT(*) as count FROM reports WHERE problem_id = ?').get(problemId);

      return sendJSON(res, 200, {
        success: true,
        message: 'Report logged successfully',
        problem_id: problemId,
        new_count: countRow.count
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

      const insertStmt = db.prepare(`
        INSERT INTO stories (problem_id, story_text, impact_tag, author_alias)
        VALUES (?, ?, ?, ?)
      `);

      insertStmt.run(
        problemId,
        body.story_text.trim(),
        body.impact_tag || 'General Impact',
        body.author_alias && body.author_alias.trim() ? body.author_alias.trim() : 'Anonymous Student'
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

      const insertStmt = db.prepare(`
        INSERT INTO problems (slug, title, category, description, icon, is_core, created_at)
        VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
      `);
      insertStmt.run(slug, title, category, description, icon);

      // Also log an initial report from the person who created it
      const newProb = db.prepare('SELECT id FROM problems WHERE slug = ?').get(slug);
      db.prepare('INSERT INTO reports (problem_id) VALUES (?)').run(newProb.id);

      return sendJSON(res, 201, {
        success: true,
        message: 'New problem added to the campus barrier map',
        problem: { id: newProb.id, slug, title, category, description, icon, report_count: 1 }
      });
    } catch (err) {
      console.error('Error creating new problem:', err);
      return sendJSON(res, 500, { success: false, error: err.message });
    }
  }

  // GET /api/stories - List all stories
  if (method === 'GET' && pathname === '/api/stories') {
    try {
      const stmt = db.prepare(`
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
      const stories = stmt.all();
      return sendJSON(res, 200, { success: true, stories });
    } catch (err) {
      return sendJSON(res, 500, { success: false, error: err.message });
    }
  }

  // POST /api/problems/:id/status - Update problem status (Active / In Progress / Resolved)
  const statusMatch = pathname.match(/^\/api\/problems\/(\d+)\/status$/);
  if (method === 'POST' && statusMatch) {
    try {
      const problemId = parseInt(statusMatch[1], 10);
      const body = await parseBody(req);
      const newStatus = body.status || 'active';

      db.prepare('UPDATE problems SET status = ? WHERE id = ?').run(newStatus, problemId);
      return sendJSON(res, 200, { success: true, message: 'Status updated', status: newStatus });
    } catch (err) {
      return sendJSON(res, 500, { success: false, error: err.message });
    }
  }

  // DELETE /api/stories/:id - Admin moderation of stories
  const deleteStoryMatch = pathname.match(/^\/api\/stories\/(\d+)$/);
  if (method === 'DELETE' && deleteStoryMatch) {
    try {
      const storyId = parseInt(deleteStoryMatch[1], 10);
      db.prepare('DELETE FROM stories WHERE id = ?').run(storyId);
      return sendJSON(res, 200, { success: true, message: 'Story deleted' });
    } catch (err) {
      return sendJSON(res, 500, { success: false, error: err.message });
    }
  }

  // GET /api/stats - Executive statistics for Administration
  if (method === 'GET' && pathname === '/api/stats') {
    try {
      const totalReports = db.prepare('SELECT COUNT(*) as count FROM reports').get().count;
      const totalStories = db.prepare('SELECT COUNT(*) as count FROM stories').get().count;
      const totalProblems = db.prepare('SELECT COUNT(*) as count FROM problems').get().count;
      
      // Calculate unresolved rate ONLY for problems that have received real student reports
      let unresolvedRate = '0%';
      let unresolvedNote = 'No student reports pending';
      
      if (totalReports > 0) {
        const reportedBarriers = db.prepare(`
          SELECT 
            COUNT(DISTINCT p.id) as total_flagged,
            SUM(CASE WHEN p.status != 'resolved' THEN 1 ELSE 0 END) as still_unresolved
          FROM problems p
          JOIN reports r ON p.id = r.problem_id
        `).get();

        if (reportedBarriers.total_flagged > 0) {
          const rateNum = Math.round((reportedBarriers.still_unresolved / reportedBarriers.total_flagged) * 100);
          unresolvedRate = rateNum + '%';
          unresolvedNote = `${reportedBarriers.still_unresolved} of ${reportedBarriers.total_flagged} reported spots unresolved`;
        }
      }

      const breakdown = db.prepare(`
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
            ELSE MAX(1, CAST((julianday('now') - julianday(MIN(r.created_at))) AS INTEGER) + 1)
          END AS days_unresolved
        FROM problems p
        LEFT JOIN reports r ON p.id = r.problem_id
        GROUP BY p.id
        ORDER BY reports DESC
      `).all();

      // Category breakdown
      const categoryStats = db.prepare(`
        SELECT 
          p.category,
          COUNT(r.id) as reports
        FROM problems p
        LEFT JOIN reports r ON p.id = r.problem_id
        GROUP BY p.category
        ORDER BY reports DESC
      `).all();

      // Recent 7 days trend
      const dailyTrend = db.prepare(`
        SELECT 
          date(created_at) as report_date,
          COUNT(*) as daily_count
        FROM reports
        GROUP BY date(created_at)
        ORDER BY report_date DESC
        LIMIT 10
      `).all();

      return sendJSON(res, 200, {
        success: true,
        summary: {
          total_reports: totalReports,
          total_stories: totalStories,
          total_problems: totalProblems,
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

  // GET /api/export-csv - Downloadable CSV for Administrative meetings
  if (method === 'GET' && pathname === '/api/export-csv') {
    try {
      const rows = db.prepare(`
        SELECT 
          p.id AS Problem_ID,
          p.title AS Barrier_Title,
          p.category AS Category,
          p.is_core AS Is_Core_Problem,
          COALESCE(MIN(r.created_at), 'Not yet reported') AS First_Flagged_Date,
          COUNT(r.id) AS Total_Affected_Students,
          CASE 
            WHEN COUNT(r.id) = 0 THEN 0
            ELSE MAX(1, CAST((julianday('now') - julianday(MIN(r.created_at))) AS INTEGER) + 1)
          END AS Days_Active
        FROM problems p
        LEFT JOIN reports r ON p.id = r.problem_id
        GROUP BY p.id
        ORDER BY Total_Affected_Students DESC
      `).all();

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

  // If URL doesn't have an extension, try appending .html
  if (!path.extname(filePath)) {
    if (fs.existsSync(filePath + '.html')) {
      filePath = filePath + '.html';
    } else if (fs.existsSync(path.join(filePath, 'index.html'))) {
      filePath = path.join(filePath, 'index.html');
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // 404 fallback
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

server.listen(PORT, () => {
  console.log(`Scan The Barrier Website running on http://localhost:${PORT}`);
});
