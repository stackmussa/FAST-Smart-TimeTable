"use client";

import React, { useState, useEffect, useMemo } from 'react';

type ClassEntry = {
  id?: string;
  school: string;
  department: string;
  section: string;
  day: string;
  time_start: string;
  time_end: string;
  course_name: string;
  room: string;
  instructor: string | null;
  batch: string;
  is_rescheduled?: boolean;
};

export default function TimetableViewer() {
  const [data, setData] = useState<ClassEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Form states
  const [selectedSchool, setSelectedSchool] = useState<string>('School of Computing');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

  // Apply dark mode class to html
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    // 1. Fetch Data
    fetch(`/timetable.json?t=${new Date().getTime()}`)
      .then((res) => res.json())
      .then((json: ClassEntry[]) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch timetable:', err);
        setLoading(false);
      });

    // 2. Determine PKT Day
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', timeZone: 'Asia/Karachi' };
    const pktDay = new Intl.DateTimeFormat('en-US', options).format(new Date());

    // If Sunday, default to Monday
    if (pktDay === 'Sunday') {
      setSelectedDay('Monday');
    } else {
      setSelectedDay(pktDay);
    }
  }, []);

  // Filter Logic
  // Allowed Schools according to requirements
  const ALLOWED_SCHOOLS = ['School of Computing', 'School of Management', 'School of Engineering'];

  const availableSchools = useMemo(() => {
    return ALLOWED_SCHOOLS;
  }, []);

  const availableDepartments = useMemo(() => {
    if (!selectedSchool) return [];
    const depts = new Set<string>();
    data.forEach((entry) => {
      if (entry.school === selectedSchool && entry.department && entry.department !== 'Unknown') {
        if (selectedSchool === 'School of Computing' && entry.department.toUpperCase() === 'PHD') return;
        depts.add(entry.department);
      }
    });
    return Array.from(depts).sort();
  }, [data, selectedSchool]);

  const availableBatches = useMemo(() => {
    if (!selectedSchool || !selectedDepartment) return [];
    const batches = new Set<string>();
    data.forEach((entry) => {
      if (
        entry.school === selectedSchool &&
        entry.department === selectedDepartment &&
        entry.batch && entry.batch !== 'Unknown'
      ) {
        batches.add(entry.batch);
      }
    });
    // Sort descending (2026, 2025, 2024, 2023)
    return Array.from(batches).sort((a, b) => b.localeCompare(a));
  }, [data, selectedSchool, selectedDepartment]);

  const availableSections = useMemo(() => {
    if (!selectedSchool || !selectedDepartment || !selectedBatch) return [];
    const secs = new Set<string>();
    data.forEach((entry) => {
      if (
        entry.school === selectedSchool &&
        entry.department === selectedDepartment &&
        entry.batch === selectedBatch &&
        entry.section && entry.section !== 'Unknown'
      ) {
        // Strip trailing numbers (e.g. "AI-B1" -> "AI-B") to group lab sections
        const baseSection = entry.section.replace(/\d+$/, '');
        secs.add(baseSection);
      }
    });
    return Array.from(secs).sort();
  }, [data, selectedSchool, selectedDepartment, selectedBatch]);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Handle cascading resets
  useEffect(() => {
    if (availableDepartments.length > 0 && !availableDepartments.includes(selectedDepartment)) {
      setSelectedDepartment(availableDepartments[0]);
    } else if (availableDepartments.length === 0) {
      setSelectedDepartment('');
    }
  }, [availableDepartments, selectedDepartment]);

  useEffect(() => {
    if (availableBatches.length > 0 && !availableBatches.includes(selectedBatch)) {
      setSelectedBatch(availableBatches[0]);
    } else if (availableBatches.length === 0) {
      setSelectedBatch('');
    }
  }, [availableBatches, selectedBatch]);

  useEffect(() => {
    if (availableSections.length > 0 && !availableSections.includes(selectedSection)) {
      setSelectedSection(availableSections[0]);
    } else if (availableSections.length === 0) {
      setSelectedSection('');
    }
  }, [availableSections, selectedSection]);

  const filteredClasses = useMemo(() => {
    if (!selectedSchool || !selectedDepartment || !selectedBatch || !selectedSection || !selectedDay) return [];

    return data
      .filter((entry) => {
        // Handle lab splits (e.g. AI-B1 and AI-B2 should both match AI-B)
        const baseSection = entry.section ? entry.section.replace(/\d+$/, '') : '';

        return (
          entry.school === selectedSchool &&
          entry.department === selectedDepartment &&
          entry.batch === selectedBatch &&
          baseSection === selectedSection &&
          entry.day === selectedDay
        );
      })
      .sort((a, b) => {
        // Sort chronologically by time_start e.g. "08:30"
        return a.time_start.localeCompare(b.time_start);
      });
  }, [data, selectedSchool, selectedDepartment, selectedBatch, selectedSection, selectedDay]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <div className="animate-spin h-10 w-10 border-4 border-blue-500 rounded-full border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-200 ${isDarkMode ? 'dark bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      {/* Header */}
      <header className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} shadow-sm border-b`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>FAST-NUCES Islamabad Timetable</h1>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${isDarkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
          >
            {isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} p-6 rounded-xl shadow-sm border mb-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4`}>

          <div className="flex flex-col">
            <label className={`text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>School</label>
            <select
              className={`border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                }`}
              value={selectedSchool}
              onChange={(e) => setSelectedSchool(e.target.value)}
            >
              {availableSchools.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className={`text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Department</label>
            <select
              className={`border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white disabled:bg-gray-800' : 'bg-white border-gray-300 text-gray-900 disabled:bg-gray-100'
                }`}
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              disabled={!availableDepartments.length}
            >
              {availableDepartments.length ? (
                availableDepartments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))
              ) : (
                <option value="">No Departments Found</option>
              )}
            </select>
          </div>

          <div className="flex flex-col">
            <label className={`text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Batch</label>
            <select
              className={`border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white disabled:bg-gray-800' : 'bg-white border-gray-300 text-gray-900 disabled:bg-gray-100'
                }`}
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              disabled={!availableBatches.length}
            >
              {availableBatches.length ? (
                availableBatches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))
              ) : (
                <option value="">No Batches Found</option>
              )}
            </select>
          </div>

          <div className="flex flex-col">
            <label className={`text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Section</label>
            <select
              className={`border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white disabled:bg-gray-800' : 'bg-white border-gray-300 text-gray-900 disabled:bg-gray-100'
                }`}
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              disabled={!availableSections.length}
            >
              {availableSections.length ? availableSections.map((s) => (
                <option key={s} value={s}>{s}</option>
              )) : (
                <option value="">No Sections Found</option>
              )}
            </select>
          </div>

          <div className="flex flex-col">
            <label className={`text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Day</label>
            <select
              className={`border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                }`}
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
            >
              {days.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Results Grid */}
        <div className="mt-6">
          {(!selectedSchool || !selectedDepartment || !selectedBatch || !selectedSection || !selectedDay) ? (
            <div className={`flex items-center justify-center h-64 rounded-xl shadow-sm border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
              <p className={`text-xl font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Please select School, Department, Batch, Section, and Day to view classes.</p>
            </div>
          ) : filteredClasses.length === 0 ? (
            <div className={`flex items-center justify-center h-64 rounded-xl shadow-sm border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
              <div className="text-center">
                <span className="text-4xl block mb-3">🎉</span>
                <p className={`text-xl font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>No classes scheduled for {selectedDay}!</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredClasses.map((cls, idx) => (
                <div key={cls.id || idx} className={`p-6 rounded-xl shadow-sm border transition-all hover:shadow-md ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
                  }`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className={`text-lg font-bold leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{cls.course_name}</h3>
                        {cls.is_rescheduled && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-500 border border-red-500/30 uppercase tracking-wider">
                            Rescheduled
                          </span>
                        )}
                      </div>
                      <span className={`text-xs mt-1 block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Section: {cls.section}</span>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-800'
                      }`}>
                      {cls.time_start && (
                        (() => {
                          const [sh, sm] = cls.time_start.split(':').map(Number);
                          const sp = sh >= 12 ? 'PM' : 'AM';
                          const sH = sh % 12 || 12;
                          return `${sH.toString().padStart(2, '0')}:${sm.toString().padStart(2, '0')} ${sp}`;
                        })()
                      )} - {cls.time_end && (
                        (() => {
                          const [eh, em] = cls.time_end.split(':').map(Number);
                          const ep = eh >= 12 ? 'PM' : 'AM';
                          const eH = eh % 12 || 12;
                          return `${eH.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')} ${ep}`;
                        })()
                      )}
                    </span>
                  </div>

                  <div className="space-y-2 mt-4">
                    <div className="flex items-center text-sm">
                      <svg className={`w-4 h-4 mr-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Room: {cls.room}</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <svg className={`w-4 h-4 mr-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Instructor: {cls.instructor || 'TBA'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Reserved for future Faculty RAG Chatbot integration */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          className="bg-blue-600 text-white w-14 h-14 rounded-full shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          aria-label="Chatbot"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
