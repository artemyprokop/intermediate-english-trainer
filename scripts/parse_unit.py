import fitz
import re
import sys
import json
import io
import os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

POS_WORDS = r'(?:Noun uncount|Noun plural|Noun|Verb|Adjective|Adverb|Phrasal verb|Phrase)'
HEADWORD_RE = re.compile(
    r'^(?P<word>[A-Za-z][A-Za-z\'’\- ]*?)\s*/(?P<ipa>[^/]+)/\s*(?P<pos>' + POS_WORDS + r')\s*$'
)
DASH = r'[–—\-]{0,2}'
# matches a line that is (or starts/continues) a derived-form declaration, e.g.
# "Noun: attendance", "Opposite – Adjective: impatient", "Opposite: check out",
# "Opposites— Phrase: in control", "Adverb: carefully || Opposite -- Adjective: careless"
DERIVED_LINE_RE = re.compile(
    r'^(?:' + DASH + r'\s*)?(?:Opposites?\s*' + DASH + r'\s*)?(?:' + POS_WORDS + r')\s*:'
)
BARE_OPPOSITE_RE = re.compile(r'^Opposites?\s*' + DASH + r'\s*:?\s*\S')

POS_SEGMENT_RE = re.compile(
    r'^(?:Opposites?\s*' + DASH + r'\s*)?(' + POS_WORDS + r')\s*:\s*(.+)$'
)
BARE_OPPOSITE_WORD_RE = re.compile(r'^Opposites?\s*' + DASH + r'\s*:?\s*(.+)$')


def is_derived_line(text):
    # a wrapped "|" separator sometimes lands at the start of the next physical line
    t = text.lstrip('|').strip()
    return bool(DERIVED_LINE_RE.match(t)) or bool(BARE_OPPOSITE_RE.match(t))


def extract_derived_pairs(decl_text, fallback_pos):
    normalized = re.sub(r'\|{2,}', '|', decl_text)
    segments = [s.strip(' –—-\t') for s in normalized.split('|')]
    pairs = []
    for seg in segments:
        if not seg:
            continue
        m = POS_SEGMENT_RE.match(seg)
        if m:
            pos_d, word_d = m.group(1), m.group(2).strip()
            for alt in word_d.split('/'):
                alt = alt.strip()
                if alt:
                    pairs.append((pos_d, alt))
            continue
        m2 = BARE_OPPOSITE_WORD_RE.match(seg)
        if m2:
            word_d = m2.group(1).strip()
            for alt in word_d.split('/'):
                alt = alt.strip()
                if alt:
                    pairs.append((fallback_pos, alt))
    return pairs

SKIP_FONTS = {'DINEngschriftStd', 'AmasisMTStd', 'AmasisMTStd-Bold', 'AmasisMTStd-Medium'}

POS_MAP = {
    'noun uncount': 'noun',
    'noun plural': 'noun',
    'noun': 'noun',
    'verb': 'verb',
    'adjective': 'adjective',
    'adverb': 'adverb',
    'phrasal verb': 'phrasal verb',
    'phrase': 'phrase',
}


def norm_pos(p):
    return POS_MAP.get(p.strip().lower(), p.strip().lower())


def extract_lines(path):
    doc = fitz.open(path)
    all_lines = []
    for page in doc:
        d = page.get_text("dict")
        page_lines = []
        for block in d["blocks"]:
            if "lines" not in block:
                continue
            for line in block["lines"]:
                spans = line["spans"]
                text = "".join(s["text"] for s in spans)
                if not text.strip():
                    continue
                fonts = [s["font"] for s in spans]
                bold = any(bool(s["flags"] & 2**4) for s in spans) or any('Bold' in f for f in fonts)
                italic_only = all(('It' in f or 'Italic' in f) for f in fonts) and not any('Bold' in f for f in fonts)
                x0 = line["bbox"][0]
                y0 = line["bbox"][1]
                if any(f in SKIP_FONTS for f in fonts):
                    continue
                text = text.strip()
                if text.startswith('Outcomes Intermediate Vocabulary Builder'):
                    continue
                if text.startswith('©'):
                    continue
                if re.match(r'^Pages\s+\d', text):
                    continue
                page_lines.append({
                    'x0': x0, 'y0': y0, 'text': text, 'bold': bold, 'italic_only': italic_only, 'fonts': fonts,
                })
        # split into two columns
        left = sorted([l for l in page_lines if l['x0'] < 200], key=lambda l: l['y0'])
        right = sorted([l for l in page_lines if l['x0'] >= 200], key=lambda l: l['y0'])
        all_lines.extend(left)
        all_lines.extend(right)
    return all_lines


def split_collocates(text):
    text = re.sub(r'^Collocates:\s*', '', text).strip()
    parts = [p.strip() for p in text.split('|')]
    return [p for p in parts if p]


def split_examples(text):
    parts = [p.strip() for p in text.split('|')]
    return [p for p in parts if p]


def pick_example(examples, word):
    if not examples:
        return ''
    wl = word.lower()
    for ex in examples:
        if re.search(r'\b' + re.escape(wl) + r'\b', ex.lower()):
            return ex
    stem = wl if len(wl) <= 5 else wl[:len(wl) - 2]
    for ex in examples:
        if re.search(r'\b' + re.escape(stem) + r'\w*', ex.lower()):
            return ex
    return examples[0]


def pick_collocations(collocs, word):
    if not collocs:
        return []
    wl = word.lower()
    matched = [c for c in collocs if re.search(r'\b' + re.escape(wl) + r'\b', c.lower())]
    return matched if matched else collocs


def parse_unit(path, unit_num):
    lines = extract_lines(path)
    entries = []
    issues = []

    i = 0
    n = len(lines)
    stopped = False

    current_word = None
    current_ipa = None
    current_pos = None

    # block state
    phase = 'definition'
    definition_lines = []
    collocates_lines = []
    example_lines = []
    collocates_continuation_count = 0
    pending_derived = []  # list of (pos, word) for the block currently being filled

    def flush_block():
        nonlocal definition_lines, collocates_lines, example_lines, pending_derived, collocates_continuation_count
        definition = ' '.join(definition_lines).strip()
        collocations_all = split_collocates(' '.join(collocates_lines)) if collocates_lines else []
        examples_all = split_examples(' '.join(example_lines)) if example_lines else []

        if pending_derived:
            for pos_d, word_d in pending_derived:
                ex = pick_example(examples_all, word_d)
                co = pick_collocations(collocations_all, word_d)
                entries.append({
                    'word': word_d,
                    'transcription': '',
                    'pos': norm_pos(pos_d),
                    'definition': definition,
                    'example': ex,
                    'translation': '',
                    'collocations': co,
                    'baseWord': current_word,
                })
        else:
            if current_word is not None:
                ex = pick_example(examples_all, current_word)
                if not definition:
                    issues.append({'unit': unit_num, 'word': current_word, 'reason': 'empty definition'})
                entries.append({
                    'word': current_word,
                    'transcription': current_ipa or '',
                    'pos': norm_pos(current_pos) if current_pos else '',
                    'definition': definition,
                    'example': ex,
                    'translation': '',
                    'collocations': collocations_all,
                    'baseWord': None,
                })

        definition_lines = []
        collocates_lines = []
        example_lines = []
        collocates_continuation_count = 0
        pending_derived = []

    skip_mode = False

    while i < n:
        line = lines[i]
        text = line['text']

        if text.strip() == 'EXERCISES':
            stopped = True
            break

        hw = HEADWORD_RE.match(text)

        if skip_mode:
            if hw:
                skip_mode = False
            else:
                i += 1
                continue

        if hw:
            # flush previous main entry (and any trailing derived group)
            if current_word is not None:
                flush_block()
            current_word = hw.group('word').strip()
            current_ipa = hw.group('ipa').strip()
            current_pos = hw.group('pos').strip()
            phase = 'definition'
            i += 1
            continue

        # detect all-caps heading (section box) -> enter skip mode
        stripped = text.strip()
        if line['bold'] and stripped == stripped.upper() and re.search(r'[A-Z]', stripped) and not re.search(r'[a-z]', stripped) and len(stripped) > 2:
            skip_mode = True
            i += 1
            continue

        if current_word is None:
            i += 1
            continue

        if is_derived_line(stripped):
            # merge consecutive derived-declaration lines
            if pending_derived or definition_lines or collocates_lines or example_lines:
                # a new derived-declaration run begins -> flush current block (main or previous derived group)
                flush_block()
            decl_text = stripped
            i += 1
            while i < n and is_derived_line(lines[i]['text'].strip()):
                decl_text += ' ' + lines[i]['text'].strip()
                i += 1
            pairs = extract_derived_pairs(decl_text, current_pos)
            seen = set()
            for pos_d, word_d in pairs:
                key = (pos_d, word_d.strip())
                if key not in seen:
                    seen.add(key)
                    pending_derived.append((pos_d, word_d.strip()))
            phase = 'definition'
            continue

        # classify content line
        if stripped.startswith('Collocates:'):
            phase = 'collocates'
            collocates_continuation_count = 0
            collocates_lines.append(stripped)
        elif phase == 'collocates' and not line['italic_only'] and collocates_continuation_count < 1:
            # collocates wrap onto at most one extra physical line in this book
            collocates_lines.append(stripped)
            collocates_continuation_count += 1
        elif line['italic_only'] or '|' in stripped:
            # examples are normally italic, but some are mis-rendered in
            # regular font in the source PDF; a bare "|" separator (once we
            # are past the collocates line) is a reliable fallback signal
            phase = 'examples'
            example_lines.append(stripped)
        elif phase == 'examples':
            example_lines.append(stripped)
        else:
            definition_lines.append(stripped)

        i += 1

    if current_word is not None:
        flush_block()

    entries = dedup_entries(entries)
    return entries, issues


def dedup_entries(entries):
    by_key = {}
    order = []
    for e in entries:
        key = (e['word'].lower(), e['pos'])
        if key not in by_key:
            by_key[key] = e
            order.append(key)
            continue
        existing = by_key[key]
        is_new_main = e['baseWord'] is None
        is_existing_main = existing['baseWord'] is None
        merged_collocations = list(dict.fromkeys(existing['collocations'] + e['collocations']))
        if is_new_main and not is_existing_main:
            e['collocations'] = merged_collocations
            if not e['example']:
                e['example'] = existing['example']
            by_key[key] = e
        else:
            existing['collocations'] = merged_collocations
            if not existing['example']:
                existing['example'] = e['example']
            if not existing['definition'] and e['definition']:
                existing['definition'] = e['definition']
            if not existing['transcription'] and e['transcription']:
                existing['transcription'] = e['transcription']
    return [by_key[k] for k in order]


if __name__ == '__main__':
    path = sys.argv[1]
    unit_num = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    out_path = sys.argv[3] if len(sys.argv) > 3 else None
    entries, issues = parse_unit(path, unit_num)
    result = json.dumps({'entries': entries, 'issues': issues, 'count': len(entries)}, ensure_ascii=False, indent=2)
    if out_path:
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(result)
    else:
        print(result)
