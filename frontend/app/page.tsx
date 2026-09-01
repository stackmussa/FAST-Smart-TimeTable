"use client";

import React, { useState, useEffect, useMemo } from 'react';
import FacultyFinder from './FacultyFinder';

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
  is_repeat?: boolean;
  is_cancelled?: boolean;
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
  const [showRepeated, setShowRepeated] = useState<boolean>(false);
  const [offlineMode, setOfflineMode] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<{comp: string | null, mgt: string | null, eng: string | null}>({comp: null, mgt: null, eng: null});
  const [activeTab, setActiveTab] = useState<'timetable' | 'faculty'>('timetable');

  // Force dark mode on mount & attach network listeners
  useEffect(() => {
    document.documentElement.classList.add('dark');

    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  useEffect(() => {
    // 1. Instantly load from local storage if available
    const cached = localStorage.getItem('timetable_data');
    const cachedTimes = localStorage.getItem('timetable_timestamps');
    
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setData(parsed);
          setLoading(false);
        }
        if (cachedTimes) {
          setLastUpdated(JSON.parse(cachedTimes));
        }
      } catch (e) {
        console.error("Failed to parse cached data", e);
      }
    }

    // 2. Fetch fresh data with retry logic
    const fetchWithRetry = async (url: string, retries = 3, delay = 1000): Promise<any[]> => {
      const fetchOptions = {
        cache: 'no-store' as RequestCache,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      };
      const t = Date.now();
      
      try {
        const res = await fetch(`${url}?t=${t}`, fetchOptions);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (error) {
        if (retries > 0) {
          console.warn(`Fetch failed for ${url}, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return fetchWithRetry(url, retries - 1, delay * 2); // Exponential backoff
        }
        throw error;
      }
    };

    const fetchData = async () => {
      try {
        const [compRes, mgtRes, engRes] = await Promise.all([
          fetchWithRetry('/computing.json').catch(() => null),
          fetchWithRetry('/management.json').catch(() => null),
          fetchWithRetry('/engineering.json').catch(() => null)
        ]);

        const parseRes = (res: any) => {
          if (!res) return { classes: [], last_updated: null };
          if (Array.isArray(res)) return { classes: res, last_updated: null };
          return { classes: res.classes || [], last_updated: res.last_updated || null };
        };

        const compData = parseRes(compRes);
        const mgtData = parseRes(mgtRes);
        const engData = parseRes(engRes);

        const allData = [...compData.classes, ...mgtData.classes, ...engData.classes];
        
        if (allData.length > 0) {
          setData(allData);
          
          const newTimestamps = {
            comp: compData.last_updated,
            mgt: mgtData.last_updated,
            eng: engData.last_updated
          };
          setLastUpdated(newTimestamps);
          
          localStorage.setItem('timetable_data', JSON.stringify(allData));
          localStorage.setItem('timetable_timestamps', JSON.stringify(newTimestamps));
          setOfflineMode(false);
          setLoading(false);
        } else {
          throw new Error("Empty data received");
        }
      } catch (err) {
        console.error('Failed to fetch timetable:', err);
        if (localStorage.getItem('timetable_data')) {
          setOfflineMode(true);
        } else {
          setLoading(false);
        }
      }
    };
    
    fetchData();

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

  const availableDays = useMemo(() => {
    if (!data.length) return [];
    const daySet = new Set<string>();
    data.forEach(entry => {
      if (entry.day && entry.day !== 'Unknown') {
        daySet.add(entry.day);
      }
    });

    const orderMap: Record<string, number> = {
      'monday': 1, 'tuesday': 2, 'wednesday': 3,
      'thursday': 4, 'friday': 5, 'saturday': 6, 'sunday': 7
    };

    return Array.from(daySet).sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();

      let aVal = 8;
      let bVal = 8;

      for (const [key, val] of Object.entries(orderMap)) {
        if (aLower.includes(key)) aVal = val;
        if (bLower.includes(key)) bVal = val;
      }

      if (aVal === bVal) return a.localeCompare(b);
      return aVal - bVal;
    });
  }, [data]);
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
          entry.day === selectedDay &&
          (showRepeated ? true : !entry.is_repeat)
        );
      })
      .sort((a, b) => {
        // Sort chronologically by time_start e.g. "08:30"
        return a.time_start.localeCompare(b.time_start);
      });
  }, [data, selectedSchool, selectedDepartment, selectedBatch, selectedSection, selectedDay, showRepeated]);

  const formatTime = (isoString: string | null) => {
    if (!isoString) return 'Unknown';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return 'Unknown';
    }
  };
  
  const getSelectedSchoolTimestamp = () => {
    if (selectedSchool === 'School of Computing') return lastUpdated.comp;
    if (selectedSchool === 'School of Management') return lastUpdated.mgt;
    if (selectedSchool === 'School of Engineering') return lastUpdated.eng;
    return null;
  };

  return (
    <div className={`min-h-screen transition-colors duration-200 dark bg-gray-900 text-gray-100`}>
      {/* Header */}
      <header className={`bg-gray-800 border-gray-700 shadow-sm border-b`}>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex flex-col md:flex-row items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
                FAST-NUCES Portal
              </h1>
              <p className="text-gray-400">Smart Schedule Viewer & Directory</p>
            </div>
            
            {/* Offline Status Badge */}
            <div className="mt-4 md:mt-0 flex items-center">
              {!isOnline ? (
                <div className="flex items-center space-x-2 bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded-full shadow-sm animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span className="text-sm font-medium">Device Offline: Showing cached data</span>
                </div>
              ) : offlineMode ? (
                <div className="flex items-center space-x-2 bg-yellow-900/50 border border-yellow-700 text-yellow-200 px-4 py-2 rounded-full shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
                  <span className="text-sm font-medium">Server Unreachable: Offline Mode</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 bg-green-900/30 border border-green-800 text-green-400 px-4 py-2 rounded-full shadow-sm opacity-80">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  <span className="text-sm font-medium">Live</span>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex space-x-2 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveTab('timetable')}
              className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                activeTab === 'timetable'
                  ? 'bg-blue-600 text-white shadow-md border border-blue-500'
                  : 'bg-gray-800/80 text-gray-400 hover:bg-gray-700 hover:text-gray-200 border border-gray-700'
              }`}
            >
              🗓️ Timetable Viewer
            </button>
            <button
              onClick={() => setActiveTab('faculty')}
              className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                activeTab === 'faculty'
                  ? 'bg-blue-600 text-white shadow-md border border-blue-500'
                  : 'bg-gray-800/80 text-gray-400 hover:bg-gray-700 hover:text-gray-200 border border-gray-700'
              }`}
            >
              🧑‍🏫 Faculty Finder
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        {activeTab === 'faculty' ? (
          <FacultyFinder />
        ) : (
          <div className="animate-fadeIn">
            {/* Filters */}
        <div className={`bg-gray-800 border-gray-700 p-6 rounded-xl shadow-sm border mb-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4`}>

          <div className="flex flex-col">
            <label className={`text-sm font-semibold mb-1 text-gray-300`}>School</label>
            <select
              className={`border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 bg-gray-700 border-gray-600 text-white disabled:bg-gray-800`}
              value={selectedSchool}
              onChange={(e) => setSelectedSchool(e.target.value)}
              disabled={loading}
            >
              {availableSchools.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className={`text-sm font-semibold mb-1 text-gray-300`}>Department</label>
            <select
              className={`border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 bg-gray-700 border-gray-600 text-white disabled:bg-gray-800`}
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              disabled={loading || !availableDepartments.length}
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
            <label className={`text-sm font-semibold mb-1 text-gray-300`}>Batch</label>
            <select
              className={`border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 bg-gray-700 border-gray-600 text-white disabled:bg-gray-800`}
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              disabled={loading || !availableBatches.length}
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
            <label className={`text-sm font-semibold mb-1 text-gray-300`}>Section</label>
            <select
              className={`border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 bg-gray-700 border-gray-600 text-white disabled:bg-gray-800`}
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              disabled={loading || !availableSections.length}
            >
              {availableSections.length ? availableSections.map((s) => (
                <option key={s} value={s}>{s}</option>
              )) : (
                <option value="">No Sections Found</option>
              )}
            </select>
          </div>

          <div className="flex flex-col">
            <label className={`text-sm font-semibold mb-1 text-gray-300`}>Day</label>
            <select
              className={`border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 bg-gray-700 border-gray-600 text-white disabled:bg-gray-800`}
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              disabled={loading}
            >
              {availableDays.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className={`text-sm font-semibold mb-1 text-gray-300`}>Repeated Courses</label>
            <button
              onClick={() => setShowRepeated(!showRepeated)}
              disabled={loading}
              className={`border rounded-lg p-2.5 font-medium transition-colors disabled:opacity-50 ${showRepeated
                ? 'bg-blue-600 text-white border-blue-500 hover:bg-blue-700'
                : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                }`}
            >
              {showRepeated ? 'Show: ON' : 'Show: OFF'}
            </button>
          </div>
        </div>

        {/* Results Grid */}
        <div className="mt-6">
          <div className="flex justify-end mb-3">
            <span className="text-xs font-semibold text-gray-500 bg-gray-800 border border-gray-700 px-3 py-1.5 rounded-full shadow-sm">
              <span className="mr-1">🕒</span> Last Updated: {formatTime(getSelectedSchoolTimestamp())}
            </span>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="p-6 rounded-xl shadow-sm border bg-gray-800 border-gray-700 animate-pulse">
                  <div className="flex justify-between items-start mb-4">
                    <div className="space-y-3 w-2/3">
                      <div className="h-5 bg-gray-700 rounded w-full"></div>
                      <div className="h-3 bg-gray-700 rounded w-1/2"></div>
                    </div>
                    <div className="h-6 w-16 bg-blue-900/40 rounded-full"></div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="flex items-center space-x-3">
                      <div className="w-5 h-5 rounded-full bg-gray-700"></div>
                      <div className="h-4 bg-gray-700 rounded w-1/3"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (!selectedSchool || !selectedDepartment || !selectedBatch || !selectedSection || !selectedDay) ? (
            <div className={`flex items-center justify-center h-64 rounded-xl shadow-sm border bg-gray-800 border-gray-700`}>
              <p className={`text-xl font-medium text-gray-400`}>Please select School, Department, Batch, Section, and Day to view classes.</p>
            </div>
          ) : filteredClasses.length === 0 ? (
            <div className={`flex items-center justify-center h-64 rounded-xl shadow-sm border bg-gray-800 border-gray-700`}>
              <div className="text-center">
                <span className="text-4xl block mb-3">🎉</span>
                <p className={`text-xl font-medium text-gray-300`}>No classes scheduled for {selectedDay}!</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredClasses.map((cls, idx) => (
                <div key={cls.id || idx} className={`p-6 rounded-xl shadow-sm border transition-all hover:shadow-md bg-gray-800 border-gray-700`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className={`text-lg font-bold leading-tight text-white`}>{cls.course_name}</h3>
                        {cls.is_cancelled && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/50 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse uppercase tracking-wider">
                            Cancelled
                          </span>
                        )}
                        {cls.is_rescheduled && !cls.is_cancelled && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/50 shadow-[0_0_8px_rgba(249,115,22,0.6)] animate-pulse uppercase tracking-wider">
                            Rescheduled
                          </span>
                        )}
                        {cls.is_repeat && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 shadow-[0_0_8px_rgba(234,179,8,0.6)] animate-pulse uppercase tracking-wider">
                            Repeated Course
                          </span>
                        )}
                      </div>
                      <span className={`text-xs mt-1 block text-gray-400`}>Section: {cls.section}</span>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 bg-blue-900/50 text-blue-300`}>
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

                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center">
                      <svg className={`w-5 h-5 mr-2.5 text-blue-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span className={`text-base font-medium tracking-wide text-gray-200`}>{cls.room}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
            {/* Results Grid Content End */}
          </div>
        )}

      {/* About Section */}
        <div className="mt-12 bg-gray-800 border-gray-700 p-6 rounded-xl shadow-sm border">
          <h2 className="text-xl font-bold text-white mb-4">About this System</h2>
          <p className="text-gray-300 mb-4">
            This is a simple system built to automate the extraction and display of class schedules from the official university Google Sheets. It dynamically tracks timetable changes and syncs them automatically to ensure you always have the most up-to-date schedule.
          </p>
          <div className="flex flex-col space-y-2">
            <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Source Data (Google Sheets)</span>
            <a href="https://docs.google.com/spreadsheets/d/1vlTuotLw34fedME3gNQj09cZw-todVomxAiu5P1wZ6Q/edit?gid=945396749#gid=945396749" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline transition-colors w-fit flex items-center">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
              School of Computing Timetable
            </a>
            <a href="https://docs.google.com/spreadsheets/d/1AnFQQhv9lu4grESE2ypbDG7E1QOPGgGCRiejem5ocPw/edit?gid=0#gid=0" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline transition-colors w-fit flex items-center">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
              School of Management Timetable
            </a>
            <a href="https://docs.google.com/spreadsheets/d/1fL2TWhPgbPc2d66vm_KywTpdsGBIaBLqlmz4JLPudCw/edit?gid=115356958#gid=115356958" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline transition-colors w-fit flex items-center">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
              School of Engineering Timetable
            </a>
          </div>
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
