// Heal - Scan the Barrier Website Client App
// Handling 1-click counter, story sharing, and dynamic barrier additions

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const problemsContainer = document.getElementById('problemsContainer');
  const storiesContainer = document.getElementById('storiesContainer');
  const totalReportsTicker = document.getElementById('totalReportsTicker');
  const totalStoriesTicker = document.getElementById('totalStoriesTicker');

  // Story Modal Elements
  const storyModal = document.getElementById('storyModal');
  const closeStoryModal = document.getElementById('closeStoryModal');
  const storyForm = document.getElementById('storyForm');
  const storyProblemId = document.getElementById('storyProblemId');
  const storyProblemTitleDisplay = document.getElementById('storyProblemTitleDisplay');

  // Add Problem Modal Elements
  const addProblemModal = document.getElementById('addProblemModal');
  const openAddProblemBtn = document.getElementById('openAddProblemBtn');
  const closeAddProblemModal = document.getElementById('closeAddProblemModal');
  const addProblemForm = document.getElementById('addProblemForm');

  // Toast
  const toast = document.getElementById('toastNotification');
  const toastMessage = document.getElementById('toastMessage');

  // Cache of problems
  let problemsList = [];

  // Local storage tracker for reported items
  function getReportedMap() {
    try {
      return JSON.parse(localStorage.getItem('heal_reported_barriers') || '{}');
    } catch (e) {
      return {};
    }
  }

  function markAsReportedLocally(problemId) {
    const map = getReportedMap();
    map[problemId] = Date.now();
    localStorage.setItem('heal_reported_barriers', JSON.stringify(map));
  }

  // Toast Helper
  function showToast(msg, icon = '✓') {
    toastMessage.textContent = msg;
    const toastIcon = document.getElementById('toastIcon');
    if (toastIcon) toastIcon.textContent = icon;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  }

  // Fetch and Render Problems
  async function loadProblems() {
    try {
      const res = await fetch('/api/problems');
      const data = await res.json();
      if (data.success) {
        problemsList = data.problems;
        renderProblems(problemsList);
        updateTickers(problemsList);
      }
    } catch (err) {
      console.error('Failed to load problems:', err);
      problemsContainer.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: var(--accent); padding: 2rem;">
          Unable to connect to the campus barrier database. Please refresh.
        </div>
      `;
    }
  }

  // Update Top Ticker Stats
  function updateTickers(problems) {
    const totalReports = problems.reduce((sum, p) => sum + (p.report_count || 0), 0);
    const totalStories = problems.reduce((sum, p) => sum + (p.story_count || 0), 0);

    if (totalReportsTicker) totalReportsTicker.textContent = totalReports;
    if (totalStoriesTicker) totalStoriesTicker.textContent = totalStories;
  }

  // Render Problems Cards
  function renderProblems(problems) {
    if (!problemsContainer) return;
    const reportedMap = getReportedMap();

    problemsContainer.innerHTML = problems.map(p => {
      const isReported = (p.report_count > 0) && !!reportedMap[p.id];
      const isCore = p.is_core === 1;

      return `
        <article class="problem-card ${isCore ? 'is-core' : ''}" data-id="${p.id}">
          <div>
            <div class="card-top">
              <span class="card-icon">${p.icon || '⚠️'}</span>
              <span class="card-category">${escapeHTML(p.category)}</span>
            </div>

            <h3 class="problem-title">${escapeHTML(p.title)}</h3>
            <p class="problem-desc">${escapeHTML(p.description)}</p>
          </div>

          <div>
            <div class="impact-counter">
              <span>Affected Students:</span>
              <span class="counter-value" id="counter-${p.id}">${p.report_count}</span>
            </div>

            <div class="card-actions">
              <button 
                class="btn-report ${isReported ? 'reported' : ''}" 
                data-id="${p.id}" 
                id="btn-report-${p.id}"
                title="Tap to count your voice without writing anything"
              >
                <span>${isReported ? '✓ Counted' : '✋ I have this problem (+1)'}</span>
              </button>

              <button class="btn-story" data-id="${p.id}" data-title="${escapeHTML(p.title)}">
                <span>💬 Share what happened</span>
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Attach Click Handlers for 1-Click Button
    document.querySelectorAll('.btn-report').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = btn.getAttribute('data-id');
        await handleOneClickReport(id, btn);
      });
    });

    // Attach Click Handlers for Story Button
    document.querySelectorAll('.btn-story').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const title = btn.getAttribute('data-title');
        openStoryModalFor(id, title);
      });
    });

    // Check for QR Code parameter in URL (e.g. ?problem=no-elevators or ?id=2)
    const urlParams = new URLSearchParams(window.location.search);
    const scannedSlug = urlParams.get('problem');
    const scannedId = urlParams.get('id');

    if (scannedSlug || scannedId) {
      setTimeout(() => {
        const targetProblem = problems.find(p => p.slug === scannedSlug || String(p.id) === String(scannedId));
        if (targetProblem) {
          const card = document.querySelector(`[data-id="${targetProblem.id}"]`);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.style.outline = '4px solid var(--primary)';
            card.style.boxShadow = 'var(--shadow-lg)';
            showToast(`📍 Scanned spot: ${targetProblem.title}. Tap below to count your report!`, '📲');
          }
        }
      }, 400);
    }
  }

  // Handle Instant 1-Click Report
  async function handleOneClickReport(problemId, buttonEl) {
    const counterEl = document.getElementById(`counter-${problemId}`);
    const originalText = counterEl ? counterEl.textContent : '';

    // Optimistic UI update
    if (counterEl) {
      counterEl.textContent = parseInt(originalText, 10) + 1;
      counterEl.style.color = 'var(--primary)';
      counterEl.style.transform = 'scale(1.2)';
      counterEl.style.transition = 'transform 0.15s ease';
      setTimeout(() => {
        counterEl.style.transform = 'scale(1)';
      }, 200);
    }

    buttonEl.classList.add('reported');
    buttonEl.innerHTML = '<span>✓ Counted (+1)</span>';

    try {
      const res = await fetch(`/api/problems/${problemId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_note: 'One-click student tap' })
      });
      const data = await res.json();

      if (data.success) {
        markAsReportedLocally(problemId);
        showToast('Your voice was counted! Total affected: ' + data.new_count, '🎉');
        if (counterEl) counterEl.textContent = data.new_count;
        loadProblems(); // refresh ticker
      } else {
        showToast('Error recording tap: ' + data.error, '⚠️');
      }
    } catch (err) {
      console.error(err);
      showToast('Network error logging report', '⚠️');
    }
  }

  // Open Story Modal
  function openStoryModalFor(id, title) {
    storyProblemId.value = id;
    storyProblemTitleDisplay.value = title;
    storyModal.classList.add('active');
    document.getElementById('storyText').focus();
  }

  // Close Story Modal
  if (closeStoryModal) {
    closeStoryModal.addEventListener('click', () => {
      storyModal.classList.remove('active');
      storyForm.reset();
    });
  }

  // Submit Story Form
  if (storyForm) {
    storyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const problemId = storyProblemId.value;
      const text = document.getElementById('storyText').value;
      const impact = document.getElementById('storyImpactTag').value;
      const author = document.getElementById('storyAuthor').value;

      try {
        const res = await fetch(`/api/problems/${problemId}/story`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            story_text: text,
            impact_tag: impact,
            author_alias: author
          })
        });
        const data = await res.json();
        if (data.success) {
          storyModal.classList.remove('active');
          storyForm.reset();
          showToast('Your experience was added to the public record!', '💬');
          loadStories();
          loadProblems();
        } else {
          alert(data.error || 'Could not submit story');
        }
      } catch (err) {
        console.error(err);
        alert('Failed to submit story. Check network.');
      }
    });
  }

  // Add Another Problem Modal Handlers
  if (openAddProblemBtn) {
    openAddProblemBtn.addEventListener('click', () => {
      addProblemModal.classList.add('active');
      document.getElementById('newProblemTitle').focus();
    });
  }

  if (closeAddProblemModal) {
    closeAddProblemModal.addEventListener('click', () => {
      addProblemModal.classList.remove('active');
      addProblemForm.reset();
    });
  }

  // Submit New Problem
  if (addProblemForm) {
    addProblemForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('newProblemTitle').value;
      const category = document.getElementById('newProblemCategory').value;
      const icon = document.getElementById('newProblemIcon').value;
      const description = document.getElementById('newProblemDesc').value;

      try {
        const res = await fetch('/api/problems', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, category, icon, description })
        });
        const data = await res.json();
        if (data.success) {
          addProblemModal.classList.remove('active');
          addProblemForm.reset();
          markAsReportedLocally(data.problem.id);
          showToast(`Added "${title}" with your initial report (+1)!`, '✨');
          await loadProblems();
          // Scroll to the new card
          const newCard = document.querySelector(`[data-id="${data.problem.id}"]`);
          if (newCard) {
            newCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            newCard.style.boxShadow = '0 0 0 3px var(--primary)';
            setTimeout(() => { newCard.style.boxShadow = ''; }, 2000);
          }
        } else {
          alert(data.error || 'Could not add problem');
        }
      } catch (err) {
        console.error(err);
        alert('Network error adding problem.');
      }
    });
  }

  // Fetch and Render Stories
  async function loadStories() {
    try {
      const res = await fetch('/api/stories');
      const data = await res.json();
      if (data.success && storiesContainer) {
        if (data.stories.length === 0) {
          storiesContainer.innerHTML = `<p style="color:var(--text-muted);">No student stories shared yet. Be the first to share.</p>`;
          return;
        }

        storiesContainer.innerHTML = data.stories.map(s => {
          return `
            <div class="story-card">
              <p class="story-quote">“${escapeHTML(s.story_text)}”</p>
              <div class="story-meta">
                <div>
                  <strong>${escapeHTML(s.author_alias || 'Anonymous')}</strong>
                  <span style="margin: 0 4px;">•</span>
                  <span>${escapeHTML(s.problem_icon)} ${escapeHTML(s.problem_title)}</span>
                </div>
                <span class="story-badge">${escapeHTML(s.impact_tag || 'Impact')}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    } catch (err) {
      console.error('Error fetching stories:', err);
    }
  }

  // Close modals on clicking outside
  window.addEventListener('click', (e) => {
    if (e.target === storyModal) storyModal.classList.remove('active');
    if (e.target === addProblemModal) addProblemModal.classList.remove('active');
  });

  // Safe HTML Escaping
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

  // Initial Load
  loadProblems();
  loadStories();
});
