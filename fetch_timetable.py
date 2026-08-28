"""
Timetable Fetcher and Parser

This script fetches, parses, and normalizes university timetable schedules 
from three public Google Sheets into a unified `timetable.json` file.
"""
import json
import logging
import requests
import io
import re
import openpyxl
from typing import List, Dict, Any
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

URLS = {
    "FSC": "https://docs.google.com/spreadsheets/d/1vlTuotLw34fedME3gNQj09cZw-todVomxAiu5P1wZ6Q/htmlview?gid=1174567785",
    "FSM": "https://docs.google.com/spreadsheets/d/1AnFQQhv9lu4grESE2ypbDG7E1QOPGgGCRiejem5ocPw/export?format=xlsx&gid=0",
    "FSE": "https://docs.google.com/spreadsheets/d/1fL2TWhPgbPc2d66vm_KywTpdsGBIaBLqlmz4JLPudCw/export?format=xlsx&gid=115356958"
}

# Example Color mappings for FSC - Configure according to the actual sheets
# Note: Color hex codes need to be updated from openpyxl's ARGB format to standard CSS hex/RGB formats to match the HTML view.
COLOR_LEGEND = {
    "FFFF0000": {"department": "CS", "degree": "BS", "batch": "2026", "semester": "1"}, 
    "FF00FF00": {"department": "DS", "degree": "BS", "batch": "2025", "semester": "3"},
    "FF0000FF": {"department": "AI", "degree": "BS", "batch": "2024", "semester": "5"},
    "FFFFFF00": {"department": "SE", "degree": "BS", "batch": "2023", "semester": "7"}
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
    "FFF4B084": {"department": "CE", "degree": "BS", "batch": "2024"}
}

def clean_text(text: Any) -> str:
    if not text:
        return ""
    return str(text).strip()

def normalize_time(t: str) -> str:
    """Converts university times (1-7 are PM) to 24-hour format for correct sorting."""
    if not t: return ""
    t_clean = t.replace(' ', '').replace('AM', '').replace('PM', '').strip()
    parts = t_clean.split(':')
    if len(parts) != 2: return t
    try:
        h = int(parts[0])
        m = int(parts[1][:2]) # in case there is trailing text
        # If hour is between 1 and 7 (inclusive), it is PM in university context.
        if 1 <= h <= 7:
            h += 12
        return f"{h:02d}:{m:02d}"
    except ValueError:
        return t

def download_workbook(url: str) -> openpyxl.Workbook:
    """Downloads Google Sheet as an Excel file and loads into openpyxl"""
    logging.info(f"Downloading data from {url}")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    return openpyxl.load_workbook(filename=io.BytesIO(response.content), data_only=True)

def generate_rag_summary(school: str, dept: str, degree: str, batch: str, section: str, 
                         course: str, room: str, day: str, t_start: str, t_end: str, is_lab: bool) -> str:
    """Generates a text summary string suitable for RAG ingestion."""
    lab_text = " (Lab)" if is_lab else ""
    return f"{degree} {dept} (Batch {batch}, Section {section}) has {course}{lab_text} in Room {room} on {day} from {t_start} to {t_end}."

def extract_time_slots(sheet: openpyxl.worksheet.worksheet.Worksheet, start_col: int = 2) -> List[tuple]:
    """Extracts column mappings for time slots by examining headers in the first 10 rows."""
    time_slots = []
    for r in range(1, 11):
        for col_idx in range(start_col, sheet.max_column + 1):
            val = clean_text(sheet.cell(row=r, column=col_idx).value)
            # Identify typical time slot format like '08:30-09:50'
            if val and "-" in val and any(char.isdigit() for char in val):
                time_slots.append((col_idx, val))
        if time_slots:
            break # Found the header row
    return time_slots

def parse_fsc() -> List[Dict[str, Any]]:
    """Parser for School of Computing using Playwright and BeautifulSoup"""
    entries = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            logging.info(f"Navigating to {URLS['FSC']}")
            page.goto(URLS["FSC"], wait_until="networkidle")
            
            page.wait_for_selector("iframe")
            
            # Extract content from the inner spreadsheet frame
            frame = page.frame(name="pageswitcher-content")
            if not frame and len(page.frames) > 1:
                frame = page.frames[1]
                
            if frame:
                html_content = frame.content()
            else:
                html_content = page.content()
                
            with open("fsc_downloaded.html", "w", encoding="utf-8") as f:
                f.write(html_content)
            browser.close()
            
        soup = BeautifulSoup(html_content, "html.parser")
        tables = soup.find_all("table")
        
        for table in tables:
            current_day = "Monday"
            time_slots = []
            
            rows = table.find_all("tr")
            for row in rows:
                # Exclude <th> to prevent row numbers from shifting the index
                cells = row.find_all("td")
                if not cells:
                    continue
                    
                # 1. Update the current day if found anywhere in the row
                for cell in cells:
                    text_lower = clean_text(cell.get_text()).lower()
                    if text_lower in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]:
                        current_day = text_lower.capitalize()
                        break
                        
                # 2. Identify the Room and calculate dynamic rowspan shift
                first_cell = clean_text(cells[0].get_text())
                shift = 1 if first_cell.capitalize() == current_day else 0
                
                if len(cells) <= shift:
                    continue
                    
                room = clean_text(cells[shift].get_text())
                
                # 3. Build time_slots map from the header row
                if not time_slots:
                    if "room" in room.lower() or "time" in room.lower():
                        for col_idx, cell in enumerate(cells):
                            val = clean_text(cell.get_text())
                            if val and "-" in val and any(char.isdigit() for char in val):
                                time_slots.append((col_idx, val))
                    continue
                    
                if not room or len(room) > 15 or room.lower() == "room/ time":
                    continue
                    
                # 4. Extract class data utilizing the dynamic shift
                for col_idx, time_val in time_slots:
                    target_idx = col_idx + shift
                    if target_idx < len(cells):
                        cell = cells[target_idx]
                        val = clean_text(cell.get_text())
                        if not val:
                            continue
                            
                        style = cell.get("style", "")
                        color_match = re.search(r'background-color:\s*([^;]+)', style)
                        color_hex = color_match.group(1).strip().upper() if color_match else "Unknown"
                        
                        color_info = {"department": "Unknown", "degree": "BS", "batch": "Unknown", "semester": "Unknown"}
                        for key in COLOR_LEGEND:
                            if key in color_hex or color_hex.replace("#", "") in key:
                                color_info = COLOR_LEGEND[key]
                                break
                                
                        course_match = re.match(r"(.*?)\s*\((.*?)\)", val)
                        if course_match:
                            course_name = course_match.group(1).strip()
                            section = course_match.group(2).strip()
                            
                            if any(m in section for m in ["PCS", "MS", "PhD"]):
                                continue
                                
                            t_parts = time_val.split("-")
                            t_start = normalize_time(t_parts[0].strip()) if len(t_parts) > 0 else ""
                            t_end = normalize_time(t_parts[1].strip()) if len(t_parts) > 1 else ""
                            
                            is_lab = "lab" in course_name.lower() or "lab" in room.lower()
                            dept, degree, batch = color_info["department"], color_info["degree"], color_info["batch"]
                            
                            summary = generate_rag_summary("School of Computing", dept, degree, batch, section, course_name, room, current_day, t_start, t_end, is_lab)
                            entry_id = f"FSC-{current_day[:3].upper()}-{room.replace('-', '')}-{t_start.replace(':', '')}"
                            
                            entries.append({
                                "id": entry_id,
                                "school": "School of Computing",
                                "department": dept,
                                "degree": degree,
                                "batch": batch,
                                "semester": color_info["semester"],
                                "course_name": course_name,
                                "section": section,
                                "instructor": None,
                                "room": room,
                                "day": current_day,
                                "time_start": t_start,
                                "time_end": t_end,
                                "is_lab": is_lab,
                                "rag_summary": summary
                            })
    except Exception as e:
        logging.error(f"Error parsing FSC: {e}")
    return entries

def parse_fsm() -> List[Dict[str, Any]]:
    """Parser for School of Management"""
    entries = []
    try:
        wb = download_workbook(URLS["FSM"])
        sheet = wb.active
        time_slots = extract_time_slots(sheet, start_col=4)
        current_day = "Monday"
        
        for row_idx in range(4, sheet.max_row + 1):
            cell_A = clean_text(sheet.cell(row=row_idx, column=1).value)
            
            # Check for day block start
            if cell_A.lower() in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]:
                current_day = cell_A.capitalize()
                
            room = clean_text(sheet.cell(row=row_idx, column=3).value)
            if not room:
                room = clean_text(sheet.cell(row=row_idx, column=2).value)
            if not room:
                continue
                
            for col_idx, time_val in time_slots:
                cell = sheet.cell(row=row_idx, column=col_idx)
                val = clean_text(cell.value)
                if not val:
                    continue
                    
                color_hex = str(cell.fill.start_color.index).upper() if cell.fill else "Unknown"
                color_info = {"department": "Unknown", "degree": "BS", "batch": "Unknown"}
                
                # Check for color in legend, allow partial match
                for key in FSM_COLOR_LEGEND:
                    if key in color_hex or color_hex.replace("#", "") in key:
                        color_info = FSM_COLOR_LEGEND[key]
                        break

                dept_code = color_info["department"]
                batch = color_info["batch"]
                degree = color_info["degree"]
                semester = "Unknown"
                section = "Unknown"
                
                course_name = re.sub(r'\(\d{2}:\d{2}-\d{2}:\d{2}\)', '', val).strip()
                course_name = re.sub(r'[\n\r]+', ' ', course_name).strip()
                
                t_parts = time_val.split("-")
                t_start = normalize_time(t_parts[0].strip()) if len(t_parts) > 0 else ""
                t_end = normalize_time(t_parts[1].strip()) if len(t_parts) > 1 else ""
                
                # Check for section in the subsequent merged/hidden columns before the next time slot
                current_time_slot_idx = next((i for i, v in enumerate(time_slots) if v[0] == col_idx), -1)
                next_col_idx = time_slots[current_time_slot_idx + 1][0] if current_time_slot_idx + 1 < len(time_slots) else sheet.max_column + 1
                
                for c in range(col_idx + 1, next_col_idx):
                    next_val = clean_text(sheet.cell(row=row_idx, column=c).value)
                    if next_val:
                        sec_match = re.search(r'([A-Z]{2,4})(\d{2})([A-Z])', next_val)
                        if sec_match:
                            semester = sec_match.group(2).lstrip('0')
                            section = f"{sec_match.group(1)}-{sec_match.group(3)}"
                            # If batch wasn't mapped by color, maybe estimate it from semester
                            break
                
                school = "School of Management"
                is_lab = False
                
                summary = generate_rag_summary(school, dept_code, degree, batch, section, course_name, room, current_day, t_start, t_end, is_lab)
                entry_id = f"FSM-{current_day[:3].upper()}-{room.replace('-', '')}-{t_start.replace(':', '')}"
                
                entries.append({
                    "id": entry_id,
                    "school": school,
                    "department": dept_code,
                    "degree": degree,
                    "batch": batch,
                    "semester": semester,
                    "course_name": course_name,
                    "section": section,
                    "instructor": None,
                    "room": room,
                    "day": current_day,
                    "time_start": t_start,
                    "time_end": t_end,
                    "is_lab": is_lab,
                    "rag_summary": summary
                })
    except Exception as e:
        logging.error(f"Error parsing FSM: {e}")
    return entries

def parse_fse() -> List[Dict[str, Any]]:
    """Parser for School of Engineering"""
    entries = []
    try:
        wb = download_workbook(URLS["FSE"])
        sheet = wb.active
        
        # In FSE time slots might be offset if room numbers occupy 2 columns
        # extract_time_slots iterates from column 2 onwards, so it should catch them
        time_slots = extract_time_slots(sheet, start_col=2)
        current_day = "Monday"
        
        for row_idx in range(4, sheet.max_row + 1):
            cell_A = clean_text(sheet.cell(row=row_idx, column=1).value)
            if cell_A.lower() in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]:
                current_day = cell_A.capitalize()
                
            # Room is often in col 3 or col 2
            room = clean_text(sheet.cell(row=row_idx, column=3).value)
            if not room:
                room = clean_text(sheet.cell(row=row_idx, column=2).value)
            if not room:
                continue
                
            for col_idx, time_val in time_slots:
                cell = sheet.cell(row=row_idx, column=col_idx)
                val = clean_text(cell.value)
                if not val:
                    continue
                    
                color_hex = str(cell.fill.start_color.index).upper() if cell.fill else "Unknown"
                color_info = {"department": "Unknown", "degree": "BS", "batch": "Unknown"}
                
                for key in FSE_COLOR_LEGEND:
                    if key in color_hex or color_hex.replace("#", "") in key:
                        color_info = FSE_COLOR_LEGEND[key]
                        break
                        
                batch = color_info["batch"]
                degree = color_info["degree"]
                    
                # Look ahead for instructor
                instructor = None
                next_val = clean_text(sheet.cell(row=row_idx + 1, column=col_idx).value)
                if next_val and "Dr." in next_val or "Ms." in next_val or "Mr." in next_val or "Engr." in next_val:
                    instructor = next_val
                
                # Newline separated for Course Title + Section, or split across rows
                lines = val.split('\n')
                if len(lines) >= 1:
                    first_line = lines[0].strip()
                    instructor = lines[1].strip() if len(lines) > 1 else None
                    
                    course_match = re.match(r"(.*?)\s+([A-Z]+-[A-Z]+|\b[A-Z]\b)$", first_line)
                    if course_match:
                        course_name = course_match.group(1).strip()
                        raw_section = course_match.group(2).strip()
                        if "-" in raw_section:
                            section = raw_section
                            dept = section.split('-')[0]
                        else:
                            dept = color_info["department"] if color_info["department"] != "Unknown" else "EE"
                            section = f"{dept}-{raw_section}"
                    else:
                        course_name = first_line
                        section = "Unknown"
                        dept = color_info["department"] if color_info["department"] != "Unknown" else "EE"
                        
                    t_parts = time_val.split("-")
                    t_start = normalize_time(t_parts[0].strip()) if len(t_parts) > 0 else ""
                    t_end = normalize_time(t_parts[1].strip()) if len(t_parts) > 1 else ""
                    
                    school = "School of Engineering"
                    semester = "Unknown"
                    is_lab = "lab" in course_name.lower() or "lab" in room.lower()
                    
                    summary = generate_rag_summary(school, dept, degree, batch, section, course_name, room, current_day, t_start, t_end, is_lab)
                    entry_id = f"FSE-{current_day[:3].upper()}-{room.replace('-', '')}-{t_start.replace(':', '')}"
                    
                    entries.append({
                        "id": entry_id,
                        "school": school,
                        "department": dept,
                        "degree": degree,
                        "batch": batch,
                        "semester": semester,
                        "course_name": course_name,
                        "section": section,
                        "instructor": instructor,
                        "room": room,
                        "day": current_day,
                        "time_start": t_start,
                        "time_end": t_end,
                        "is_lab": is_lab,
                        "rag_summary": summary
                    })
    except Exception as e:
        logging.error(f"Error parsing FSE: {e}")
    return entries

def main():
    logging.info("Starting timetable fetch and parse process.")
    all_entries = []
    
    logging.info("Parsing FSC (School of Computing)...")
    all_entries.extend(parse_fsc())
    
    logging.info("Parsing FSM (School of Management)...")
    all_entries.extend(parse_fsm())
    
    logging.info("Parsing FSE (School of Engineering)...")
    all_entries.extend(parse_fse())
    
    output_file = "timetable.json"
    logging.info(f"Writing {len(all_entries)} entries to {output_file}...")
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_entries, f, indent=2, ensure_ascii=False)
        
    logging.info("Process completed successfully.")

if __name__ == "__main__":
    main()
