"use client";

import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Download, CalendarDays, Clock } from 'lucide-react';

type ExamEntry = {
  id: string;
  departments: string[];
  batch: string;
  course_name: string;
  date: string;
  time: string;
  is_repeat: boolean;
};

type ExamData = {
  is_final_draft: boolean;
  exams: ExamEntry[];
};

const DEPARTMENTS_BY_SCHOOL: Record<string, string[]> = {
  FSC: ['CS', 'SE', 'AI', 'CY', 'DS'],
  FSM: ['AF', 'FT', 'BBA', 'BA', 'BAF'],
  FSE: ['BCE', 'BEE']
};

export default function ExamScheduler() {
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [examType, setExamType] = useState('S1'); // S1, S2, Final
  const [school, setSchool] = useState('FSC');
  const [department, setDepartment] = useState('CS');
  const [batch, setBatch] = useState('2024');
  
  const scheduleRef = useRef<HTMLDivElement>(null);

  // Update department if school changes
  useEffect(() => {
    setDepartment(DEPARTMENTS_BY_SCHOOL[school][0]);
  }, [school]);

  useEffect(() => {
    const basePath = process.env.NODE_ENV === 'production' ? '/FAST-Smart-TimeTable' : '';
    // Dynamically load the correct JSON based on examType
    fetch(`${basePath}/exams_${examType.toLowerCase()}.json`)
      .then(res => res.json())
      .then(data => setExamData(data))
      .catch(err => {
        console.warn("Exam data not found for", examType);
        setExamData(null);
      });
  }, [examType]);

  const handleExportPNG = async () => {
    if (scheduleRef.current && examData?.is_final_draft) {
      const canvas = await html2canvas(scheduleRef.current, { 
        useCORS: true,
        allowTaint: true
      });
      const link = document.createElement('a');
      link.download = `Exam_Schedule_${batch}_${department}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  };

  const parseTime = (timeStr: string) => {
    const match = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (!match) return 0;
    
    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    
    // Intelligent heuristic for university schedules:
    // 8, 9, 10, 11 are AM
    // 12 is Noon (12)
    // 1, 2, 3, 4, 5, 6, 7 are PM (add 12)
    if (hours >= 1 && hours <= 7) {
      hours += 12;
    }
    
    return hours * 60 + minutes;
  };

  const filteredExams = examData?.exams?.filter(exam => 
    exam.batch === batch && exam.departments.includes(department)
  ).sort((a, b) => {
    const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return parseTime(a.time) - parseTime(b.time);
  }) || [];

  const formatDate = (dateString: string) => {
    if (!dateString || dateString === 'Unknown Date') return dateString;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  return (
    <div>
      {/* Filters (Matching page.tsx theme) */}
      <div className="mb-5 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/5 p-3 rounded-2xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          
          <div className="flex flex-col">
            <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-500 dark:text-slate-400 ml-1">Exam Type</label>
            <div className="relative">
              <select value={examType} onChange={e => setExamType(e.target.value)} className="w-full h-[40px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-white/10 rounded-lg px-3 appearance-none text-sm font-medium text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all cursor-pointer">
                <option value="S1">Sessional 1</option>
                <option value="S2">Sessional 2</option>
                <option value="Final">Final</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-500 dark:text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-500 dark:text-slate-400 ml-1">School</label>
            <div className="relative">
              <select value={school} onChange={e => setSchool(e.target.value)} className="w-full h-[40px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-white/10 rounded-lg px-3 appearance-none text-sm font-medium text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all cursor-pointer">
                <option value="FSC">Computing (FSC)</option>
                <option value="FSM">Management (FSM)</option>
                <option value="FSE">Engineering (FSE)</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-500 dark:text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-500 dark:text-slate-400 ml-1">Department</label>
            <div className="relative">
              <select value={department} onChange={e => setDepartment(e.target.value)} className="w-full h-[40px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-white/10 rounded-lg px-3 appearance-none text-sm font-medium text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all cursor-pointer">
                {DEPARTMENTS_BY_SCHOOL[school].map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-500 dark:text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-500 dark:text-slate-400 ml-1">Batch</label>
            <div className="relative">
              <select value={batch} onChange={e => setBatch(e.target.value)} className="w-full h-[40px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-white/10 rounded-lg px-3 appearance-none text-sm font-medium text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all cursor-pointer">
                <option value="2026">2026</option>
                <option value="2025">2025</option>
                <option value="2024">2024</option>
                <option value="2023">2023</option>
                <option value="2022">2022</option>
                <option value="2021">2021</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-500 dark:text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
          </div>

        </div>
      </div>

      {!examData && (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
          <p className="text-slate-500 dark:text-slate-400 mb-2">No exam data available for {examType}.</p>
        </div>
      )}

      {examData && (
        <>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 px-1 gap-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2 md:mb-0">
              Exam Schedule
            </h2>
            <button 
              onClick={handleExportPNG}
              disabled={!examData.is_final_draft}
              className={`flex items-center text-sm px-4 py-2 rounded-xl border shadow-sm transition-all w-full md:w-auto justify-center min-h-[44px] ${
                examData.is_final_draft 
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 dark:border-indigo-500 cursor-pointer' 
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-70'
              }`}
              title={!examData.is_final_draft ? "Export disabled. Schedule is still a draft." : "Export as PNG"}
            >
              <Download className="w-4 h-4 mr-2" /> 
              Export Schedule
            </button>
          </div>

          {!examData.is_final_draft && (
            <div className="mb-6 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 p-4 rounded-xl flex items-start">
              <div className="ml-3">
                <h3 className="text-sm font-bold">DRAFT VERSION</h3>
                <div className="text-sm mt-1">This schedule is subject to change. PNG export is disabled until the final version is released.</div>
              </div>
            </div>
          )}

          {/* Schedule Render Grid (Matching page.tsx classes cards) */}
          <div ref={scheduleRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-6">
            {filteredExams.map(exam => (
              <div 
                key={exam.id} 
                className="relative overflow-hidden flex flex-col rounded-2xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/5 shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-all duration-300 p-5 group"
              >
                 {exam.is_repeat && (
                    <span className="absolute top-3 right-3 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 border border-red-200 dark:border-red-500/20 uppercase tracking-wider">
                      Repeated
                    </span>
                 )}
                
                <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight mb-3 pr-16 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {exam.course_name}
                </h3>
                
                <div className="mt-auto space-y-2.5">
                  <div className="flex items-center text-slate-600 dark:text-slate-300 text-sm font-medium">
                    <CalendarDays className="w-4 h-4 mr-2.5 text-indigo-500 dark:text-indigo-400 opacity-70" />
                    {formatDate(exam.date)}
                  </div>
                  
                  <div className="flex items-center text-slate-600 dark:text-slate-300 text-sm font-medium">
                    <Clock className="w-4 h-4 mr-2.5 text-indigo-500 dark:text-indigo-400 opacity-70" />
                    {exam.time}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {filteredExams.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl text-center">
              <CalendarDays className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-4" />
              <p className="text-slate-500 dark:text-slate-400 font-medium text-lg">No exams found</p>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Try adjusting your filters for School, Department, and Batch.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
