#!/usr/bin/env python3
"""Extract College run-sheet PDFs into structured JSON (one file per run).

usage: python3 -I scripts/extract_runs.py <pdf_dir> <out_dir>

Output is the RAW parse: per page a trip (AM/PM, or NORTH/SOUTH), items in reading order
(left column then right column), no coordinates. Items carry keyword flags only; a human reviews them.
"""
import html, json, re, subprocess, sys
from pathlib import Path

TIME = re.compile(r"^(\d{1,2})[.:](\d{2})$")
TURN = re.compile(r"^(Left|Right|U ?turn)\b[\s:]*", re.I)
WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
PAGE = re.compile(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', re.S)
UPDATED = re.compile(r"Updated\s*[:\-‐]?\s*(\d{2}/\d{2}/\d{4})\s*[-‐]?\s*(.*)", re.I)
LABEL = re.compile(r"^(AM|PM|TRIP NORTH|TRIP SOUTH)$", re.I)


def group_lines(words):
    words = sorted(words, key=lambda w: (w[1], w[0]))
    lines, cur, y = [], [], None
    for w in words:
        if y is None or abs(w[1] - y) <= 3:
            cur.append(w)
            y = w[1] if y is None else y
        else:
            lines.append(cur)
            cur, y = [w], w[1]
    if cur:
        lines.append(cur)
    return [" ".join(x[4] for x in sorted(l, key=lambda w: w[0])) for l in lines], [l[0][1] for l in lines]


def pages(pdf):
    xml = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    for pw, _ph, body in PAGE.findall(xml):
        pw = float(pw)
        words = [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(body)]
        # header row = lowest line containing the word "Time"; everything above is title block
        ty = [w[1] for w in words if w[4] == "Time"]
        hy = min(ty) if ty else 0
        head = [w for w in words if w[1] < hy - 3]
        row = [w for w in words if abs(w[1] - hy) <= 3] if ty else []
        body_w = [w for w in words if w[1] > hy + 3] if ty else words
        # footer (Updated ...) can sit in either column; pull it out by text later
        left = [w for w in body_w if w[0] < pw / 2]
        right = [w for w in body_w if w[0] >= pw / 2]
        yield {
            "head": group_lines(head)[0],
            "row": [w[4] for w in sorted(row, key=lambda w: w[0])],
            "left": group_lines(left)[0],
            "right": group_lines(right)[0],
            "row_left": [w[4] for w in sorted(row, key=lambda w: w[0]) if w[0] < pw / 2],
            "row_right": [w[4] for w in sorted(row, key=lambda w: w[0]) if w[0] >= pw / 2],
        }


def parse_item(text):
    t = text.strip()
    it = {"raw": t}
    parts = t.split(" ", 1)
    if TIME.match(parts[0]):
        h, m = re.split(r"[.:]", parts[0])
        it["time"] = f"{int(h):02d}:{m}"
        t = parts[1].strip() if len(parts) > 1 else ""
    m = TURN.match(t)
    if m:
        it["turn"] = m.group(1).title().replace(" ", "")
        t = t[m.end():].strip()
    it["text"] = t
    low = t.lower()
    if "as required" in low:
        it["as_required"] = True
    if "do not stop" in low or "express" in low:
        it["express"] = True
    if re.search(r"connect|off ?load|on ?load|school bus", low):
        it["connection"] = True
    if re.match(r"^(bs|bus stop|stop)\b", low) or re.search(r"\bbus stop\b|\bbs\b", low):
        it["stop"] = True
    if re.search(r"bus bay|set down|nudgee college|empty to depot|depart", low):
        it["school_or_depot"] = True
    return it


def parse(pdf):
    run = {"file": pdf.name, "title": None, "subtitle": [], "updated": None, "updated_note": None, "trips": []}
    for pg in pages(pdf):
        head = [h for h in pg["head"] if h.strip()]
        for h in list(head):
            m = UPDATED.search(h)
            if m:
                run["updated"], run["updated_note"] = m.group(1), m.group(2).strip() or None
                head.remove(h)
        if head and (run["title"] is None):
            run["title"], run["subtitle"] = head[0], head[1:]
        elif head and head[0] != run["title"]:
            run.setdefault("page_headings", []).append(head)
        cols = [("left", pg["left"], pg["row_left"]), ("right", pg["right"], pg["row_right"])]
        # Per-column labels (AM/PM both sides, or NORTH/SOUTH one each side)
        labels = []
        for _, _, row in cols:
            lab = next((w for w in row if LABEL.match(w)), None)
            labels.append(lab)
        if not any(labels):  # label printed above the "Time" row (or no Time row)
            toks = re.findall(r"\b(TRIP NORTH|TRIP SOUTH|AM|PM)\b", " ".join(pg["head"]) + " " + " ".join(pg["row"]))
            if len(set(toks)) > 1:
                labels = toks[:2]
            elif toks:
                labels = [toks[0], toks[0]]
        distinct = len(set(l for l in labels if l)) > 1
        merged = None
        for (side, lines, _), lab in zip(cols, labels):
            items = []
            lines = [re.sub(r"^(Updated:?)$", r"\1", l) for l in lines]
            for k, l in enumerate(lines):  # footer date can wrap onto the next line
                if l.strip().lower() in ("updated", "updated:") and k + 1 < len(lines) and re.match(r"\d{2}/\d{2}/\d{4}", lines[k + 1].strip()):
                    lines[k], lines[k + 1] = l.strip() + " " + lines[k + 1].strip(), ""
            for s in lines:
                s = s.strip()
                if not s:
                    continue
                m = UPDATED.search(s)
                if m:
                    run["updated"], run["updated_note"] = m.group(1), m.group(2).strip() or None
                    continue
                if re.match(r"^(Time|AM|PM)\b", s) and len(s) < 12:
                    continue
                items.append(parse_item(s))
            if distinct:
                run["trips"].append({"label": (lab or side).upper(), "items": items})
            else:
                if merged is None:
                    merged = {"label": (lab or labels[0] or labels[1] or "UNLABELLED").upper(), "items": []}
                    run["trips"].append(merged)
                merged["items"].extend(items)
    return run


def main(src, dst):
    src, dst = Path(src), Path(dst)
    dst.mkdir(parents=True, exist_ok=True)
    for pdf in sorted(src.glob("*.pdf")):
        run = parse(pdf)
        (dst / (pdf.stem + ".json")).write_text(json.dumps(run, indent=1, ensure_ascii=False))
        summ = ", ".join(f"{t['label']}:{len(t['items'])}items/{sum('time' in i for i in t['items'])}timed" for t in run["trips"])
        print(f"{pdf.name}: {run['title']!r} upd={run['updated']} [{summ}]")


if __name__ == "__main__":
    main(*sys.argv[1:3])
