// Session-building logic on top of Storage's Leitner boxes.

const Leitner = (() => {
  // Build an ordered queue of entries for a study session: due cards first
  // (lowest box first, since those need the most repetition), then
  // not-yet-due cards ordered by least-recently-seen, so a session never
  // runs out of material even if nothing is technically "due" yet.
  function buildSession(unitNum, entries, sessionSize) {
    const scored = entries.map(e => {
      const id = Storage.cardId(unitNum, e);
      const card = Storage.getCard(id);
      return { entry: e, id, card };
    });

    const due = scored.filter(x => Storage.isDue(x.card) && !Storage.isLearned(x.card));
    const notDue = scored.filter(x => !Storage.isDue(x.card) && !Storage.isLearned(x.card));
    const learned = scored.filter(x => Storage.isLearned(x.card));

    due.sort((a, b) => a.card.box - b.card.box);
    notDue.sort((a, b) => (a.card.lastSeen || 0) - (b.card.lastSeen || 0));
    // occasionally resurface a learned word so it isn't forgotten forever
    const learnedSample = sample(learned, Math.min(2, learned.length));

    const queue = [...due, ...notDue, ...learnedSample];
    const size = sessionSize || queue.length;
    return queue.slice(0, size).map(x => x.entry);
  }

  // Every word in the unit, every time — ordered so the weakest (lowest
  // box, least recently seen) come first, but nothing is ever left out.
  function buildFullSession(unitNum, entries) {
    const scored = entries.map(e => {
      const id = Storage.cardId(unitNum, e);
      const card = Storage.getCard(id);
      return { entry: e, card };
    });
    scored.sort((a, b) => (a.card.box - b.card.box) || ((a.card.lastSeen || 0) - (b.card.lastSeen || 0)));
    return scored.map(x => x.entry);
  }

  return { buildSession, buildFullSession };
})();
