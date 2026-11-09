// Heal Admin Dashboard Script
// Handles Team Authentication, Status Updates, Moderation, and Statistics

document.addEventListener('DOMContentLoaded', () => {
  const CORRECT_PIN = '2A27'; // Team Class PIN

  const pinGate = document.getElementById('pinGate');
  const adminContent = document.getElementById('adminContent');
  const pinForm = document.getElementById('pinForm');
  const pinInput = document.getElementById('pinInput');
  const pinError = document.getElementById('pinError');
  const lockBtn = document.getElementById('lockBtn');
  const refreshBtn = document.getElementById('refreshBtn');

  const kpiReports = document.getElementById('kpiReports');
  const kpiStories = document.getElementById('kpiStories');
  const kpiActiveBarriers = document.getElementById('kpiActiveBarriers');
  const kpiUnresolvedRate = document.getElementById('kpiUnresolvedRate');
  const kpiUnresolvedNote = document.getElementById('kpiUnresolvedNote');
  const adminBarrierTableBody = document.getElementById('adminBarrierTableBody');
  const adminCategoryCards = document.getElementById('adminCategoryCards');
  const adminStoriesTableBody = document.getElementById('adminStoriesTableBody');

  // Check Auth on Load
  if (sessionStorage.getItem('heal_admin_auth') === 'true') {
    unlockDashboard();
  }

  // Handle PIN Form Submit
  pinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (pinInput.value.trim().toUpperCase() === CORRECT_PIN) {
      sessionStorage.setItem('heal_admin_auth', 'true');
      unlockDashboard();
    } else {
      pinError.style.display = 'block';
      pinInput.value = '';
      pinInput.focus();
    }
  });

  // Handle Lock Button
  if (lockBtn) {
    lockBtn.addEventListener('click', () => {
      sessionStorage.removeItem('heal_admin_auth');
      adminContent.style.display = 'none';
      pinGate.style.display = 'block';
      pinInput.value = '';
      pinError.style.display = 'none';
    });
  }

  // Refresh Button
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadAllAdminData();
    });
  }

  function unlockDashboard() {
    pinGate.style.display = 'none';
    adminContent.style.display = 'block';
    loadAllAdminData();
  }

  async function loadAllAdminData() {
    try {
      // Load Stats & Barriers
      const statsRes = await fetch('/api/stats');
      const statsData = await statsRes.json();

      if (statsData.success) {
        if (kpiReports) kpiReports.textContent = statsData.summary.total_reports;
        if (kpiStories) kpiStories.textContent = statsData.summary.total_stories;
        if (kpiActiveBarriers) kpiActiveBarriers.textContent = statsData.summary.total_problems;
        if (kpiUnresolvedRate) kpiUnresolvedRate.textContent = statsData.summary.unresolved_rate;
        if (kpiUnresolvedNote && statsData.summary.unresolved_note) {
          kpiUnresolvedNote.textContent = statsData.summary.unresolved_note;
        }
        renderAdminBarriers(statsData.breakdown);
        renderAdminCategories(statsData.categoryStats, statsData.summary.total_reports);
      }

      // Load Stories
      const storiesRes = await fetch('/api/stories');
      const storiesData = await storiesRes.json();
      if (storiesData.success) {
        renderAdminStories(storiesData.stories);
      }
    } catch (err) {
      console.error('Error loading admin data:', err);
    }
  }

  function renderAdminBarriers(barriers) {
    if (!adminBarrierTableBody) return;
    if (!barriers || barriers.length === 0) {
      adminBarrierTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No barriers tracked.</td></tr>`;
      return;
    }

    adminBarrierTableBody.innerHTML = barriers.map((b, i) => {
      const statusClass = `status-${b.status || 'active'}`;
      let daysDisplay = '—';
      let daysStyle = 'color: var(--text-muted);';

      if (b.status === 'resolved') {
        daysDisplay = 'Resolved ✓';
        daysStyle = 'color: var(--success); font-weight: 700;';
      } else if (b.reports === 0) {
        daysDisplay = '<span style="color:var(--text-muted); font-size:0.85rem;">Not yet reported</span>';
      } else {
        const days = b.days_unresolved || 1;
        daysDisplay = `${days} day${days > 1 ? 's' : ''}`;
        daysStyle = days > 14 ? 'color: var(--accent); font-weight: 800;' : 'font-weight: 700;';
      }

      return `
        <tr>
          <td style="font-weight:700; color:var(--text-muted);">${i + 1}</td>
          <td>
            <strong>${escapeHTML(b.icon)} ${escapeHTML(b.title)}</strong>
          </td>
          <td><span class="story-badge">${escapeHTML(b.category)}</span></td>
          <td style="text-align: right; font-weight: 800; font-size: 1.1rem; color: var(--primary);">
            ${b.reports}
          </td>
          <td style="text-align: right; ${daysStyle}">
            ${daysDisplay}
          </td>
          <td>
            <select class="status-select ${statusClass}" data-id="${b.id}">
              <option value="active" ${b.status === 'active' ? 'selected' : ''}>🔴 Active / Broken</option>
              <option value="in_progress" ${b.status === 'in_progress' ? 'selected' : ''}>🟡 In Progress / Reported</option>
              <option value="resolved" ${b.status === 'resolved' ? 'selected' : ''}>🟢 Resolved by Campus</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');

    // Attach Status Change Listeners
    document.querySelectorAll('.status-select').forEach(select => {
      select.addEventListener('change', async (e) => {
        const id = select.getAttribute('data-id');
        const newStatus = select.value;
        select.className = `status-select status-${newStatus}`;

        try {
          const res = await fetch(`/api/problems/${id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
          });
          const data = await res.json();
          if (!data.success) {
            alert('Failed to update status');
          }
        } catch (err) {
          console.error(err);
          alert('Network error updating status');
        }
      });
    });
  }

  function renderAdminCategories(categories, total) {
    if (!adminCategoryCards) return;
    if (!categories || categories.length === 0) return;

    adminCategoryCards.innerHTML = categories.map(c => {
      const pct = total > 0 ? Math.round((c.reports / total) * 100) : 0;
      return `
        <div class="summary-card" style="border-left: 4px solid #7c3aed;">
          <div class="summary-label">${escapeHTML(c.category)}</div>
          <div style="display:flex; justify-content:space-between; align-items:baseline;">
            <div style="font-size: 1.5rem; font-weight: 800;">${c.reports} reports</div>
            <div style="font-size: 1.1rem; font-weight: 800; color: #7c3aed;">${pct}%</div>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${pct}%; background: #7c3aed;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderAdminStories(stories) {
    if (!adminStoriesTableBody) return;
    if (!stories || stories.length === 0) {
      adminStoriesTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No stories submitted yet.</td></tr>`;
      return;
    }

    adminStoriesTableBody.innerHTML = stories.map(s => {
      const dateStr = s.created_at ? s.created_at.split('T')[0] || s.created_at.split(' ')[0] : 'Recent';
      return `
        <tr id="story-row-${s.id}">
          <td style="white-space:nowrap; font-size:0.8rem; color:var(--text-muted);">${escapeHTML(dateStr)}</td>
          <td style="font-weight:700;">${escapeHTML(s.author_alias || 'Anonymous')}</td>
          <td style="font-size:0.85rem;">${escapeHTML(s.problem_icon)} ${escapeHTML(s.problem_title)}</td>
          <td><span class="story-badge">${escapeHTML(s.impact_tag)}</span></td>
          <td style="font-style:italic; font-size:0.88rem; color:#334155;">“${escapeHTML(s.story_text)}”</td>
          <td class="no-print">
            <button class="btn-delete-story" data-id="${s.id}" style="background:none; border:none; color:var(--accent); cursor:pointer; font-size:0.8rem; font-weight:700;">
              Delete
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach Delete Listeners
    document.querySelectorAll('.btn-delete-story').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('Are you sure you want to delete this story submission?')) return;

        try {
          const res = await fetch(`/api/stories/${id}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.success) {
            const row = document.getElementById(`story-row-${id}`);
            if (row) row.remove();
            loadAllAdminData();
          }
        } catch (err) {
          console.error(err);
        }
      });
    });
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }
});
