// All screen renderers. Each render function takes the #app root element
// and (re)builds its innerHTML, then wires up event listeners.

const SESSION_SIZE = 15;

const Views = (() => {

  // ---------- shared bits ----------

  // Some views attach document-level listeners (e.g. Enter-to-advance in the
  // typed quiz) that must be torn down when leaving that view — whether the
  // user navigates elsewhere or the same view re-renders itself ("Еще раз").
  let activeCleanup = null;
  function clearActiveCleanup() {
    if (activeCleanup) {
      try { activeCleanup(); } catch (e) { /* ignore */ }
      activeCleanup = null;
    }
  }

  function topbar(root, title, backHash) {
    const bar = document.createElement('div');
    bar.className = 'topbar';
    bar.innerHTML = `
      ${backHash ? `<button class="back-btn" data-nav="${backHash}">‹</button>` : ''}
      <h1>${escapeHtml(title)}</h1>
    `;
    root.appendChild(bar);
  }

  function wireNav(root) {
    root.querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', () => { location.hash = el.getAttribute('data-nav'); });
    });
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  function confirmModal({ title, text, confirmLabel, onConfirm }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal-card">
        <h3>${escapeHtml(title)}</h3>
        <p style="color:var(--text-muted);font-size:14px;">${escapeHtml(text)}</p>
        <div class="modal-actions">
          <button class="cancel">Отмена</button>
          <button class="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
    backdrop.querySelector('.cancel').addEventListener('click', () => backdrop.remove());
    backdrop.querySelector('.confirm').addEventListener('click', () => { onConfirm(); backdrop.remove(); });
    document.body.appendChild(backdrop);
  }

  function boxClass(box) { return `b${box || 1}`; }

  function renderNoSelection(root, unitNum, backHash) {
    root.innerHTML = '';
    topbar(root, 'Нет слов', backHash);
    wireNav(root);
    root.innerHTML += `
      <div class="empty-state">
        <div class="emoji">📋</div>
        <p>Нет выбранных слов для тренировки.</p>
        <button class="pill-btn" data-nav="#/unit/${unitNum}/words" style="display:inline-block;margin-top:10px;">Выбрать слова</button>
      </div>`;
    wireNav(root);
  }

  // ---------- Home ----------

  async function renderHome(root) {
    const myGen = RenderGuard.next();
    clearActiveCleanup();
    root.innerHTML = `<div class="topbar"><h1>Тренажер лексики</h1></div><p style="color:var(--text-muted)">Загрузка…</p>`;
    const units = await Data.loadAll();
    if (!RenderGuard.isCurrent(myGen)) return;
    const stats = Storage.globalStats(units);

    root.innerHTML = '';
    const bar = document.createElement('div');
    bar.className = 'topbar';
    bar.innerHTML = `<h1>Тренажер лексики</h1>`;
    root.appendChild(bar);

    const statsRow = document.createElement('div');
    statsRow.className = 'stats-row';
    statsRow.innerHTML = `
      <div class="stat-card"><div class="value">${stats.total}</div><div class="label">слов всего</div></div>
      <div class="stat-card"><div class="value">${stats.learned}</div><div class="label">выучено</div></div>
      <div class="stat-card"><div class="value">${stats.streak}🔥</div><div class="label">дней подряд</div></div>
    `;
    root.appendChild(statsRow);

    const hardCount = Storage.mistakeList(units).length;
    if (hardCount > 0) {
      const banner = document.createElement('button');
      banner.className = 'hard-words-banner';
      banner.style.width = '100%';
      banner.innerHTML = `
        <div class="icon">🎯</div>
        <div class="text"><b>Трудные слова</b>${hardCount} слов с ошибками — повторить сейчас</div>
      `;
      banner.addEventListener('click', () => { location.hash = '#/hard'; });
      root.appendChild(banner);
    }

    const grid = document.createElement('div');
    grid.className = 'unit-grid';
    for (const u of units) {
      const p = Storage.unitProgress(u.num, u.entries);
      const card = document.createElement('button');
      card.className = 'unit-card';
      card.innerHTML = `
        <div class="num">ЮНИТ ${u.num}</div>
        <div class="title">${escapeHtml(u.title)}</div>
        <div class="count">${p.total} слов · ${p.percent}%</div>
        <div class="progress-bar"><div style="width:${p.percent}%"></div></div>
      `;
      card.addEventListener('click', () => { location.hash = `#/unit/${u.num}`; });
      grid.appendChild(card);
    }
    root.appendChild(grid);
  }

  // ---------- Unit menu ----------

  async function renderUnitMenu(root, unitNum) {
    const myGen = RenderGuard.next();
    clearActiveCleanup();
    root.innerHTML = `<div class="topbar"><h1>Юнит ${unitNum}</h1></div><p style="color:var(--text-muted)">Загрузка…</p>`;
    const meta = Data.unitMeta(unitNum);
    const entries = await Data.loadUnit(unitNum);
    if (!RenderGuard.isCurrent(myGen)) return;
    const progress = Storage.unitProgress(unitNum, entries);
    const hardCount = Storage.mistakeList([{ num: Number(unitNum), entries }]).length;

    root.innerHTML = '';
    topbar(root, `${meta ? meta.title : 'Юнит ' + unitNum}`, '#/');
    wireNav(root);

    const info = document.createElement('div');
    info.className = 'stat-card';
    info.style.marginBottom = '18px';
    info.innerHTML = `
      <div class="label" style="margin-bottom:6px;">Юнит ${unitNum} · ${progress.total} слов · выучено ${progress.percent}%</div>
      <div class="progress-bar"><div style="width:${progress.percent}%"></div></div>
    `;
    root.appendChild(info);

    const modes = document.createElement('div');
    modes.className = 'mode-list';
    modes.innerHTML = `
      <button class="mode-btn" data-nav="#/unit/${unitNum}/words">
        <div class="emoji">📋</div>
        <div class="info"><div class="name">Список слов</div><div class="desc">Выбери, какие слова изучать (${progress.total} из ${entries.length})</div></div>
        <div class="chev">›</div>
      </button>
      <button class="mode-btn" data-nav="#/unit/${unitNum}/flashcards">
        <div class="emoji">🃏</div>
        <div class="info"><div class="name">Карточки</div><div class="desc">Интервальное повторение (Leitner)</div></div>
        <div class="chev">›</div>
      </button>
      <button class="mode-btn" data-nav="#/unit/${unitNum}/quiz-en-ru">
        <div class="emoji">🇬🇧→🇷🇺</div>
        <div class="info"><div class="name">Викторина EN → RU</div><div class="desc">Выбери перевод из 4 вариантов</div></div>
        <div class="chev">›</div>
      </button>
      <button class="mode-btn" data-nav="#/unit/${unitNum}/quiz-ru-en">
        <div class="emoji">🇷🇺→🇬🇧</div>
        <div class="info"><div class="name">Викторина RU → EN</div><div class="desc">Введи слово на английском</div></div>
        <div class="chev">›</div>
      </button>
      <button class="mode-btn" data-nav="#/unit/${unitNum}/hard">
        <div class="emoji">🎯</div>
        <div class="info"><div class="name">Трудные слова</div><div class="desc">${hardCount} слов с ошибками в этом юните</div></div>
        <div class="chev">›</div>
      </button>
    `;
    root.appendChild(modes);

    const row = document.createElement('div');
    row.className = 'secondary-row';
    row.innerHTML = `
      <button class="pill-btn" id="export-csv">⬇ Экспорт в Anki (CSV)</button>
      <button class="pill-btn danger" id="reset-unit">Сбросить прогресс</button>
    `;
    root.appendChild(row);

    root.querySelector('#export-csv').addEventListener('click', () => {
      CsvExport.download(unitNum, entries);
      toast('CSV сохранен');
    });
    root.querySelector('#reset-unit').addEventListener('click', () => {
      confirmModal({
        title: 'Сбросить прогресс юнита?',
        text: 'Весь прогресс по карточкам этого юнита (коробки Leitner, ошибки) будет удален. Это действие нельзя отменить.',
        confirmLabel: 'Сбросить',
        onConfirm: () => {
          Storage.resetUnit(unitNum, entries);
          toast('Прогресс сброшен');
          renderUnitMenu(root, unitNum);
        },
      });
    });
    wireNav(root);
  }

  // ---------- Word list (pick which words go into flashcards/quizzes) ----------

  async function renderWordList(root, unitNum) {
    const myGen = RenderGuard.next();
    clearActiveCleanup();
    root.innerHTML = `<div class="topbar"><h1>Список слов</h1></div><p style="color:var(--text-muted)">Загрузка…</p>`;
    const meta = Data.unitMeta(unitNum);
    const entries = await Data.loadUnit(unitNum);
    if (!RenderGuard.isCurrent(myGen)) return;
    const backHash = `#/unit/${unitNum}`;

    function selectedCount() {
      return entries.filter(e => Storage.isSelected(Storage.cardId(unitNum, e))).length;
    }

    function renderList() {
      root.innerHTML = '';
      topbar(root, meta ? meta.title : `Юнит ${unitNum}`, backHash);
      wireNav(root);

      const header = document.createElement('div');
      header.className = 'stat-card';
      header.style.marginBottom = '14px';
      header.innerHTML = `<div class="label">Выбрано для изучения: ${selectedCount()} из ${entries.length}</div>`;
      root.appendChild(header);

      const row = document.createElement('div');
      row.className = 'secondary-row';
      row.style.marginTop = '0';
      row.style.marginBottom = '14px';
      row.innerHTML = `
        <button class="pill-btn" id="select-all">Выбрать все</button>
        <button class="pill-btn" id="select-none">Снять все</button>
      `;
      root.appendChild(row);
      row.querySelector('#select-all').addEventListener('click', () => {
        Storage.selectAll(unitNum, entries);
        renderList();
      });
      row.querySelector('#select-none').addEventListener('click', () => {
        Storage.deselectAll(unitNum, entries);
        renderList();
      });

      const list = document.createElement('div');
      list.className = 'word-list';
      entries.forEach(e => {
        const id = Storage.cardId(unitNum, e);
        const checked = Storage.isSelected(id);
        const card = Storage.getCard(id);
        const box = card.box || 1;
        const item = document.createElement('label');
        item.className = 'word-list-item';
        item.innerHTML = `
          <input type="checkbox" ${checked ? 'checked' : ''}>
          <span class="wli-main">
            <span class="wli-word">${escapeHtml(e.word)}${e.transcription ? ` <span class="wli-transcription">/${escapeHtml(e.transcription)}/</span>` : ''}</span>
            <span class="wli-translation">${escapeHtml(e.translation || '—')}</span>
          </span>
          <span class="wli-side">
            <span class="wli-pos">${escapeHtml(e.pos)}</span>
            <span class="wli-box ${boxClass(box)}">${Storage.isLearned(card) ? '✓' : box + '/5'}</span>
          </span>
        `;
        item.querySelector('input').addEventListener('change', (ev) => {
          Storage.setSelected(id, ev.target.checked);
          header.innerHTML = `<div class="label">Выбрано для изучения: ${selectedCount()} из ${entries.length}</div>`;
        });
        list.appendChild(item);
      });
      root.appendChild(list);
    }

    renderList();
  }

  // ---------- Flashcards (also used for hard-words practice) ----------

  async function renderFlashcards(root, unitNum, { hard = false, global = false } = {}) {
    const myGen = RenderGuard.next();
    clearActiveCleanup();
    root.innerHTML = `<div class="topbar"><h1>Карточки</h1></div><p style="color:var(--text-muted)">Загрузка…</p>`;

    let entries, backHash, title, ownerUnit = () => unitNum;
    if (global) {
      const units = await Data.loadAll();
      if (!RenderGuard.isCurrent(myGen)) return;
      const mistakes = Storage.mistakeList(units);
      entries = mistakes.map(m => m.entry);
      const map = new Map(mistakes.map(m => [m.entry, m.unit]));
      ownerUnit = (e) => map.get(e) || 1;
      backHash = '#/';
      title = 'Трудные слова';
    } else {
      const allEntries = await Data.loadUnit(unitNum);
      if (!RenderGuard.isCurrent(myGen)) return;
      backHash = `#/unit/${unitNum}`;
      title = hard ? 'Трудные слова' : 'Карточки';
      if (hard) {
        const mistakes = Storage.mistakeList([{ num: Number(unitNum), entries: allEntries }]);
        entries = mistakes.map(m => m.entry);
      } else {
        entries = Storage.selectedEntries(unitNum, allEntries);
      }
    }

    if (!entries.length) {
      if (hard || global) {
        root.innerHTML = '';
        topbar(root, title, backHash);
        wireNav(root);
        root.innerHTML += `<div class="empty-state"><div class="emoji">🎉</div><p>Пока нет слов с ошибками — отличная работа!</p></div>`;
      } else {
        renderNoSelection(root, unitNum, backHash);
      }
      return;
    }

    const session = hard || global ? shuffle(entries) : Leitner.buildFullSession(unitNum, entries);

    const state = { i: 0, flipped: false, known: 0, again: 0 };

    function currentUnit(entry) { return global ? ownerUnit(entry) : unitNum; }

    function renderCard() {
      root.innerHTML = '';
      topbar(root, title, backHash);
      wireNav(root);

      const pct = Math.round((state.i / session.length) * 100);
      const prog = document.createElement('div');
      prog.className = 'session-progress';
      prog.innerHTML = `<span>${state.i}/${session.length}</span><div class="progress-bar"><div style="width:${pct}%"></div></div>`;
      root.appendChild(prog);

      if (state.i >= session.length) {
        renderSummary();
        return;
      }

      const entry = session[state.i];
      const cid = Storage.cardId(currentUnit(entry), entry);
      const card = Storage.getCard(cid);

      const wrap = document.createElement('div');
      wrap.className = 'flip-card-wrap';
      wrap.innerHTML = `
        <div class="flip-card ${state.flipped ? 'flipped' : ''}" id="flip">
          <div class="flip-face front">
            <div class="box-tag ${boxClass(card.box)}">Коробка ${card.box || 1}</div>
            <button class="speak-btn" id="speak">🔊</button>
            <div class="card-word">${escapeHtml(entry.word)}</div>
            ${entry.transcription ? `<div class="card-transcription">/${escapeHtml(entry.transcription)}/</div>` : ''}
            <div class="card-pos">${escapeHtml(entry.pos)}</div>
          </div>
          <div class="flip-face back">
            <button class="speak-btn" id="speak2">🔊</button>
            <div class="card-translation">${escapeHtml(entry.translation || '—')}</div>
            ${entry.definition ? `<div class="card-definition">${escapeHtml(entry.definition)}</div>` : ''}
            ${entry.example ? `<div class="card-example">«${escapeHtml(entry.example)}»</div>` : ''}
          </div>
        </div>
      `;
      root.appendChild(wrap);

      const hint = document.createElement('div');
      hint.className = 'tap-hint';
      hint.textContent = 'Нажми на карточку, чтобы перевернуть';
      root.appendChild(hint);

      const answers = document.createElement('div');
      answers.className = 'answer-row';
      answers.innerHTML = `
        <button class="answer-btn dont-know" id="dont-know" ${state.flipped ? '' : 'disabled style="opacity:.4"'}>Не знаю</button>
        <button class="answer-btn know" id="know" ${state.flipped ? '' : 'disabled style="opacity:.4"'}>Знаю</button>
      `;
      root.appendChild(answers);

      const flipEl = root.querySelector('#flip');
      flipEl.addEventListener('click', () => { state.flipped = !state.flipped; renderCard(); });
      root.querySelectorAll('#speak, #speak2').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); TTS.speak(entry.word); });
      });

      if (state.flipped) {
        root.querySelector('#dont-know').addEventListener('click', (e) => {
          e.stopPropagation();
          Storage.recordAnswer(cid, false);
          state.again++;
          state.i++; state.flipped = false;
          renderCard();
        });
        root.querySelector('#know').addEventListener('click', (e) => {
          e.stopPropagation();
          Storage.recordAnswer(cid, true);
          state.known++;
          state.i++; state.flipped = false;
          renderCard();
        });
      }
    }

    function renderSummary() {
      root.innerHTML = '';
      topbar(root, title, backHash);
      wireNav(root);
      const box = document.createElement('div');
      box.className = 'summary-card';
      box.innerHTML = `
        <div class="big-emoji">✅</div>
        <div>Сессия завершена</div>
        <div class="big-num">${state.known} / ${session.length}</div>
        <p style="color:var(--text-muted)">правильных ответов</p>
        <div class="modal-actions">
          <button class="cancel" data-nav="${backHash}">Назад</button>
          <button class="confirm" style="background:var(--accent)" id="again">Еще раз</button>
        </div>
      `;
      root.appendChild(box);
      wireNav(root);
      root.querySelector('#again').addEventListener('click', () => renderFlashcards(root, unitNum, { hard, global }));
    }

    renderCard();
  }

  // ---------- Quiz EN -> RU ----------

  async function renderQuizEnRu(root, unitNum) {
    const myGen = RenderGuard.next();
    clearActiveCleanup();
    root.innerHTML = `<div class="topbar"><h1>Викторина EN → RU</h1></div><p style="color:var(--text-muted)">Загрузка…</p>`;
    const backHash = `#/unit/${unitNum}`;
    const entries = Storage.selectedEntries(unitNum, await Data.loadUnit(unitNum));
    if (!RenderGuard.isCurrent(myGen)) return;
    if (!entries.length) { renderNoSelection(root, unitNum, backHash); return; }
    const session = Leitner.buildSession(unitNum, entries, SESSION_SIZE);
    const state = { i: 0, correct: 0, answered: false };

    // Once an option has been picked, pressing Enter should act like
    // clicking "Далее" instead of requiring a mouse/tap.
    function onEnterAdvance(e) {
      if (e.key !== 'Enter') return;
      const nextBtn = root.querySelector('.next-btn');
      if (nextBtn) { e.preventDefault(); nextBtn.click(); }
    }
    document.addEventListener('keydown', onEnterAdvance);
    activeCleanup = () => document.removeEventListener('keydown', onEnterAdvance);

    function render() {
      root.innerHTML = '';
      topbar(root, 'Викторина EN → RU', backHash);
      wireNav(root);

      if (state.i >= session.length) {
        summary();
        return;
      }

      const pct = Math.round((state.i / session.length) * 100);
      const prog = document.createElement('div');
      prog.className = 'session-progress';
      prog.innerHTML = `<span>${state.i}/${session.length}</span><div class="progress-bar"><div style="width:${pct}%"></div></div>`;
      root.appendChild(prog);

      const entry = session[state.i];
      const cid = Storage.cardId(unitNum, entry);

      const prompt = document.createElement('div');
      prompt.className = 'quiz-prompt';
      prompt.innerHTML = `
        <button class="speak-btn" id="speak">🔊</button>
        <div class="card-word">${escapeHtml(entry.word)}</div>
        ${entry.transcription ? `<div class="card-transcription">/${escapeHtml(entry.transcription)}/</div>` : ''}
        <div class="card-pos">${escapeHtml(entry.pos)}</div>
      `;
      root.appendChild(prompt);
      root.querySelector('#speak').addEventListener('click', () => TTS.speak(entry.word));

      const distractPool = entries.filter(e => e !== entry && e.translation);
      const samePos = distractPool.filter(e => e.pos === entry.pos);
      const pool = samePos.length >= 3 ? samePos : distractPool;
      const distractors = sample(pool, Math.min(3, pool.length));
      const options = shuffle([entry, ...distractors]);

      const optsEl = document.createElement('div');
      optsEl.className = 'quiz-options';
      options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'quiz-option';
        btn.textContent = opt.translation || opt.word;
        // a focused button natively "clicks" itself on Enter; while unanswered,
        // stop that keystroke from also reaching onEnterAdvance on document,
        // so selecting an option via keyboard doesn't skip straight past the
        // correct/wrong highlight in the same event dispatch. Once answered,
        // let Enter bubble through normally so it can advance to "Далее".
        btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !state.answered) e.stopPropagation(); });
        btn.addEventListener('click', () => {
          if (state.answered) return;
          state.answered = true;
          const isCorrect = opt === entry;
          btn.classList.add(isCorrect ? 'correct' : 'wrong');
          if (!isCorrect) {
            const correctBtn = [...optsEl.children].find(b => b.textContent === (entry.translation || entry.word));
            if (correctBtn) correctBtn.classList.add('correct');
          } else {
            state.correct++;
          }
          Storage.recordAnswer(cid, isCorrect);
          const next = document.createElement('button');
          next.className = 'next-btn';
          next.textContent = 'Далее';
          next.addEventListener('click', () => { state.i++; state.answered = false; render(); });
          root.appendChild(next);
        });
        optsEl.appendChild(btn);
      });
      root.appendChild(optsEl);
    }

    function summary() {
      root.innerHTML = '';
      topbar(root, 'Викторина EN → RU', backHash);
      wireNav(root);
      const box = document.createElement('div');
      box.className = 'summary-card';
      box.innerHTML = `
        <div class="big-emoji">🏁</div>
        <div>Викторина завершена</div>
        <div class="big-num">${state.correct} / ${session.length}</div>
        <div class="modal-actions">
          <button class="cancel" data-nav="${backHash}">Назад</button>
          <button class="confirm" style="background:var(--accent)" id="again">Еще раз</button>
        </div>
      `;
      root.appendChild(box);
      wireNav(root);
      root.querySelector('#again').addEventListener('click', () => renderQuizEnRu(root, unitNum));
    }

    render();
  }

  // ---------- Quiz RU -> EN (typed) ----------

  async function renderQuizRuEn(root, unitNum) {
    const myGen = RenderGuard.next();
    clearActiveCleanup();
    root.innerHTML = `<div class="topbar"><h1>Викторина RU → EN</h1></div><p style="color:var(--text-muted)">Загрузка…</p>`;
    const backHash = `#/unit/${unitNum}`;
    const entries = Storage.selectedEntries(unitNum, await Data.loadUnit(unitNum));
    if (!RenderGuard.isCurrent(myGen)) return;
    if (!entries.length) { renderNoSelection(root, unitNum, backHash); return; }
    const session = Leitner.buildSession(unitNum, entries, SESSION_SIZE);
    const state = { i: 0, correct: 0, almostUsed: false, answered: false };

    // Once an answer has been submitted, pressing Enter again should act
    // like clicking "Далее" instead of requiring a mouse/tap.
    function onEnterAdvance(e) {
      if (e.key !== 'Enter') return;
      const nextBtn = root.querySelector('.next-btn');
      if (nextBtn) { e.preventDefault(); nextBtn.click(); }
    }
    document.addEventListener('keydown', onEnterAdvance);
    activeCleanup = () => document.removeEventListener('keydown', onEnterAdvance);

    function render() {
      root.innerHTML = '';
      topbar(root, 'Викторина RU → EN', backHash);
      wireNav(root);

      if (state.i >= session.length) {
        summary();
        return;
      }

      state.almostUsed = false;
      state.answered = false;

      const pct = Math.round((state.i / session.length) * 100);
      const prog = document.createElement('div');
      prog.className = 'session-progress';
      prog.innerHTML = `<span>${state.i}/${session.length}</span><div class="progress-bar"><div style="width:${pct}%"></div></div>`;
      root.appendChild(prog);

      const entry = session[state.i];
      const cid = Storage.cardId(unitNum, entry);

      const prompt = document.createElement('div');
      prompt.className = 'quiz-prompt';
      prompt.innerHTML = `
        <div class="card-translation">${escapeHtml(entry.translation || '—')}</div>
        ${entry.definition ? `<div class="card-definition" style="margin-top:8px;">${escapeHtml(entry.definition)}</div>` : ''}
      `;
      root.appendChild(prompt);

      const inputRow = document.createElement('div');
      inputRow.className = 'quiz-input-row';
      inputRow.innerHTML = `
        <input class="quiz-input" id="answer" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Введи слово на английском">
        <button class="quiz-submit" id="submit">OK</button>
      `;
      root.appendChild(inputRow);

      const feedbackHolder = document.createElement('div');
      root.appendChild(feedbackHolder);

      const input = root.querySelector('#answer');
      input.focus();

      function submit() {
        if (state.answered) return;
        const given = input.value.trim();
        if (!given) return;
        const correctWord = entry.word.trim();
        const exact = given.toLowerCase() === correctWord.toLowerCase();
        const dist = levenshtein(given, correctWord);

        if (exact) {
          state.answered = true;
          state.correct++;
          Storage.recordAnswer(cid, true);
          feedbackHolder.innerHTML = `<div class="feedback ok">Верно! ${escapeHtml(entry.word)}</div>`;
          advanceButton();
        } else if (dist === 1 && !state.almostUsed) {
          state.almostUsed = true;
          feedbackHolder.innerHTML = `<div class="feedback almost">Почти правильно, попробуй еще раз</div>`;
        } else {
          state.answered = true;
          Storage.recordAnswer(cid, false);
          feedbackHolder.innerHTML = `<div class="feedback wrong">Правильный ответ: ${escapeHtml(entry.word)}</div>`;
          advanceButton();
        }
      }

      function advanceButton() {
        input.disabled = true;
        const next = document.createElement('button');
        next.className = 'next-btn';
        next.textContent = 'Далее';
        next.addEventListener('click', () => { state.i++; render(); });
        feedbackHolder.appendChild(next);
      }

      root.querySelector('#submit').addEventListener('click', submit);
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        // stop this keystroke from also reaching onEnterAdvance on document —
        // otherwise the just-created "Далее" button would be clicked in the
        // same event dispatch, skipping the feedback message entirely.
        e.stopPropagation();
        submit();
      });
    }

    function summary() {
      root.innerHTML = '';
      topbar(root, 'Викторина RU → EN', backHash);
      wireNav(root);
      const box = document.createElement('div');
      box.className = 'summary-card';
      box.innerHTML = `
        <div class="big-emoji">🏁</div>
        <div>Викторина завершена</div>
        <div class="big-num">${state.correct} / ${session.length}</div>
        <div class="modal-actions">
          <button class="cancel" data-nav="${backHash}">Назад</button>
          <button class="confirm" style="background:var(--accent)" id="again">Еще раз</button>
        </div>
      `;
      root.appendChild(box);
      wireNav(root);
      root.querySelector('#again').addEventListener('click', () => renderQuizRuEn(root, unitNum));
    }

    render();
  }

  return {
    renderHome,
    renderUnitMenu,
    renderWordList,
    renderFlashcards,
    renderQuizEnRu,
    renderQuizRuEn,
  };
})();
