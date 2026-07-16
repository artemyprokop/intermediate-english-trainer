// localStorage-backed progress state: Leitner boxes, mistake counts, streak.
//
// Every function reads a fresh copy of localStorage right before it needs
// it and writes back immediately after mutating — there is no long-lived
// in-memory cache. This matters because the app can be open in more than
// one tab (or reopened later that session): caching state in memory risks
// a stale tab's save() silently overwriting progress a newer tab already
// wrote, which is the classic way "my progress isn't saving" happens with
// localStorage-backed apps.

const Storage = (() => {
  const KEY = 'vet-state-v1';

  function defaultState() {
    return {
      version: 1,
      cards: {},        // cardId -> { box, due, correct, wrong, lastSeen }
      excluded: {},      // cardId -> true if the word was unchecked from study
      streak: { current: 0, longest: 0, lastDate: null },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return { ...defaultState(), ...parsed, cards: parsed.cards || {}, excluded: parsed.excluded || {} };
    } catch (e) {
      return defaultState();
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function cardId(unit, entry) {
    return `${pad2(unit)}:${entry.word}:${entry.pos}`;
  }

  function getCard(id) {
    const state = load();
    return state.cards[id] || { box: 1, due: todayKey(), correct: 0, wrong: 0, lastSeen: null };
  }

  function addDays(dateKey, n) {
    const d = new Date(dateKey + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  const BOX_INTERVAL_DAYS = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 14 };
  const MAX_BOX = 5;

  function recordAnswer(id, correct) {
    const state = load();
    const card = state.cards[id] || { box: 1, due: todayKey(), correct: 0, wrong: 0, lastSeen: null };
    let box = card.box || 1;
    if (correct) {
      box = Math.min(MAX_BOX, box + 1);
      card.correct = (card.correct || 0) + 1;
    } else {
      box = 1;
      card.wrong = (card.wrong || 0) + 1;
    }
    card.box = box;
    card.due = addDays(todayKey(), BOX_INTERVAL_DAYS[box]);
    card.lastSeen = Date.now();
    state.cards[id] = card;
    bumpStreak(state);
    save(state);
    return card;
  }

  function bumpStreak(state) {
    const today = todayKey();
    const s = state.streak;
    if (s.lastDate === today) return;
    if (s.lastDate) {
      const gap = daysBetween(s.lastDate, today);
      s.current = gap === 1 ? s.current + 1 : 1;
    } else {
      s.current = 1;
    }
    s.longest = Math.max(s.longest || 0, s.current);
    s.lastDate = today;
  }

  function isDue(card) {
    return !card.due || card.due <= todayKey();
  }

  function isLearned(card) {
    return (card.box || 1) >= MAX_BOX;
  }

  // Words are included in study (flashcards/quizzes) unless explicitly
  // unchecked in the unit's word list — so units nobody has customised
  // yet behave exactly as before (everything included).
  function isSelected(id) {
    const state = load();
    return !state.excluded[id];
  }

  function setSelected(id, selected) {
    const state = load();
    if (selected) delete state.excluded[id];
    else state.excluded[id] = true;
    save(state);
  }

  function selectedEntries(unitNum, entries) {
    const state = load();
    return entries.filter(e => !state.excluded[cardId(unitNum, e)]);
  }

  function selectAll(unitNum, entries) {
    const state = load();
    entries.forEach(e => { delete state.excluded[cardId(unitNum, e)]; });
    save(state);
  }

  function deselectAll(unitNum, entries) {
    const state = load();
    entries.forEach(e => { state.excluded[cardId(unitNum, e)] = true; });
    save(state);
  }

  function unitProgress(unitNum, entries) {
    const state = load();
    const active = entries.filter(e => !state.excluded[cardId(unitNum, e)]);
    let learned = 0;
    for (const e of active) {
      const c = state.cards[cardId(unitNum, e)];
      if (c && isLearned(c)) learned++;
    }
    return { total: active.length, learned, percent: active.length ? Math.round((learned / active.length) * 100) : 0 };
  }

  function globalStats(unitsWithEntries) {
    let total = 0, learned = 0;
    for (const u of unitsWithEntries) {
      const p = unitProgress(u.num, u.entries);
      total += p.total;
      learned += p.learned;
    }
    const state = load();
    return { total, learned, streak: state.streak.current || 0, longest: state.streak.longest || 0 };
  }

  function resetUnit(unitNum, entries) {
    const state = load();
    for (const e of entries) {
      delete state.cards[cardId(unitNum, e)];
    }
    save(state);
  }

  function mistakeList(unitsWithEntries, unitFilter) {
    const state = load();
    const list = [];
    for (const u of unitsWithEntries) {
      if (unitFilter && u.num !== unitFilter) continue;
      for (const e of u.entries) {
        const id = cardId(u.num, e);
        if (state.excluded[id]) continue;
        const c = state.cards[id];
        if (c && c.wrong > 0) {
          list.push({ unit: u.num, entry: e, id, wrong: c.wrong, correct: c.correct || 0, box: c.box });
        }
      }
    }
    list.sort((a, b) => (b.wrong - b.correct) - (a.wrong - a.correct) || b.wrong - a.wrong);
    return list;
  }

  return {
    cardId, getCard, recordAnswer, isDue, isLearned,
    isSelected, setSelected, selectedEntries, selectAll, deselectAll,
    unitProgress, globalStats, resetUnit, mistakeList,
    MAX_BOX,
  };
})();
