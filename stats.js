// Heal - Statistics & Administration Dashboard Script
// Compiles database metrics, table views, and visual breakdown for administration meetings

document.addEventListener('DOMContentLoaded', async () => {
  const kpiTotalReports = document.getElementById('kpiTotalReports');
  const kpiActiveBarriers = document.getElementById('kpiActiveBarriers');
  const barrierTableBody = document.getElementById('barrierTableBody');
  const categoryCardsContainer = document.getElementById('categoryCardsContainer');
  const storiesTableBody = document.getElementById('storiesTableBody');

  try {
    // 1. Fetch Stats
    const statsRes = await fetch('/api/stats');
    const statsData = await statsRes.json();

    if (statsData.success) {
      renderSummary(statsData.summary);
      renderBarrierTable(statsData.breakdown, statsData.summary.total_reports);
      renderCategories(statsData.categoryStats, statsData.summary.total_reports);
    }

    // 2. Fetch Stories
    const storiesRes = await fetch('/api/stories');
    const storiesData = await storiesRes.json();

    if (storiesData.success) {
      renderStoriesTable(storiesData.stories);
    }
  } catch (err) {
    console.error('Failed to load administrative statistics:', err);
  }

  function renderSummary(summary) {
    if (kpiTotalReports) kpiTotalReports.textContent = summary.total_reports;
    if (kpiActiveBarriers) kpiActiveBarriers.textContent = summary.total_problems;
  }

  function renderBarrierTable(breakdown, total) {
    if (!barrierTableBody) return;
    if (!breakdown || breakdown.length === 0) {
      barrierTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No data available.</td></tr>`;
      return;
    }

    barrierTableBody.innerHTML = breakdown.map((item, index) => {
      const percentage = total > 0 ? Math.round((item.reports / total) * 100) : 0;
      let daysDisplay = '—';
      let daysStyle = 'color: var(--text-muted);';

      if (item.reports === 0) {
        daysDisplay = '<span style="color:var(--text-muted); font-size:0.85rem;">Not yet reported</span>';
      } else {
        const days = item.days_unresolved || 1;
        daysDisplay = `${days} day${days > 1 ? 's' : ''}`;
        daysStyle = days > 14 ? 'color: var(--accent); font-weight: 800;' : 'font-weight: 700;';
      }

      return `
        <tr>
          <td style="font-weight:700; color:var(--text-muted);">${index + 1}</td>
          <td>
            <strong>${escapeHTML(item.icon)} ${escapeHTML(item.title)}</strong>
          </td>
          <td><span class="story-badge">${escapeHTML(item.category)}</span></td>
          <td style="min-width: 140px;">
            <div style="font-size: 0.8rem; font-weight: 700; color: var(--secondary);">${percentage}% of campus complaints</div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${percentage}%;"></div>
            </div>
          </td>
          <td style="text-align: right; font-weight: 800; font-size: 1.05rem; color: var(--primary);">
            ${item.reports}
          </td>
          <td style="text-align: right; ${daysStyle}">
            ${daysDisplay}
          </td>
          <td>
            <span style="display:inline-block; padding: 0.2rem 0.55rem; border-radius:999px; font-size:0.75rem; font-weight:700; background: var(--accent-light); color: var(--accent);">
              ● Inaction / Unresolved
            </span>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderCategories(categories, total) {
    if (!categoryCardsContainer) return;
    if (!categories || categories.length === 0) return;

    categoryCardsContainer.innerHTML = categories.map(c => {
      const pct = total > 0 ? Math.round((c.reports / total) * 100) : 0;
      return `
        <div class="summary-card" style="border-left: 4px solid var(--primary);">
          <div class="summary-label">${escapeHTML(c.category)}</div>
          <div style="display:flex; justify-content:space-between; align-items:baseline;">
            <div style="font-size: 1.6rem; font-weight: 800; color: var(--secondary);">${c.reports} <span style="font-size:0.85rem; font-weight:600; color:var(--text-muted);">reports</span></div>
            <div style="font-size: 1.1rem; font-weight: 800; color: var(--primary);">${pct}%</div>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${pct}%;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderStoriesTable(stories) {
    if (!storiesTableBody) return;
    if (!stories || stories.length === 0) {
      storiesTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No testimonials submitted yet.</td></tr>`;
      return;
    }

    storiesTableBody.innerHTML = stories.map(s => {
      const dateStr = s.created_at ? s.created_at.split('T')[0] || s.created_at.split(' ')[0] : 'Recent';
      return `
        <tr>
          <td style="white-space:nowrap; font-size:0.82rem; color:var(--text-muted);">${escapeHTML(dateStr)}</td>
          <td style="font-weight:700; white-space:nowrap;">${escapeHTML(s.author_alias || 'Anonymous')}</td>
          <td style="white-space:nowrap; font-size:0.85rem;">${escapeHTML(s.problem_icon)} ${escapeHTML(s.problem_title)}</td>
          <td><span class="story-badge">${escapeHTML(s.impact_tag || 'Impact')}</span></td>
          <td style="font-style:italic; font-size:0.88rem; color:#334155;">“${escapeHTML(s.story_text)}”</td>
        </tr>
      `;
    }).join('');
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
