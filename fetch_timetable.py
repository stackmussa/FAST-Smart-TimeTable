"""
Timetable Fetcher and Parser - v2 (Status-Level Diffing)

Enhancements over v1:
- deep_changed(): compares new vs. old data at the field level, specifically
  detecting status changes (is_cancelled, is_rescheduled, is_repeat) per class ID.
- save_with_metadata(): only writes a school JSON if *semantically* changed
  (ignores timestamp drift — only payload content counts).
- sync_metadata.json contains `changed_schools` (lowercase keys) + `status_changes`
  list of {id, field, old, new} for granular frontend awareness.
- Exit code 1 = changes found; 0 = no changes.
"""
import json
import logging
import requests
import io
import re
import sys
import time
import openpyxl
from typing import List, Dict, Any, Tuple
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

URLS = {
    "FSC": "https://docs.google.com/spreadsheets/d/1vlTuotLw34fedME3gNQj09cZw-todVomxAiu5P1wZ6Q/htmlview?gid=1174567785",
    "FSM": "https://docs.google.com/spreadsheets/d/1AnFQQhv9lu4grESE2ypbDG7E1QOPGgGCRiejem5ocPw/export?format=xlsx",
    "FSE": "https://docs.google.com/spreadsheets/d/1fL2TWhPgbPc2d66vm_KywTpdsGBIaBLqlmz4JLPudCw/export?format=xlsx&gid=115356958"
}

# ── Color maps ─────────────────────────────────────────────────────────────────
FSC_COLOR_LEGEND = {
    # BS CS
    "FFB740": "2026", "6D5200": "2025", "C39401": "2024", "FFE599": "2023",
    # BS DS
    "7F4CFF": "2026", "351C75": "2025", "B17FD7": "2024", "B4A7D6": "2023",
    # BS AI
    "00F600": "2026", "274E13": "2025", "6AA84F": "2024", "B6D7A8": "2023",
    # BS CY
    "0000FF": "2026", "073763": "2025", "599DDA": "2024", "ABCCEB": "2023",
    # BS SE
    "E62C06": "2026", "85200C": "2025", "DD7E6B": "2024", "F4CCCC": "2023"
}

FSM_COLOR_LEGEND = {
    "FFCC99FF": {"department": "AF", "degree": "BS", "batch": "2026"},
    "FFD9EAD3": {"department": "AF", "degree": "BS", "batch": "2025"},
    "FFFF89D8": {"department": "BBA", "degree": "BBA", "batch": "2026"},
    "FFFFB265": {"department": "BBA", "degree": "BBA", "batch": "2025"},
    "FFF28E86": {"department": "BA", "degree": "BS", "batch": "2026"},
    "FF00FFFF": {"department": "BA", "degree": "BS", "batch": "2025"},
    "FFFCD6EC": {"department": "FT", "degree": "BS", "batch": "2026"},
    "FFBC8E03": {"department": "FT", "degree": "BS", "batch": "2025"},
    "FFB5E3E8": {"department": "AF", "degree": "BS", "batch": "2024"},
    "FFFEF2CD": {"department": "FT", "degree": "BS", "batch": "2023"},
    "FFEA4335": {"department": "BBA", "degree": "BBA", "batch": "2024"},
    "FF79BCFF": {"department": "BBA", "degree": "BBA", "batch": "2023"},
    "FFA6E3B7": {"department": "BA", "degree": "BS", "batch": "2024"},
    "FF2F9299": {"department": "BA", "degree": "BS", "batch": "2023"},
    "FFFFE1CC": {"department": "FT", "degree": "BS", "batch": "2024"},
    "FF993366": {"department": "AF", "degree": "BS", "batch": "2023"}
}

FSE_COLOR_LEGEND = {
    "FFFFC000": {"department": "EE", "degree": "BS", "batch": "2026"},
    "FFFBBC04": {"department": "EE", "degree": "BS", "batch": "2026"},
    "FF00B0F0": {"department": "EE", "degree": "BS", "batch": "2025"},
    "FF00B050": {"department": "EE", "degree": "BS", "batch": "2024"},
    "FFEA4335": {"department": "EE", "degree": "BS", "batch": "2023"},
    "FFEF91F1": {"department": "CE", "degree": "BS", "batch": "2026"},
    "FFC0D91E": {"department": "CE", "degree": "BS", "batch": "2025"},
    "FFF4B084": {"department": "CE", "degree": "BS", "batch": "2024"},
    "FFBDD7EE": {"department": "EE", "degree": "BS", "batch": "2025", "is_repeat": True}
}

# ── Utility helpers ────────────────────────────────────────────────────────────

def clean_text(text: Any) -> str:
    if not text:
        return ""
    return str(text).strip()


def normalize_time(t: str) -> str:
    """Converts university times (1-7 treated as PM) to 24-hour HH:MM format."""
    if not t:
        return ""
    t_clean = t.replace(' ', '').replace('AM', '').replace('PM', '').strip()
    parts = t_clean.split(':')
    if len(parts) != 2:
        return t
    try:
        h = int(parts[0])
        m = int(parts[1][:2])
        if 1 <= h <= 7:
            h += 12
        return f"{h:02d}:{m:02d}"
    except ValueError:
        return t


def parse_electives(filepath: str) -> set:
    import os
    if not os.path.exists(filepath):
        return set()
    electives = set()
    current_sections: List[str] = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            section_match = re.match(r'Sections?\s+([A-Z0-9\-/\s]+):', line)
            if section_match:
                raw_sections = section_match.group(1)
                current_sections = [s.strip() for s in raw_sections.split('/')]
                continue
            course_match = re.match(r'-\s*(?:([A-Z0-9/-]+):)?\s*(.*?)(?:\s*\(.*Elective.*\))?$', line)
            if course_match and current_sections:
                course_code = course_match.group(1)
                course_name = course_match.group(2).strip()
                course_name = re.sub(r'\s*\(.*?\)$', '', course_name).strip().lower()
                for sec in current_sections:
                    sec_clean = sec.strip().upper()
                    dept_match = re.match(r'^B([A-Z]{2,3})-(\d+)([A-Z0-9]+)$', sec_clean)
                    if dept_match:
                        target_sec = f"{dept_match.group(1)}-{dept_match.group(3)}"
                    else:
                        target_sec = sec_clean
                    if course_code:
                        electives.add((target_sec, course_code.strip().upper()))
                    if course_name:
                        electives.add((target_sec, course_name))
    return electives


def generate_rag_summary(
    school: str, dept: str, degree: str, batch: str, section: str,
    course: str, room: str, day: str, t_start: str, t_end: str,
    is_lab: bool, is_rescheduled: bool = False, is_repeat: bool = False,
    is_cancelled: bool = False
) -> str:
    lab_text = " (Lab)" if is_lab else ""
    status_prefix = ""
    if is_cancelled:
        status_prefix = "[CANCELLED] "
    elif is_rescheduled:
        status_prefix = "[RESCHEDULED] "
    repeat_tag = " [REPEAT COURSE]" if is_repeat else ""
    return (
        f"{status_prefix}{degree} {dept} (Batch {batch}, Section {section}) "
        f"has {course}{lab_text}{repeat_tag} in Room {room} on {day} "
        f"from {t_start} to {t_end}."
    )


def download_workbook(url: str) -> openpyxl.Workbook:
    cb_url = f"{url}&_cb={int(time.time())}" if "?" in url else f"{url}?_cb={int(time.time())}"
    logging.info(f"Downloading data from {cb_url}")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    }
    response = requests.get(cb_url, headers=headers, timeout=30)
    response.raise_for_status()
    return openpyxl.load_workbook(filename=io.BytesIO(response.content), data_only=True)


def get_timetable_sheet(wb: openpyxl.Workbook):
    for name in wb.sheetnames:
        lower_name = name.lower()
        if 'timetable' in lower_name or 'schedule' in lower_name:
            return wb[name]
    return wb.active


def extract_time_slots(sheet, start_col: int = 2) -> List[tuple]:
    time_slots = []
    for r in range(1, 11):
        for col_idx in range(start_col, sheet.max_column + 1):
            val = clean_text(sheet.cell(row=r, column=col_idx).value)
            if val and "-" in val and any(char.isdigit() for char in val):
                time_slots.append((col_idx, val))
        if time_slots:
            break
    return time_slots


# ── Status-Level Diffing ───────────────────────────────────────────────────────

# Fields that are semantically significant (status changes we care about most)
STATUS_FIELDS = ("is_cancelled", "is_rescheduled", "is_repeat", "is_elective")
# All content fields (excludes rag_summary to avoid noise from wording changes)
CONTENT_FIELDS = (
    "department", "degree", "batch", "semester", "course_name",
    "section", "instructor", "room", "day", "time_start", "time_end",
    "is_lab", "is_cancelled", "is_rescheduled", "is_repeat", "is_elective"
)


def deep_diff(old_entries: List[Dict], new_entries: List[Dict]) -> Tuple[bool, List[Dict]]:
    """
    Performs a granular, field-level diff between old and new class entries.

    Returns:
        (changed: bool, status_changes: list of dicts describing each changed field)

    Strategy:
    1. Index old entries by ID.
    2. For every new entry, compare content fields against the old entry.
    3. Track additions, removals, and field-level changes.
    4. Specifically highlight status field changes for the frontend.
    """
    old_index: Dict[str, Dict] = {e["id"]: e for e in old_entries if "id" in e}
    new_index: Dict[str, Dict] = {e["id"]: e for e in new_entries if "id" in e}

    status_changes: List[Dict] = []
    any_changed = False

    # Check additions
    added_ids = set(new_index.keys()) - set(old_index.keys())
    if added_ids:
        any_changed = True
        for eid in added_ids:
            entry = new_index[eid]
            for f in STATUS_FIELDS:
                if entry.get(f):
                    status_changes.append({
                        "id": eid,
                        "course": entry.get("course_name", ""),
                        "day": entry.get("day", ""),
                        "section": entry.get("section", ""),
                        "field": f,
                        "old": None,
                        "new": entry.get(f)
                    })

    # Check removals
    removed_ids = set(old_index.keys()) - set(new_index.keys())
    if removed_ids:
        any_changed = True

    # Check modifications on existing entries
    for eid in set(old_index.keys()) & set(new_index.keys()):
        old = old_index[eid]
        new = new_index[eid]
        for field in CONTENT_FIELDS:
            old_val = old.get(field)
            new_val = new.get(field)
            if old_val != new_val:
                any_changed = True
                if field in STATUS_FIELDS:
                    status_changes.append({
                        "id": eid,
                        "course": new.get("course_name", ""),
                        "day": new.get("day", ""),
                        "section": new.get("section", ""),
                        "field": field,
                        "old": old_val,
                        "new": new_val
                    })

    return any_changed, status_changes


def save_with_metadata(filepath: str, new_entries: List[Dict]) -> Tuple[bool, List[Dict]]:
    """
    Saves entries to a JSON file ONLY if content differs from the stored version.
    Returns (changed: bool, status_changes: list).
    Uses deep_diff() for semantic comparison — ignores rag_summary wording drift.
    """
    import datetime, os

    now_iso = datetime.datetime.utcnow().isoformat() + "Z"
    old_entries: List[Dict] = []
    last_updated = now_iso

    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                old_data = json.load(f)
                old_entries = old_data.get("classes", []) if isinstance(old_data, dict) else old_data
                last_updated = old_data.get("last_updated", now_iso) if isinstance(old_data, dict) else now_iso
        except Exception as e:
            logging.warning(f"Could not read existing data from {filepath}: {e}")

    changed, status_changes = deep_diff(old_entries, new_entries)

    if changed:
        last_updated = now_iso
        final_data = {"last_updated": last_updated, "classes": new_entries}
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(final_data, f, indent=2, ensure_ascii=False)
        logging.info(f"  → {filepath} WRITTEN ({len(status_changes)} status change(s))")
        for sc in status_changes:
            logging.info(
                f"    STATUS CHANGE: [{sc['day']}] {sc['course']} ({sc['section']}) "
                f"— {sc['field']}: {sc['old']} → {sc['new']}"
            )
    else:
        logging.info(f"  → {filepath} unchanged (no semantic diff)")

    return changed, status_changes


# ── FSC Parser ─────────────────────────────────────────────────────────────────

FSC_SPREADSHEET_ID = "1vlTuotLw34fedME3gNQj09cZw-todVomxAiu5P1wZ6Q"
FSC_DAY_GIDS = {
    "Monday":    "1882612924",
    "Tuesday":   "945396749",
    "Wednesday": "542677125",
    "Thursday":  "571927841",
    "Friday":    "1783333514",
    "Saturday":  "1949393871",
}
FSC_DEPT_MAP = {"CS": "CS", "DS": "DS", "AI": "AI", "CY": "CY", "SE": "SE"}
ALLOWED_DEPTS = {"AI", "CS", "CY", "DS", "SE"}


def fetch_fsc_gids() -> Dict[str, str]:
    url = f"https://docs.google.com/spreadsheets/d/{FSC_SPREADSHEET_ID}/htmlview?_cb={int(time.time())}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
    try:
        html = requests.get(url, headers=headers, timeout=30).text
        matches = re.findall(r'items\.push\((.*?)\);', html)
        gids = {}
        for m in matches:
            name_match = re.search(r'name:\s*"([^"]+)"', m)
            gid_match = re.search(r'gid:\s*"(\d+)"', m)
            if name_match and gid_match:
                name = name_match.group(1).strip()
                gid = gid_match.group(1)
                name_lower = name.lower()
                if any(d in name_lower for d in ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']):
                    gids[name] = gid
        return gids
    except Exception as e:
        logging.error(f"Failed to fetch dynamic FSC GIDs: {e}")
        return {}


def parse_fsc() -> List[Dict[str, Any]]:
    entries = []
    electives_set = parse_electives("frontend/public/electives.txt")
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                extra_http_headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache"
                }
            )

            dynamic_gids = fetch_fsc_gids()
            day_gids_to_use = dynamic_gids if dynamic_gids else FSC_DAY_GIDS
            logging.info(f"Using FSC GIDs: {day_gids_to_use}")

            for day_name, gid in day_gids_to_use.items():
                frame_url = (
                    f"https://docs.google.com/spreadsheets/d/{FSC_SPREADSHEET_ID}"
                    f"/htmlview/sheet?headers=true&gid={gid}&_cb={int(time.time())}"
                )
                logging.info(f"Fetching FSC {day_name} (gid={gid})")

                try:
                    page = context.new_page()
                    page.goto(frame_url, wait_until="networkidle", timeout=60000)
                    page.wait_for_timeout(1500)
                    html_content = page.content()
                    page.close()
                except Exception as e:
                    logging.warning(f"Failed to load FSC {day_name}: {e}")
                    continue

                class_to_color = {}
                for match in re.finditer(r'\.(s\d+)\s*\{[^\}]*background-color:\s*(#[0-9a-fA-F]{6})', html_content):
                    class_to_color[match.group(1)] = match.group(2).upper().replace("#", "")

                soup = BeautifulSoup(html_content, "html.parser")
                table = soup.find("table")
                if not table:
                    logging.warning(f"No table for FSC {day_name}")
                    continue

                all_rows = table.find_all("tr")

                def extract_row_cells(r):
                    cells = r.find_all(["td", "th"])
                    grid = {}
                    vcol = 0
                    for c in cells:
                        colspan = int(c.get('colspan', 1))
                        grid[vcol] = (clean_text(c.get_text()), c, colspan)
                        vcol += colspan
                    return grid

                # Find time-slot header row
                time_col_map: Dict[int, str] = {}
                header_row_idx = None
                for ridx, row in enumerate(all_rows):
                    grid = extract_row_cells(row)
                    texts = [v[0] for v in grid.values()]
                    flat = " ".join(texts).lower()
                    if "room" in flat and "time" in flat:
                        for vcol, (txt, _, _) in grid.items():
                            if re.match(r"\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}", txt):
                                time_col_map[vcol] = txt
                        header_row_idx = ridx
                        break

                if not time_col_map or header_row_idx is None:
                    logging.warning(f"Could not find time header for FSC {day_name}")
                    continue

                day_count = 0
                for row in all_rows[header_row_idx + 1:]:
                    grid = extract_row_cells(row)
                    room = ""
                    if 1 in grid and grid[1][0]:
                        room = grid[1][0]

                    if not room or len(room) > 25:
                        continue

                    room_lower = room.lower()
                    if any(kw in room_lower for kw in ["bs ", "ms ", "phd"]):
                        room = "Unknown"
                    elif any(kw in room_lower for kw in [
                        "room", "time", "monday", "tuesday", "wednesday",
                        "thursday", "friday", "saturday", "sunday"
                    ]):
                        continue

                    for vcol, (val, cell, colspan) in grid.items():
                        if not val or vcol == 0 or vcol == 1:
                            continue

                        start_vcol = max((k for k in time_col_map.keys() if k <= vcol), default=None)
                        if start_vcol is None:
                            continue
                        time_val = time_col_map[start_vcol]

                        # ── Status detection (granular) ──────────────────────
                        val_lower = val.lower()
                        is_rescheduled = bool(re.search(r'\bressch\b|\brescheduled\b', val_lower))
                        is_cancelled = bool(re.search(r'\bcancelled\b|\bcanceled\b', val_lower))

                        # Parse course name and section info
                        course_match = re.match(r"^([^(]+)(?:\(([^)]+)\))?", val)
                        if not course_match:
                            continue

                        course_name = course_match.group(1).strip()
                        inside_parens = course_match.group(2)

                        # Clean status keywords from course name
                        if is_rescheduled:
                            course_name = re.sub(r'(?i)\s*[-]*\s*r(?:e)?sch(?:eduled)?', '', course_name).strip()
                        if is_cancelled:
                            course_name = re.sub(r'(?i)\s*[-]*\s*cancell?ed?', '', course_name).strip()

                        # Skip graduate courses (MS/PhD), but NOT just because of ResSch/Cancelled
                        if any(pg in val for pg in ["MS", "PhD", "PCS", "Repeat"]):
                            continue

                        # Skip MS evening slots
                        t_parts_check = time_val.split("-")
                        check_start = normalize_time(t_parts_check[0].strip()) if t_parts_check else ""
                        if check_start >= "17:20":
                            continue

                        td_classes = cell.get("class", [])
                        cell_color = None
                        for c in td_classes:
                            if c in class_to_color:
                                cell_color = class_to_color[c]
                                break

                        is_repeat = (cell_color == "FFFF00")

                        explicit_batch_code = None
                        sections_to_add = []

                        if inside_parens:
                            parts = [p.strip() for p in inside_parens.split(',')]
                            sec_part = parts[0]
                            explicit_batch_code = parts[1] if len(parts) > 1 else None
                            sec_split = sec_part.split('-')
                            dept_part = sec_split[0]
                            sec_letter = sec_split[1] if len(sec_split) > 1 else "A"
                            depts = [d.strip() for d in dept_part.split('/')]
                            for d in depts:
                                d_clean = d.replace('B', '') if d.startswith('B') and len(d) > 2 else d
                                d_mapped = FSC_DEPT_MAP.get(d_clean, d_clean)
                                if d_mapped in ALLOWED_DEPTS:
                                    sections_to_add.append((d_mapped, f"{d_mapped}-{sec_letter}"))
                        else:
                            if is_repeat:
                                sections_to_add.append(("CS", "CS-A"))
                            else:
                                continue

                        if not sections_to_add:
                            continue

                        batch_from_color = FSC_COLOR_LEGEND.get(cell_color, "Unknown") if cell_color else "Unknown"

                        if explicit_batch_code:
                            explicit_b = explicit_batch_code.strip()
                            batch = ("20" + explicit_b) if (len(explicit_b) == 2 and explicit_b.isdigit()) else explicit_b
                        else:
                            batch = batch_from_color

                        if len(batch) == 2 and batch.isdigit():
                            batch = "20" + batch

                        # Time calculation
                        t_parts = time_val.split("-")
                        t_start = normalize_time(t_parts[0].strip()) if t_parts else ""
                        end_vcol = max((k for k in time_col_map.keys() if k < vcol + colspan), default=vcol)
                        end_time_val = time_col_map[end_vcol]
                        end_t_parts = end_time_val.split("-")
                        t_end = normalize_time(end_t_parts[1].strip()) if len(end_t_parts) > 1 else ""

                        explicit_time_match = re.search(r"(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})", val)
                        if explicit_time_match:
                            t_start = normalize_time(explicit_time_match.group(1).strip())
                            t_end = normalize_time(explicit_time_match.group(2).strip())
                            course_name = re.sub(r"\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}", "", course_name).strip()
                        else:
                            special_durations = {
                                "seerah": 55, "uhq-i&ii": 110, "uhq-i & ii": 110,
                                "ideology": 105, "islamic": 105, "func eng": 105,
                                "uhq-ii": 55, "arts & humanities": 105
                            }
                            c_lower = course_name.lower()
                            duration = next((v for k, v in special_durations.items() if k in c_lower), None)
                            if duration and t_start:
                                try:
                                    from datetime import datetime, timedelta
                                    dt = datetime.strptime(t_start, "%H:%M")
                                    dt += timedelta(minutes=duration)
                                    t_end = dt.strftime("%H:%M")
                                except Exception:
                                    pass

                        is_lab = "lab" in course_name.lower() or "lab" in room.lower()
                        if day_name.lower() == "friday" and is_lab and t_start in ["13:00", "13:30"] and t_end == "17:15":
                            t_start = "14:30"

                        for dept, section_code in sections_to_add:
                            is_elective = False
                            c_name_lower = course_name.lower().strip()
                            for sec, key in electives_set:
                                if sec == section_code and (key == c_name_lower or key.upper() in course_name.upper()):
                                    is_elective = True
                                    break

                            entry_id = (
                                f"FSC-{day_name[:3].upper()}-{room.replace('-','')}"
                                f"-{t_start.replace(':','')}-{section_code.replace('-','')}"
                            )
                            summary = generate_rag_summary(
                                "School of Computing", dept, "BS", batch,
                                section_code, course_name, room, day_name,
                                t_start, t_end, is_lab, is_rescheduled, is_repeat, is_cancelled
                            )
                            if is_elective:
                                summary += " This is an elective course."

                            entries.append({
                                "id": entry_id,
                                "school": "School of Computing",
                                "department": dept,
                                "degree": "BS",
                                "batch": batch,
                                "semester": "Unknown",
                                "course_name": course_name,
                                "section": section_code,
                                "instructor": None,
                                "room": room,
                                "day": day_name,
                                "time_start": t_start,
                                "time_end": t_end,
                                "is_lab": is_lab,
                                "is_rescheduled": is_rescheduled,
                                "is_repeat": is_repeat,
                                "is_cancelled": is_cancelled,
                                "is_elective": is_elective,
                                "rag_summary": summary,
                            })
                            day_count += 1

                logging.info(f"  FSC {day_name}: {day_count} entries")

            browser.close()

    except Exception as e:
        logging.error(f"Error parsing FSC: {e}", exc_info=True)

    logging.info(f"FSC total: {len(entries)} entries.")
    return entries


# ── FSM Parser ─────────────────────────────────────────────────────────────────

def parse_fsm() -> List[Dict[str, Any]]:
    entries = []
    try:
        wb = download_workbook(URLS['FSM'])
        sheet = get_timetable_sheet(wb)
        time_slots = extract_time_slots(sheet, start_col=4)
        current_day = 'Monday'
        instructor_map = {}
        if 'Course Plan ' in wb.sheetnames:
            cp_sheet = wb['Course Plan ']
            for r_idx in range(4, cp_sheet.max_row + 1):
                c_code = clean_text(cp_sheet.cell(row=r_idx, column=2).value)
                c_title = clean_text(cp_sheet.cell(row=r_idx, column=3).value)
                c_sections_raw = clean_text(cp_sheet.cell(row=r_idx, column=7).value)
                instructor = clean_text(cp_sheet.cell(row=r_idx, column=8).value)
                if c_title and c_sections_raw and instructor:
                    sections = [s.strip().replace(' ', '') for s in c_sections_raw.split('/')]
                    c_title_clean = c_title.lower().replace(' ', '')
                    c_code_clean = (c_code or '').lower().replace(' ', '')
                    for s in sections:
                        s_key = s.lower()
                        if c_code_clean:
                            instructor_map[c_code_clean, s_key] = instructor
                        instructor_map[c_title_clean, s_key] = instructor
        
        for row_idx in range(4, sheet.max_row + 1):
            cell_A = clean_text(sheet.cell(row=row_idx, column=1).value)
            day_pattern = re.compile('^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)', re.IGNORECASE)
            if day_pattern.match(cell_A):
                current_day = day_pattern.match(cell_A).group(1).capitalize()
                continue
            
            room = clean_text(sheet.cell(row=row_idx, column=3).value)
            if not room or room.lower() == 'room':
                continue
                
            for col_idx, time_str in time_slots:
                cell_val = clean_text(sheet.cell(row=row_idx, column=col_idx).value)
                if not cell_val:
                    continue
                
                c_val_lower = cell_val.lower()
                is_rescheduled = bool(re.search(r'\bressch\b|\brescheduled\b', c_val_lower))
                is_cancelled = bool(re.search(r'\bcancelled\b|\bcanceled\b', c_val_lower))
                is_repeat = False
                
                course_name = re.sub(r'(?i)\s*[-]*\s*r(?:e)?sch(?:eduled)?', '', cell_val).strip()
                course_name = re.sub(r'(?i)\s*[-]*\s*cancell?ed?', '', course_name).strip()
                
                section = 'Unknown'
                possible_sec = clean_text(sheet.cell(row=row_idx, column=col_idx + 7).value)
                import re as rre
                if possible_sec and rre.match(r'^[A-Z]{2,3}\d{2,3}[A-Z]?$', possible_sec):
                    section = possible_sec
                    
                cell_obj = sheet.cell(row=row_idx, column=col_idx)
                cell_color_hex = None
                if cell_obj.fill and cell_obj.fill.fgColor and (cell_obj.fill.fgColor.type == 'rgb'):
                    cell_color_hex = cell_obj.fill.fgColor.rgb
                    
                meta = FSM_COLOR_LEGEND.get(cell_color_hex, {})
                department = meta.get('department', 'Unknown')
                degree = meta.get('degree', 'BS')
                batch = meta.get('batch', 'Unknown')
                
                t_parts = time_str.split('-')
                t_start = normalize_time(t_parts[0].strip()) if t_parts else ''
                t_end = normalize_time(t_parts[1].strip()) if len(t_parts) > 1 else ''
                is_lab = 'lab' in course_name.lower() or 'lab' in room.lower()
                
                instructor = instructor_map.get((course_name.lower().replace(' ', ''), section.lower()), instructor_map.get((course_name.lower().replace(' ', ''), ''), None))
                entry_id = f"FSM-{current_day[:3].upper()}-{room.replace('-', '')}-{t_start.replace(':', '')}-{section.replace(' ', '')}"
                summary = generate_rag_summary('School of Management', department, degree, batch, section, course_name, room, current_day, t_start, t_end, is_lab, is_rescheduled, is_repeat, is_cancelled)
                entries.append({'id': entry_id, 'school': 'School of Management', 'department': department, 'degree': degree, 'batch': batch, 'semester': 'Unknown', 'course_name': course_name, 'section': section, 'instructor': instructor, 'room': room, 'day': current_day, 'time_start': t_start, 'time_end': t_end, 'is_lab': is_lab, 'is_rescheduled': is_rescheduled, 'is_repeat': is_repeat, 'is_cancelled': is_cancelled, 'is_elective': False, 'rag_summary': summary})
    except Exception as e:
        logging.error(f'Error parsing FSM: {e}', exc_info=True)
    return entries


# ── FSE Parser ─────────────────────────────────────────────────────────────────

def parse_fse() -> List[Dict[str, Any]]:
    entries = []
    try:
        wb = download_workbook(URLS['FSE'])
        sheet = get_timetable_sheet(wb)
        time_slots = extract_time_slots(sheet, start_col=4)
        current_day = 'Monday'
        for row_idx in range(4, sheet.max_row + 1):
            cell_A = clean_text(sheet.cell(row=row_idx, column=1).value)
            day_pattern = re.compile('^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)', re.IGNORECASE)
            if day_pattern.match(cell_A):
                current_day = day_pattern.match(cell_A).group(1).capitalize()
                continue
            
            room = clean_text(sheet.cell(row=row_idx, column=3).value)
            if not room or room.lower() == 'room':
                continue
                
            for col_idx, time_str in time_slots:
                cell_val = clean_text(sheet.cell(row=row_idx, column=col_idx).value)
                if not cell_val:
                    continue
                    
                c_val_lower = cell_val.lower()
                is_rescheduled = bool(re.search(r'\bressch\b|\brescheduled\b', c_val_lower))
                is_cancelled = bool(re.search(r'\bcancelled\b|\bcanceled\b', c_val_lower))
                
                course_name = re.sub(r'(?i)\s*[-]*\s*r(?:e)?sch(?:eduled)?', '', cell_val).strip()
                course_name = re.sub(r'(?i)\s*[-]*\s*cancell?ed?', '', course_name).strip()
                
                import re as rre
                match = rre.search(r'\b([A-Z]{2,3}-[A-Z0-9]{1,2})\b$', course_name)
                if match:
                    section = match.group(1)
                    course_name = course_name[:match.start()].strip()
                else:
                    section = 'Unknown'
                    
                cell_obj = sheet.cell(row=row_idx, column=col_idx)
                cell_color_hex = None
                if cell_obj.fill and cell_obj.fill.fgColor and (cell_obj.fill.fgColor.type == 'rgb'):
                    cell_color_hex = cell_obj.fill.fgColor.rgb
                    
                meta = FSE_COLOR_LEGEND.get(cell_color_hex, {})
                department = meta.get('department', 'Unknown')
                degree = meta.get('degree', 'BS')
                batch = meta.get('batch', 'Unknown')
                is_repeat = meta.get('is_repeat', False)
                school = 'School of Engineering'
                semester = 'Unknown'
                
                t_parts = time_str.split('-')
                t_start = normalize_time(t_parts[0].strip()) if t_parts else ''
                t_end = normalize_time(t_parts[1].strip()) if len(t_parts) > 1 else ''
                is_lab = 'lab' in course_name.lower() or 'lab' in room.lower()
                
                entry_id = f"FSE-{current_day[:3].upper()}-{room.replace('-', '')}-{t_start.replace(':', '')}"
                summary = generate_rag_summary(school, department, degree, batch, section, course_name, room, current_day, t_start, t_end, is_lab, is_rescheduled, is_repeat, is_cancelled)
                entries.append({'id': entry_id, 'school': school, 'department': department, 'degree': degree, 'batch': batch, 'semester': semester, 'course_name': course_name, 'section': section, 'instructor': None, 'room': room, 'day': current_day, 'time_start': t_start, 'time_end': t_end, 'is_lab': is_lab, 'is_rescheduled': is_rescheduled, 'is_repeat': is_repeat, 'is_cancelled': is_cancelled, 'is_elective': False, 'rag_summary': summary})
    except Exception as e:
        logging.error(f'Error parsing FSE: {e}', exc_info=True)
    return entries


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    import datetime, os

    logging.info("=== Timetable Sync v2 — Status-Level Diffing ===")

    out_dir = "frontend/public"
    os.makedirs(out_dir, exist_ok=True)

    changed_schools: List[str] = []          # e.g. ["computing", "management"]
    all_status_changes: List[Dict] = []      # granular status change log

    # ── School of Computing ────────────────────────────────────────────────────
    logging.info("Parsing FSC (School of Computing)...")
    fsc_entries = parse_fsc()

    # Post-process Func Eng Lab sub-sections for Batch 2026
    for entry in fsc_entries:
        if entry.get("batch") == "2026" and entry.get("course_name") == "Func Eng Lab":
            s = entry.get("section", "")
            if s and s[-1].isdigit():
                entry["course_name"] = f"Func Eng Lab - {s[-1]}"
                summary = (
                    f"{entry.get('degree','')} {entry.get('department','')} "
                    f"(Batch {entry.get('batch')}, Section {s}) has {entry['course_name']} "
                    f"in Room {entry.get('room')} on {entry.get('day')} "
                    f"from {entry.get('time_start')} to {entry.get('time_end')}."
                )
                entry["rag_summary"] = summary

    fsc_changed, fsc_status = save_with_metadata(
        os.path.join(out_dir, "computing.json"), fsc_entries
    )
    if fsc_changed:
        changed_schools.append("computing")
        all_status_changes.extend(
            [dict(s, school="computing") for s in fsc_status]
        )
    logging.info(f"computing.json: {'CHANGED' if fsc_changed else 'unchanged'} — {len(fsc_entries)} entries")

    # ── School of Management ───────────────────────────────────────────────────
    logging.info("Parsing FSM (School of Management)...")
    fsm_entries = parse_fsm()
    fsm_changed, fsm_status = save_with_metadata(
        os.path.join(out_dir, "management.json"), fsm_entries
    )
    if fsm_changed:
        changed_schools.append("management")
        all_status_changes.extend(
            [dict(s, school="management") for s in fsm_status]
        )
    logging.info(f"management.json: {'CHANGED' if fsm_changed else 'unchanged'} — {len(fsm_entries)} entries")

    # ── School of Engineering ──────────────────────────────────────────────────
    logging.info("Parsing FSE (School of Engineering)...")
    fse_entries = parse_fse()
    fse_changed, fse_status = save_with_metadata(
        os.path.join(out_dir, "engineering.json"), fse_entries
    )
    if fse_changed:
        changed_schools.append("engineering")
        all_status_changes.extend(
            [dict(s, school="engineering") for s in fse_status]
        )
    logging.info(f"engineering.json: {'CHANGED' if fse_changed else 'unchanged'} — {len(fse_entries)} entries")

    # ── Write sync_metadata.json (only when real changes exist) ───────────────
    if changed_schools:
        sync_meta_path = os.path.join(out_dir, "sync_metadata.json")
        sync_metadata = {
            "last_updated": int(time.time()),
            "changed_schools": changed_schools,                # lowercase school keys
            "changed_files": [s.capitalize() for s in changed_schools],  # legacy compat
            "status_changes": all_status_changes,             # granular diff log
            "last_checked": datetime.datetime.utcnow().isoformat() + "Z"
        }
        with open(sync_meta_path, 'w', encoding='utf-8') as f:
            json.dump(sync_metadata, f, indent=2, ensure_ascii=False)
        logging.info(f"sync_metadata.json written — changed schools: {changed_schools}")
        logging.info(f"Status changes detected: {len(all_status_changes)}")
        for sc in all_status_changes:
            logging.info(
                f"  [{sc['school'].upper()}] [{sc.get('day','')}] "
                f"{sc.get('course','')} ({sc.get('section','')}) | "
                f"{sc['field']}: {sc['old']} → {sc['new']}"
            )
        logging.info("Exiting with code 1 (changes found — GitHub Actions will commit).")
        sys.exit(1)
    else:
        logging.info("No changes detected in any timetable — sync_metadata.json NOT updated.")
        logging.info("Exiting with code 0 (no changes — GitHub Actions will skip commit).")
        sys.exit(0)


if __name__ == "__main__":
    main()
