// Unit metadata and JSON loading/caching.

const UNITS = [
  { num: 1, title: 'First Class' },
  { num: 2, title: 'Feelings' },
  { num: 3, title: 'Time Off' },
  { num: 4, title: 'Interests' },
  { num: 5, title: 'Working Life' },
  { num: 6, title: 'Buying and Selling' },
  { num: 7, title: 'Education' },
  { num: 8, title: 'Eating' },
  { num: 9, title: 'Houses' },
  { num: 10, title: 'Going Out' },
  { num: 11, title: 'The Natural World' },
  { num: 12, title: 'People I Know' },
  { num: 13, title: 'Journeys' },
  { num: 14, title: 'Technology' },
  { num: 15, title: 'Injuries and Illness' },
  { num: 16, title: 'News and Events' },
];

const Data = (() => {
  const cache = new Map();

  function unitFile(num) {
    return `data/unit${pad2(num)}.json`;
  }

  async function loadUnit(num) {
    if (cache.has(num)) return cache.get(num);
    const res = await fetch(unitFile(num));
    if (!res.ok) throw new Error(`Failed to load unit ${num}`);
    const entries = await res.json();
    cache.set(num, entries);
    return entries;
  }

  async function loadAll() {
    const all = await Promise.all(UNITS.map(u => loadUnit(u.num)));
    return UNITS.map((u, i) => ({ ...u, entries: all[i] }));
  }

  function unitMeta(num) {
    return UNITS.find(u => u.num === Number(num));
  }

  return { loadUnit, loadAll, unitMeta, UNITS };
})();
