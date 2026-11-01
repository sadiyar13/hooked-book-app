// Hooked Book Mobile App - Core Application Engine
(function() {
  'use strict';

  // --- STATE ---
  let state = {
    user: {
      name: 'محمد',
      streak: 1,
      lastActive: new Date().toISOString()
    },
    catalog: [],
    progress: {}, // { [bookId]: { completedChapters: [], lastChId: null, lastSlide: 0 } }
    activeBookId: 'hooked',
    activeChapterId: null,
    activeSlideIndex: 0,
    cloudSyncUrl: '',
    isAdminAuthenticated: false
  };

  // --- DOM CACHE ---
  const views = {
    onboarding: document.getElementById('view-onboarding'),
    bookshelf: document.getElementById('view-bookshelf'),
    chapters: document.getElementById('view-chapters'),
    reader: document.getElementById('view-reader')
  };

  const modals = {
    celebration: document.getElementById('modal-celebration'),
    share: document.getElementById('modal-share'),
    admin: document.getElementById('modal-admin')
  };

  const header = document.getElementById('global-header');
  const userNameDisplay = document.getElementById('user-name-display');
  const userAvatarInitial = document.getElementById('user-avatar-initial');
  const profileChip = document.getElementById('profile-chip');
  const streakCounter = document.getElementById('streak-counter');
  const toastEl = document.getElementById('toast-message');

  let deferredInstallPrompt = null;

  // --- INIT ENGINE ---
  function init() {
    loadLocalData();
    setupEventListeners();
    setupPWA();

    // Check onboarding status
    const savedUser = localStorage.getItem('hooked_app_user');
    if (savedUser) {
      updateUserUI();
      header.style.display = 'flex';
      switchView('bookshelf');
      renderBookshelf();
    } else {
      header.style.display = 'none';
      switchView('onboarding');
    }

    // Try background cloud sync if configured
    if (state.cloudSyncUrl) {
      syncWithCloud(state.cloudSyncUrl, true);
    }
  }

  // --- DATA PERSISTENCE ---
  function loadLocalData() {
    // 1. User
    try {
      const u = JSON.parse(localStorage.getItem('hooked_app_user') || 'null');
      if (u && u.name) {
        state.user = u;
      }
    } catch (e) {
      console.warn('Error reading user:', e);
    }

    // 2. Catalog
    try {
      const customCatalog = JSON.parse(localStorage.getItem('hooked_custom_catalog') || 'null');
      if (window.INITIAL_BOOKS_CATALOG && Array.isArray(window.INITIAL_BOOKS_CATALOG)) {
        // Merge saved chapter published state with fresh code catalog
        state.catalog = window.INITIAL_BOOKS_CATALOG.map(book => {
          const savedBook = customCatalog ? customCatalog.find(b => b.id === book.id) : null;
          if (!savedBook) return book;
          return {
            ...book,
            published: savedBook.published !== undefined ? savedBook.published : book.published,
            chapters: (book.chapters || []).map(ch => {
              const savedCh = (savedBook.chapters || []).find(c => c.id === ch.id);
              if (savedCh && typeof savedCh.published === 'boolean') {
                return { ...ch, published: savedCh.published };
              }
              return ch;
            })
          };
        });
      } else if (customCatalog && Array.isArray(customCatalog)) {
        state.catalog = customCatalog;
      }
    } catch (e) {
      console.warn('Error loading catalog:', e);
      state.catalog = window.INITIAL_BOOKS_CATALOG || [];
    }

    // 3. Progress
    try {
      const prog = JSON.parse(localStorage.getItem('hooked_app_progress') || '{}');
      state.progress = prog;
    } catch (e) {
      state.progress = {};
    }

    // 4. Cloud URL
    state.cloudSyncUrl = localStorage.getItem('hooked_cloud_sync_url') || '';
  }

  function saveUserData() {
    localStorage.setItem('hooked_app_user', JSON.stringify(state.user));
    updateUserUI();
  }

  function saveProgressData() {
    localStorage.setItem('hooked_app_progress', JSON.stringify(state.progress));
  }

  function saveCatalogData() {
    localStorage.setItem('hooked_custom_catalog', JSON.stringify(state.catalog));
  }

  function updateUserUI() {
    const name = state.user.name || 'محمد';
    userNameDisplay.textContent = name;
    userAvatarInitial.textContent = name.trim().charAt(0) || 'م';
    streakCounter.textContent = `${state.user.streak || 1} روز`;
  }

  // --- VIEW SWITCHING ---
  function switchView(viewName) {
    Object.keys(views).forEach(k => {
      if (k === viewName) {
        views[k].classList.add('active');
      } else {
        views[k].classList.remove('active');
      }
    });

    if (viewName === 'onboarding' || viewName === 'reader') {
      header.style.display = 'none';
    } else {
      header.style.display = 'flex';
    }

    // Scroll view to top on entry
    if (views[viewName]) {
      views[viewName].scrollTop = 0;
    }
  }

  // --- TOAST NOTIFICATION ---
  let toastTimer = null;
  function showToast(msg) {
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2800);
  }

  // --- BOOKSHELF RENDERER ---
  function renderBookshelf() {
    const container = document.getElementById('books-list-container');
    container.innerHTML = '';

    const booksBadge = document.getElementById('books-count-badge');
    const publishedBooks = state.catalog.filter(b => b.published !== false);
    booksBadge.textContent = `${toPersianDigits(publishedBooks.length)} کتاب فعال`;

    state.catalog.forEach(book => {
      const publishedChapters = (book.chapters || []).filter(c => c.published);
      const completedList = (state.progress[book.id]?.completedChapters) || [];
      const completedCount = completedList.filter(chId => publishedChapters.some(c => c.id === chId)).length;
      const percent = publishedChapters.length > 0 ? Math.round((completedCount / publishedChapters.length) * 100) : 0;

      const card = document.createElement('div');
      card.className = 'book-card';
      
      const totalUpcoming = (book.chapters || []).length - publishedChapters.length;
      const statusText = book.published !== false 
        ? `${toPersianDigits(publishedChapters.length)} قسمت آماده مطالعه ${totalUpcoming > 0 ? `| ${toPersianDigits(totalUpcoming)} قسمت به‌زودی ⏳` : ''}`
        : 'به‌زودی در اپلیکیشن ⏳';

      card.innerHTML = `
        <div class="book-card-header">
          <div class="book-cover" style="background: ${book.coverGradient || 'linear-gradient(135deg, #0284c7, #3b82f6)'}">
            <span>${book.icon || '📖'}</span>
          </div>
          <div class="book-info">
            <div>
              <div class="book-title">${book.title}</div>
              <div class="book-author">${book.author}</div>
            </div>
            <div class="book-category">${book.category || 'کتاب کاربردی'}</div>
          </div>
        </div>

        ${book.published !== false ? `
          <div class="book-progress-box">
            <div class="progress-info-row">
              <span>پیشرفت مطالعه: ${toPersianDigits(percent)}٪</span>
              <span>${toPersianDigits(completedCount)} از ${toPersianDigits(publishedChapters.length)} قسمت</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${percent}%;"></div>
            </div>
          </div>
        ` : ''}

        <div class="status-badge ${book.published !== false ? 'status-ready' : 'status-locked'}">
          <span>${book.published !== false ? '⚡' : '🔒'}</span>
          <span>${statusText}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        if (book.published === false) {
          showToast('این کتاب به زودی در اپلیکیشن منتشر می‌شود! ⏳');
          return;
        }
        openBook(book.id);
      });

      container.appendChild(card);
    });

    // Single Upcoming Books Card (as requested: "کتاب‌های بعدی به‌زودی")
    const upcomingCard = document.createElement('div');
    upcomingCard.className = 'upcoming-books-card';
    upcomingCard.innerHTML = `
      <div class="upcoming-icon">📚</div>
      <div class="upcoming-info">
        <div class="upcoming-title">کتاب‌های بعدی به‌زودی...</div>
        <div class="upcoming-desc">خلاصه‌های کاربردی از برترین کتاب‌های جهان در حال آماده‌سازی هستند.</div>
      </div>
    `;
    container.appendChild(upcomingCard);
  }

  // --- CHAPTERS LIST RENDERER ---
  function openBook(bookId) {
    state.activeBookId = bookId;
    renderChapters();
    switchView('chapters');
  }

  function renderChapters() {
    const book = state.catalog.find(b => b.id === state.activeBookId);
    if (!book) return;

    document.getElementById('chapters-book-title').textContent = book.title;
    document.getElementById('chapters-book-author').textContent = book.author;

    const publishedChapters = (book.chapters || []).filter(c => c.published);
    const completedList = (state.progress[book.id]?.completedChapters) || [];
    const completedCount = completedList.filter(chId => publishedChapters.some(c => c.id === chId)).length;
    const percent = publishedChapters.length > 0 ? Math.round((completedCount / publishedChapters.length) * 100) : 0;

    document.getElementById('book-progress-percent').textContent = `${toPersianDigits(percent)}٪`;
    document.getElementById('book-progress-fill').style.width = `${percent}%`;
    document.getElementById('book-episodes-completed-stat').textContent = `${toPersianDigits(completedCount)} از ${toPersianDigits(publishedChapters.length)} قسمت خوانده شد`;

    const statusBadge = document.getElementById('book-badge-status');
    if (percent === 100 && publishedChapters.length > 0) {
      statusBadge.textContent = '🌟 تکمیل شده تا این مرحله!';
      statusBadge.style.color = '#38bdf8';
    } else {
      statusBadge.textContent = 'درحال یادگیری';
      statusBadge.style.color = '#34d399';
    }

    const container = document.getElementById('chapters-list-container');
    container.innerHTML = '';

    (book.chapters || []).forEach(chapter => {
      const isCompleted = completedList.includes(chapter.id);
      const isLocked = !chapter.published;

      const item = document.createElement('div');
      item.className = `chapter-item ${isCompleted ? 'completed' : ''} ${isLocked ? 'locked' : ''}`;

      let statusPillHtml = '';
      if (isLocked) {
        statusPillHtml = '<span class="chapter-status-pill pill-locked">🔒 به‌زودی ⏳</span>';
      } else if (isCompleted) {
        statusPillHtml = '<span class="chapter-status-pill pill-done">✓ خوانده شد (مرور)</span>';
      } else {
        statusPillHtml = '<span class="chapter-status-pill pill-ready">آماده مطالعه ➔</span>';
      }

      item.innerHTML = `
        <div class="chapter-left">
          <div class="chapter-num-badge">${isCompleted ? '✓' : toPersianDigits(chapter.number)}</div>
          <div class="chapter-title-col">
            <span class="chapter-title-text">${chapter.title}</span>
            <span class="chapter-meta-text">${toPersianDigits(chapter.slidesCount || chapter.slides?.length || 0)} اسلاید • زمان تخمینی: ${toPersianDigits(chapter.readTime || '۳ دقیقه')}</span>
          </div>
        </div>
        <div>
          ${statusPillHtml}
        </div>
      `;

      item.addEventListener('click', () => {
        if (isLocked) {
          showToast(`قسمت ${toPersianDigits(chapter.number)} به زودی منتشر می‌شود! ⏳`);
          return;
        }
        openReader(chapter.id);
      });

      container.appendChild(item);
    });
  }

  // --- STORY READER (9:16) ENGINE ---
  function openReader(chapterId) {
    const book = state.catalog.find(b => b.id === state.activeBookId);
    if (!book) return;

    const chapter = (book.chapters || []).find(c => c.id === chapterId);
    if (!chapter || !chapter.slides || chapter.slides.length === 0) {
      showToast('اسلایدهای این قسمت یافت نشد.');
      return;
    }

    state.activeChapterId = chapterId;
    state.activeSlideIndex = 0;

    // Track active book progress
    if (!state.progress[book.id]) {
      state.progress[book.id] = { completedChapters: [], lastChId: chapterId, lastSlide: 0 };
    }
    state.progress[book.id].lastChId = chapterId;
    saveProgressData();

    setupStorySegments(chapter.slides.length);
    renderCurrentSlide();
    switchView('reader');
  }

  function setupStorySegments(count) {
    const bar = document.getElementById('story-segments');
    bar.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const seg = document.createElement('div');
      seg.className = 'story-segment';
      seg.id = `story-seg-${i}`;
      seg.innerHTML = '<div class="story-segment-fill"></div>';
      bar.appendChild(seg);
    }
  }

  function updateStorySegments() {
    const book = state.catalog.find(b => b.id === state.activeBookId);
    const chapter = book.chapters.find(c => c.id === state.activeChapterId);
    const total = chapter.slides.length;

    for (let i = 0; i < total; i++) {
      const seg = document.getElementById(`story-seg-${i}`);
      if (!seg) continue;
      seg.className = 'story-segment';
      if (i < state.activeSlideIndex) {
        seg.classList.add('completed');
      } else if (i === state.activeSlideIndex) {
        seg.classList.add('active');
      }
    }
  }

  function renderCurrentSlide() {
    const book = state.catalog.find(b => b.id === state.activeBookId);
    const chapter = book.chapters.find(c => c.id === state.activeChapterId);
    const slide = chapter.slides[state.activeSlideIndex];
    const total = chapter.slides.length;

    document.getElementById('reader-chapter-title').textContent = `قسمت ${toPersianDigits(chapter.number)}: ${chapter.title}`;
    document.getElementById('reader-slide-counter').textContent = `${toPersianDigits(state.activeSlideIndex + 1)} / ${toPersianDigits(total)}`;

    updateStorySegments();

    const viewport = document.getElementById('story-viewport');
    viewport.scrollTop = 0; // reset scroll on new slide

    const badgeClass = `badge-${slide.badgeColor || 'cyan'}`;

    viewport.innerHTML = `
      <div class="story-badge-wrap">
        <div class="story-badge ${badgeClass}">${slide.badgeText || 'خلاصه کلیدی'}</div>
      </div>
      <h2 class="story-slide-title">${slide.title}</h2>
      <p class="story-slide-subtitle">${slide.subtitle || ''}</p>

      ${slide.visualSvg ? `
        <div class="story-diagram-box">
          ${slide.visualSvg}
        </div>
      ` : ''}

      <div class="story-content-card">
        ${slide.contentHtml || ''}
      </div>
    `;

    // Dynamic button labels
    const nextBtn = document.getElementById('btn-story-next');
    if (state.activeSlideIndex === total - 1) {
      nextBtn.innerHTML = '<span>تکمیل و ثبت مطالعه</span><span>🏆</span>';
      nextBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    } else {
      nextBtn.innerHTML = '<span>بعدی</span><span>⬅</span>';
      nextBtn.style.background = 'linear-gradient(135deg, #0284c7, #3b82f6)';
    }

    const prevBtn = document.getElementById('btn-story-prev');
    if (state.activeSlideIndex === 0) {
      prevBtn.style.opacity = '0.5';
    } else {
      prevBtn.style.opacity = '1';
    }
  }

  function nextSlide() {
    const book = state.catalog.find(b => b.id === state.activeBookId);
    const chapter = book.chapters.find(c => c.id === state.activeChapterId);
    const total = chapter.slides.length;

    if (state.activeSlideIndex < total - 1) {
      state.activeSlideIndex++;
      renderCurrentSlide();
    } else {
      finishChapter();
    }
  }

  function prevSlide() {
    if (state.activeSlideIndex > 0) {
      state.activeSlideIndex--;
      renderCurrentSlide();
    }
  }

  function finishChapter() {
    const bookId = state.activeBookId;
    const chId = state.activeChapterId;
    const book = state.catalog.find(b => b.id === bookId);
    const chapter = book.chapters.find(c => c.id === chId);

    if (!state.progress[bookId]) {
      state.progress[bookId] = { completedChapters: [], lastChId: chId, lastSlide: 0 };
    }

    if (!state.progress[bookId].completedChapters.includes(chId)) {
      state.progress[bookId].completedChapters.push(chId);
      saveProgressData();
    }

    // Calculate updated book percentage
    const publishedChapters = book.chapters.filter(c => c.published);
    const completedCount = state.progress[bookId].completedChapters.filter(id => publishedChapters.some(c => c.id === id)).length;
    const percent = Math.round((completedCount / publishedChapters.length) * 100);

    // Show celebration modal
    showCelebration(chapter, percent, completedCount, publishedChapters.length);
  }

  // --- CELEBRATION MODAL ---
  function showCelebration(chapter, percent, completedCount, totalPublished) {
    const name = state.user.name || 'محمد';
    document.getElementById('celebrate-user-heading').textContent = `آفرین ${name} جان! 👏`;
    document.getElementById('celebrate-chapter-text').textContent = 
      `شما قسمت «${chapter.title}» را با موفقیت تمام کردید. هم‌اکنون ${toPersianDigits(completedCount)} قسمت از ${toPersianDigits(totalPublished)} قسمت منتشر شده را با موفقیت خوانده‌اید!`;
    document.getElementById('celebrate-new-percent').textContent = `${toPersianDigits(percent)}٪`;

    modals.celebration.classList.add('active');
  }

  // --- SMART SHARING SYSTEM ---
  function openShareModal(targetChapterId = null) {
    const name = state.user.name || 'محمد';
    const book = state.catalog.find(b => b.id === state.activeBookId);
    const publishedChapters = (book.chapters || []).filter(c => c.published);
    const completedList = (state.progress[book.id]?.completedChapters) || [];
    const completedCount = completedList.filter(id => publishedChapters.some(c => c.id === id)).length;
    const percent = publishedChapters.length > 0 ? Math.round((completedCount / publishedChapters.length) * 100) : 0;

    let targetChapter = null;
    if (targetChapterId) {
      targetChapter = book.chapters.find(c => c.id === targetChapterId);
    } else if (state.activeChapterId) {
      targetChapter = book.chapters.find(c => c.id === state.activeChapterId);
    }

    // Build the exact personalized text requested by the user:
    // e.g. "محمد ۳ قسمت اول را خواند"
    let shareText = '';
    if (completedCount > 0) {
      shareText = `🎯 ${name} ${toPersianDigits(completedCount)} قسمت اول از کتاب «${book.title}» را خواند!\n\n`;
      shareText += `📊 پیشرفت مطالعه: ${toPersianDigits(percent)}٪ از قسمت‌های منتشر شده\n`;
      if (targetChapter) {
        shareText += `🔖 آخرین قسمت مطالعه شده: قسمت ${toPersianDigits(targetChapter.number)} (${targetChapter.title})\n`;
      }
      shareText += `\n💡 درباره کتاب: «${book.description}»\n`;
      shareText += `\n✨ شما هم به چالش مطالعه عمیق و کاربردی بپیوندید!`;
    } else {
      shareText = `📚 ${name} مطالعه کتاب تحول‌آفرین «${book.title}» (${book.author}) را آغاز کرد!\n\n`;
      shareText += `🪝 خلاصه تخصصی به صورت اسلایدهای کوتاه و کاربردی موبایلی\n`;
      shareText += `✨ شما هم به چالش یادگیری بپیوندید!`;
    }

    document.getElementById('share-text-preview').textContent = shareText;
    modals.share.dataset.shareText = shareText;

    // Render Canvas Story Graphic
    renderStoryCanvas(name, book, targetChapter, percent, completedCount);

    modals.share.classList.add('active');
  }

  function renderStoryCanvas(name, book, chapter, percent, completedCount) {
    const canvas = document.getElementById('story-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Background Gradient (Deep Space Navy with glowing orb)
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, '#090d16');
    bgGrad.addColorStop(0.5, '#0f172a');
    bgGrad.addColorStop(1, '#0284c7');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Decorative glowing circles
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.arc(w / 2, 240, 180, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(w / 2, 240, 130, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Top Badge Pill
    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1;
    roundRect(ctx, w / 2 - 120, 45, 240, 36, 18, true, true);

    ctx.font = 'bold 15px BYekan, Tahoma, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText('⚡ خلاصه کتاب‌های تحول‌آفرین', w / 2, 69);

    // Book Hook Emblem
    ctx.font = '64px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(book.icon || '🪝', w / 2, 190);

    // Reader Name & Achievement Header
    ctx.font = 'bold 24px BYekan, Tahoma, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${name} ${toPersianDigits(completedCount)} قسمت را خواند! 🏆`, w / 2, 275);

    // Book Title
    ctx.font = 'bold 19px BYekan, Tahoma, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(book.title, w / 2, 315);

    // Author
    ctx.font = '14px BYekan, Tahoma, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(book.author, w / 2, 342);

    // Central Progress Card Box
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    roundRect(ctx, 40, 380, w - 80, 240, 20, true, true);

    // Progress Percentage Display
    ctx.font = 'bold 44px BYekan, Tahoma, sans-serif';
    ctx.fillStyle = '#34d399';
    ctx.fillText(`${toPersianDigits(percent)}٪`, w / 2, 450);

    ctx.font = '14px BYekan, Tahoma, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('تکمیل شده از قسمت‌های منتشر شده', w / 2, 480);

    // Progress Bar on Canvas
    const barW = w - 140;
    const barX = 70;
    const barY = 510;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    roundRect(ctx, barX, barY, barW, 10, 5, true, false);

    const fillW = Math.max(8, (barW * percent) / 100);
    const barGrad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
    barGrad.addColorStop(0, '#38bdf8');
    barGrad.addColorStop(1, '#34d399');
    ctx.fillStyle = barGrad;
    roundRect(ctx, barX, barY, fillW, 10, 5, true, false);

    // Golden Book Quote Box
    ctx.font = 'italic 14px BYekan, Tahoma, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('«محصولات عادت‌ساز به احساسات درونی گره خورده‌اند.»', w / 2, 575);

    // Bottom Call To Action
    ctx.fillStyle = 'rgba(2, 132, 199, 0.3)';
    ctx.strokeStyle = '#38bdf8';
    roundRect(ctx, 60, 680, w - 120, 54, 27, true, true);

    ctx.font = 'bold 16px BYekan, Tahoma, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('📲 به چالش مطالعه بپیوندید', w / 2, 714);

    // Watermark / Brand Footer
    ctx.font = '12px BYekan, Tahoma, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText('خلاصه کتاب موبایلی • طراحی عمودی ۹:۱۶', w / 2, 910);
  }

  function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // --- ADMIN & GRADUAL RELEASE PANEL ---
  function openAdminModal() {
    if (state.isAdminAuthenticated) {
      document.getElementById('admin-pin-container').style.display = 'none';
      document.getElementById('admin-dashboard-container').style.display = 'block';
      renderAdminDashboard();
    } else {
      document.getElementById('admin-pin-container').style.display = 'block';
      document.getElementById('admin-dashboard-container').style.display = 'none';
      document.getElementById('input-admin-pin').value = '';
    }
    modals.admin.classList.add('active');
  }

  function renderAdminDashboard() {
    const selector = document.getElementById('admin-book-selector');
    if (selector) {
      const selectedId = state.adminSelectedBookId || state.activeBookId || (state.catalog[0] && state.catalog[0].id);
      selector.innerHTML = '';
      state.catalog.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = `${b.title} (${b.author})`;
        if (b.id === selectedId) opt.selected = true;
        selector.appendChild(opt);
      });
      selector.onchange = (e) => {
        state.adminSelectedBookId = e.target.value;
        renderAdminDashboard();
      };
    }

    const currentBookId = state.adminSelectedBookId || (selector ? selector.value : null) || (state.catalog[0] && state.catalog[0].id);
    const book = state.catalog.find(b => b.id === currentBookId) || state.catalog[0];
    const list = document.getElementById('admin-chapters-toggle-list');
    list.innerHTML = '';
    if (!book) return;

    (book.chapters || []).forEach(chapter => {
      const row = document.createElement('div');
      row.className = 'admin-row';

      row.innerHTML = `
        <div style="flex: 1; padding-left: 10px;">
          <div style="font-size: 13px; font-weight: bold; color: #fff;">قسمت ${toPersianDigits(chapter.number)}: ${chapter.title}</div>
          <div style="font-size: 11px; color: ${chapter.published ? '#34d399' : '#fbbf24'};">
            ${chapter.published ? '✅ منتشر شده (فعال برای همه)' : '🔒 در حالت به‌زودی (قفل)'}
          </div>
        </div>
        <div>
          <label class="switch">
            <input type="checkbox" id="toggle-ch-${chapter.id}" ${chapter.published ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>
      `;

      const input = row.querySelector(`#toggle-ch-${chapter.id}`);
      input.addEventListener('change', (e) => {
        chapter.published = e.target.checked;
        saveCatalogData();
        renderAdminDashboard();
        renderBookshelf();
        if (views.chapters.classList.contains('active')) {
          renderChapters();
        }
        showToast(`قسمت ${toPersianDigits(chapter.number)} ${chapter.published ? 'منتشر شد ✅' : 'قفل شد 🔒'}`);
      });

      list.appendChild(row);
    });

    // Cloud Sync URL input
    document.getElementById('input-cloud-sync-url').value = state.cloudSyncUrl || '';
  }

  // --- CLOUD SYNC ENGINE ---
  async function syncWithCloud(url, isSilent = false) {
    if (!url) {
      if (!isSilent) showToast('لطفاً آدرس همگام‌سازی را وارد کنید.');
      return;
    }

    try {
      if (!isSilent) showToast('درحال بررسی و دریافت آپدیت‌ها... ⏳');
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const remoteCatalog = await res.json();

      if (Array.isArray(remoteCatalog) && remoteCatalog.length > 0) {
        state.catalog = remoteCatalog;
        saveCatalogData();
        renderBookshelf();
        if (views.chapters.classList.contains('active')) {
          renderChapters();
        }
        if (!isSilent) showToast('کاتالوگ کتاب‌ها با موفقیت بروز شد! 🎉');
      } else {
        throw new Error('فرمت داده‌ها نامعتبر است.');
      }
    } catch (err) {
      console.warn('Sync error:', err);
      if (!isSilent) showToast(`خطا در همگام‌سازی: ${err.message}`);
    }
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // 1. Onboarding
    document.getElementById('btn-start-onboarding').addEventListener('click', () => {
      const input = document.getElementById('input-user-name');
      const val = (input.value || '').trim();
      state.user.name = val || 'محمد';
      saveUserData();
      header.style.display = 'flex';
      switchView('bookshelf');
      renderBookshelf();
      showToast(`خوش آمدید ${state.user.name} جان! 📚`);
    });

    document.getElementById('input-user-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('btn-start-onboarding').click();
      }
    });

    // 2. Profile Chip Edit Name
    profileChip.addEventListener('click', () => {
      const current = state.user.name || 'محمد';
      const newName = prompt('نام جدید خود را وارد کنید:', current);
      if (newName && newName.trim()) {
        state.user.name = newName.trim();
        saveUserData();
        if (views.bookshelf.classList.contains('active')) renderBookshelf();
        if (views.chapters.classList.contains('active')) renderChapters();
        showToast('نام شما بروزرسانی شد.');
      }
    });

    // 3. Navigation
    document.getElementById('btn-back-to-bookshelf').addEventListener('click', () => {
      switchView('bookshelf');
      renderBookshelf();
    });

    document.getElementById('btn-reader-close').addEventListener('click', () => {
      switchView('chapters');
      renderChapters();
    });

    // 4. Reader Controls
    document.getElementById('btn-story-next').addEventListener('click', nextSlide);
    document.getElementById('btn-story-prev').addEventListener('click', prevSlide);

    document.getElementById('btn-reader-share').addEventListener('click', () => {
      openShareModal(state.activeChapterId);
    });
    document.getElementById('btn-story-quick-share').addEventListener('click', () => {
      openShareModal(state.activeChapterId);
    });

    // Reader Touch Swipe Gestures
    let touchStartX = 0;
    let touchStartY = 0;
    const viewport = document.getElementById('story-viewport');

    viewport.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
    }, { passive: true });

    viewport.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;

      // Only trigger horizontal swipe if not scrolling vertically heavily
      if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        if (deltaX < 0) {
          // Swipe Left (in RTL, forward to next slide)
          nextSlide();
        } else {
          // Swipe Right (in RTL, back to previous slide)
          prevSlide();
        }
      }
    }, { passive: true });

    // Keyboard navigation
    window.addEventListener('keydown', (e) => {
      if (!views.reader.classList.contains('active')) return;
      if (e.key === 'ArrowLeft') {
        nextSlide();
      } else if (e.key === 'ArrowRight') {
        prevSlide();
      } else if (e.key === 'Escape') {
        document.getElementById('btn-reader-close').click();
      }
    });

    // 5. Celebration Modal Controls
    document.getElementById('btn-celebrate-share').addEventListener('click', () => {
      modals.celebration.classList.remove('active');
      openShareModal(state.activeChapterId);
    });

    document.getElementById('btn-celebrate-continue').addEventListener('click', () => {
      modals.celebration.classList.remove('active');
      const book = state.catalog.find(b => b.id === state.activeBookId);
      const currentChapter = book.chapters.find(c => c.id === state.activeChapterId);
      const nextChapter = book.chapters.find(c => c.number === currentChapter.number + 1);

      if (nextChapter && nextChapter.published) {
        openReader(nextChapter.id);
      } else {
        switchView('chapters');
        renderChapters();
      }
    });

    // 6. Share Modal Controls
    document.getElementById('btn-close-share-modal').addEventListener('click', () => {
      modals.share.classList.remove('active');
    });

    document.getElementById('btn-share-book-progress').addEventListener('click', () => {
      openShareModal(null);
    });

    document.getElementById('btn-copy-share-text').addEventListener('click', () => {
      const text = modals.share.dataset.shareText || document.getElementById('share-text-preview').textContent;
      navigator.clipboard.writeText(text).then(() => {
        showToast('متن پیام در حافظه کپی شد! 📋');
      }).catch(() => {
        showToast('خطا در کپی متن.');
      });
    });

    document.getElementById('btn-do-native-share').addEventListener('click', async () => {
      const text = modals.share.dataset.shareText || document.getElementById('share-text-preview').textContent;
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'پیشرفت مطالعه کتاب قلاب',
            text: text,
            url: window.location.href
          });
        } catch (err) {
          if (err.name !== 'AbortError') {
            document.getElementById('btn-copy-share-text').click();
          }
        }
      } else {
        document.getElementById('btn-copy-share-text').click();
      }
    });

    document.getElementById('btn-download-story-card').addEventListener('click', () => {
      const canvas = document.getElementById('story-canvas');
      const link = document.createElement('a');
      link.download = `hooked-story-${state.user.name || 'reader'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('عکس استوری با موفقیت ذخیره شد! 🖼️');
    });

    // 7. Admin Panel Controls
    document.getElementById('btn-open-admin').addEventListener('click', openAdminModal);

    document.getElementById('btn-close-admin-modal').addEventListener('click', () => {
      modals.admin.classList.remove('active');
    });

    document.getElementById('btn-verify-pin').addEventListener('click', () => {
      const pin = (document.getElementById('input-admin-pin').value || '').trim();
      if (pin === '1337') {
        state.isAdminAuthenticated = true;
        document.getElementById('admin-pin-container').style.display = 'none';
        document.getElementById('admin-dashboard-container').style.display = 'block';
        renderAdminDashboard();
      } else {
        showToast('رمز عبور اشتباه است.');
      }
    });

    document.getElementById('input-admin-pin').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-verify-pin').click();
    });

    document.getElementById('btn-save-cloud-url').addEventListener('click', () => {
      const url = (document.getElementById('input-cloud-sync-url').value || '').trim();
      state.cloudSyncUrl = url;
      localStorage.setItem('hooked_cloud_sync_url', url);
      showToast('آدرس همگام‌سازی ذخیره شد.');
    });

    document.getElementById('btn-sync-now').addEventListener('click', () => {
      const url = (document.getElementById('input-cloud-sync-url').value || '').trim();
      state.cloudSyncUrl = url;
      localStorage.setItem('hooked_cloud_sync_url', url);
      syncWithCloud(url, false);
    });

    document.getElementById('btn-export-catalog-json').addEventListener('click', () => {
      const json = JSON.stringify(state.catalog, null, 2);
      navigator.clipboard.writeText(json).then(() => {
        showToast('دیتای کامل کتاب‌ها به صورت JSON کپی شد! 📋');
      }).catch(() => {
        showToast('خطا در کپی داده‌ها.');
      });
    });

    // Close modals on clicking overlay backdrop
    Object.values(modals).forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    });
  }

  // --- PWA SETUP ---
  function setupPWA() {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('[SW] Registered successfully:', reg.scope))
          .catch(err => console.warn('[SW] Registration failed:', err));
      });
    }

    // Capture beforeinstallprompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      const banner = document.getElementById('pwa-install-banner');
      if (banner) banner.style.display = 'flex';
    });

    const installBtn = document.getElementById('btn-install-pwa');
    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (deferredInstallPrompt) {
          deferredInstallPrompt.prompt();
          const { outcome } = await deferredInstallPrompt.userChoice;
          console.log(`[PWA] Install prompt outcome: ${outcome}`);
          deferredInstallPrompt = null;
          document.getElementById('pwa-install-banner').style.display = 'none';
        } else {
          showToast('برای نصب: در منوی مرورگر (سه نقطه) گزینه "افزودن به صفحه اصلی" را بزنید.');
        }
      });
    }
  }

  // --- UTILITY: PERSIAN DIGITS ---
  function toPersianDigits(n) {
    if (n === null || n === undefined) return '';
    const persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return String(n).replace(/[0-9]/g, w => persian[+w]);
  }

  // Start app on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
