// Hash router + bootstrap.

(function () {
  const app = document.getElementById('app');

  function parseHash() {
    const hash = location.hash.replace(/^#\/?/, '');
    const parts = hash.split('/').filter(Boolean);
    return parts;
  }

  function route() {
    window.scrollTo(0, 0);
    const parts = parseHash();

    if (parts.length === 0) {
      Views.renderHome(app);
      return;
    }

    if (parts[0] === 'hard') {
      Views.renderFlashcards(app, null, { global: true });
      return;
    }

    if (parts[0] === 'unit' && parts[1]) {
      const unitNum = Number(parts[1]);
      const mode = parts[2];
      if (!mode) {
        Views.renderUnitMenu(app, unitNum);
      } else if (mode === 'words') {
        Views.renderWordList(app, unitNum);
      } else if (mode === 'flashcards') {
        Views.renderFlashcards(app, unitNum);
      } else if (mode === 'quiz-en-ru') {
        Views.renderQuizEnRu(app, unitNum);
      } else if (mode === 'quiz-ru-en') {
        Views.renderQuizRuEn(app, unitNum);
      } else if (mode === 'hard') {
        Views.renderFlashcards(app, unitNum, { hard: true });
      } else {
        Views.renderUnitMenu(app, unitNum);
      }
      return;
    }

    Views.renderHome(app);
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', route);
  if (document.readyState !== 'loading') route();
})();
