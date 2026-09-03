import os
import re

def clean_classes(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    replacements = {
        r'bg-slate-50 dark:bg-slate-50 dark:bg-slate-950': 'bg-slate-50 dark:bg-slate-950',
        r'bg-white dark:bg-white/60 dark:bg-slate-900/40': 'bg-white dark:bg-slate-900/40',
        r'bg-white dark:bg-white/80 dark:bg-slate-900/50': 'bg-white dark:bg-slate-900/50',
        r'bg-white dark:bg-slate-100/50 dark:bg-slate-900/30': 'bg-slate-50 dark:bg-slate-900/30',
        r'bg-slate-100 dark:bg-slate-200/50 dark:bg-slate-800/50': 'bg-slate-100 dark:bg-slate-800/50',
        r'text-slate-100': 'text-slate-900 dark:text-slate-100',
        r'text-slate-900 dark:text-slate-900 dark:text-slate-100': 'text-slate-900 dark:text-slate-100',
        r'text-slate-600 dark:text-slate-500': 'text-slate-500 dark:text-slate-400',
        r'text-slate-500 dark:text-slate-500': 'text-slate-500 dark:text-slate-400',
    }

    for old, new_class in replacements.items():
        content = content.replace(old, new_class)

    with open(file_path, 'w') as f:
        f.write(content)

clean_classes('e:/FAST/TimeTable/frontend/app/page.tsx')
clean_classes('e:/FAST/TimeTable/frontend/app/FacultyFinder.tsx')
print("Cleaned up classes!")
