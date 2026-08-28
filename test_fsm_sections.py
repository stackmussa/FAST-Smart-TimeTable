import requests, io, openpyxl, re
from fetch_timetable import URLS, extract_time_slots, clean_text
response = requests.get(URLS['FSM'])
wb = openpyxl.load_workbook(filename=io.BytesIO(response.content), data_only=True)
sheet = wb.active
time_slots = extract_time_slots(sheet, start_col=4)
for row_idx in range(4, 15):
    for i in range(len(time_slots)):
        col_idx, time_val = time_slots[i]
        next_col_idx = time_slots[i+1][0] if i + 1 < len(time_slots) else sheet.max_column + 1
        val = clean_text(sheet.cell(row=row_idx, column=col_idx).value)
        if val:
            section = 'Unknown'
            semester = 'Unknown'
            # Look for section in the subsequent columns before the next time slot
            for c in range(col_idx + 1, next_col_idx):
                next_val = clean_text(sheet.cell(row=row_idx, column=c).value)
                if next_val:
                    # e.g., 'BBA05B'
                    sec_match = re.search(r'([A-Z]{2,4})(\d{2})([A-Z])', next_val)
                    if sec_match:
                        semester = sec_match.group(2).lstrip('0')
                        section = f"{sec_match.group(1)}-{sec_match.group(3)}"
                        break
            print(f'Row {row_idx}, Course: {val}, Section: {section}, Semester: {semester}')
