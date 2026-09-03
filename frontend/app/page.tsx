"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Megaphone } from 'lucide-react';
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
  const [lastUpdated, setLastUpdated] = useState<{ comp: string | null, mgt: string | null, eng: string | null }>({ comp: null, mgt: null, eng: null });
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
    const cachedFilters = localStorage.getItem('timetable_filters');

    if (cachedFilters) {
      try {
        const p = JSON.parse(cachedFilters);
        if (p.selectedSchool) setSelectedSchool(p.selectedSchool);
        if (p.selectedDepartment) setSelectedDepartment(p.selectedDepartment);
        if (p.selectedBatch) setSelectedBatch(p.selectedBatch);
        if (p.selectedSection) setSelectedSection(p.selectedSection);
      } catch (e) {
        console.error("Failed to parse cached filters", e);
      }
    }
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
      // Determine basePath for GitHub Pages static export
      const isProd = process.env.NODE_ENV === 'production';
      const basePath = isProd ? '/FAST-Smart-TimeTable' : '';

      try {
        const [compRes, mgtRes, engRes] = await Promise.all([
          fetchWithRetry(`${basePath}/computing.json`).catch(() => null),
          fetchWithRetry(`${basePath}/management.json`).catch(() => null),
          fetchWithRetry(`${basePath}/engineering.json`).catch(() => null)
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

  // Save filters to localStorage whenever they change
  useEffect(() => {
    // Only save if data is loaded to avoid overwriting with empty states during initial render
    if (data.length > 0) {
      const filters = {
        selectedSchool,
        selectedDepartment,
        selectedBatch,
        selectedSection
      };
      localStorage.setItem('timetable_filters', JSON.stringify(filters));
    }
  }, [selectedSchool, selectedDepartment, selectedBatch, selectedSection, data.length]);

  // Scroll to top on tab switch
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

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
    if (data.length === 0) return;
    if (availableDepartments.length > 0 && !availableDepartments.includes(selectedDepartment)) {
      setSelectedDepartment(availableDepartments[0]);
    } else if (availableDepartments.length === 0) {
      setSelectedDepartment('');
    }
  }, [availableDepartments, selectedDepartment, data.length]);

  useEffect(() => {
    if (data.length === 0) return;
    if (availableBatches.length > 0 && !availableBatches.includes(selectedBatch)) {
      setSelectedBatch(availableBatches[0]);
    } else if (availableBatches.length === 0) {
      setSelectedBatch('');
    }
  }, [availableBatches, selectedBatch, data.length]);

  useEffect(() => {
    if (data.length === 0) return;
    if (availableSections.length > 0 && !availableSections.includes(selectedSection)) {
      setSelectedSection(availableSections[0]);
    } else if (availableSections.length === 0) {
      setSelectedSection('');
    }
  }, [availableSections, selectedSection, data.length]);

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
    <div className="min-h-screen font-sans bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/20 text-slate-100 overflow-x-hidden selection:bg-indigo-500/30">
      {/* Header */}
      <header className="relative z-10 border-b border-white/5 bg-slate-900/50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white mb-1">
                FAST-NUCES <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Islamabad</span>
              </h1>
              <p className="text-slate-400 font-medium">Smart Schedule Viewer &amp; Directory</p>
            </div>

            {/* Offline Status Badge */}
            <div className="flex items-center">
              {!isOnline ? (
                <div className="flex items-center space-x-2 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-xl shadow-sm backdrop-blur-md">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                  <span className="text-sm font-semibold tracking-wide">Device Offline</span>
                </div>
              ) : offlineMode ? (
                <div className="flex items-center space-x-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 px-4 py-2 rounded-xl shadow-sm backdrop-blur-md">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                  </span>
                  <span className="text-sm font-semibold tracking-wide">Server Unreachable</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-xl shadow-sm backdrop-blur-md">
                  <span className="relative flex h-3 w-3">
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  <span className="text-sm font-semibold tracking-wide">System Live</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-12">
        
        {/* Navigation Tabs */}
        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 w-full md:w-fit mb-8 shadow-lg">
          <button
            onClick={() => setActiveTab('timetable')}
            className={`flex items-center justify-center flex-1 md:flex-none px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 min-h-[44px] ${
              activeTab === 'timetable'
                ? 'bg-indigo-500 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <span className="mr-2 text-lg">🗓️</span>
            Timetable
          </button>
          <button
            onClick={() => setActiveTab('faculty')}
            className={`flex items-center justify-center flex-1 md:flex-none px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 min-h-[44px] ${
              activeTab === 'faculty'
                ? 'bg-indigo-500 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <span className="mr-2 text-lg">🧑‍🏫</span>
            Faculty
          </button>
        </div>

        {activeTab === 'faculty' ? (
          <FacultyFinder />
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Sticky Floating Filters */}
            <div className="sticky top-4 z-40 mb-8 bg-slate-900/70 backdrop-blur-xl border border-white/10 p-4 rounded-3xl shadow-2xl shadow-black/20">
              <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-2 md:pb-0 md:grid md:grid-cols-3 xl:grid-cols-6 scrollbar-hide">
                
                {/* School */}
                <div className="flex flex-col min-w-[200px] md:min-w-0 snap-start">
                  <label className="text-xs font-bold uppercase tracking-wider mb-1.5 text-slate-400 ml-1">School</label>
                  <div className="relative">
                    <select
                      className="w-full h-[44px] bg-slate-950/50 border border-white/10 rounded-xl px-4 appearance-none text-sm font-semibold text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                      value={selectedSchool}
                      onChange={(e) => setSelectedSchool(e.target.value)}
                      disabled={loading}
                    >
                      {availableSchools.map((s) => (
                        <option key={s} value={s} className="bg-slate-900">{s}</option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>
                </div>

                {/* Department */}
                <div className="flex flex-col min-w-[160px] md:min-w-0 snap-start">
                  <label className="text-xs font-bold uppercase tracking-wider mb-1.5 text-slate-400 ml-1">Department</label>
                  <div className="relative">
                    <select
                      className="w-full h-[44px] bg-slate-950/50 border border-white/10 rounded-xl px-4 appearance-none text-sm font-semibold text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all cursor-pointer disabled:opacity-50"
                      value={selectedDepartment}
                      onChange={(e) => setSelectedDepartment(e.target.value)}
                      disabled={loading || !availableDepartments.length}
                    >
                      {availableDepartments.length ? (
                        availableDepartments.map((d) => (
                          <option key={d} value={d} className="bg-slate-900">{d}</option>
                        ))
                      ) : (
                        <option value="" className="bg-slate-900">None</option>
                      )}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>
                </div>

                {/* Batch */}
                <div className="flex flex-col min-w-[120px] md:min-w-0 snap-start">
                  <label className="text-xs font-bold uppercase tracking-wider mb-1.5 text-slate-400 ml-1">Batch</label>
                  <div className="relative">
                    <select
                      className="w-full h-[44px] bg-slate-950/50 border border-white/10 rounded-xl px-4 appearance-none text-sm font-semibold text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all cursor-pointer disabled:opacity-50"
                      value={selectedBatch}
                      onChange={(e) => setSelectedBatch(e.target.value)}
                      disabled={loading || !availableBatches.length}
                    >
                      {availableBatches.length ? (
                        availableBatches.map((b) => (
                          <option key={b} value={b} className="bg-slate-900">{b}</option>
                        ))
                      ) : (
                        <option value="" className="bg-slate-900">None</option>
                      )}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>
                </div>

                {/* Section */}
                <div className="flex flex-col min-w-[120px] md:min-w-0 snap-start">
                  <label className="text-xs font-bold uppercase tracking-wider mb-1.5 text-slate-400 ml-1">Section</label>
                  <div className="relative">
                    <select
                      className="w-full h-[44px] bg-slate-950/50 border border-white/10 rounded-xl px-4 appearance-none text-sm font-semibold text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all cursor-pointer disabled:opacity-50"
                      value={selectedSection}
                      onChange={(e) => setSelectedSection(e.target.value)}
                      disabled={loading || !availableSections.length}
                    >
                      {availableSections.length ? availableSections.map((s) => (
                        <option key={s} value={s} className="bg-slate-900">{s}</option>
                      )) : (
                        <option value="" className="bg-slate-900">None</option>
                      )}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>
                </div>

                {/* Day */}
                <div className="flex flex-col min-w-[140px] md:min-w-0 snap-start">
                  <label className="text-xs font-bold uppercase tracking-wider mb-1.5 text-slate-400 ml-1">Day</label>
                  <div className="relative">
                    <select
                      className="w-full h-[44px] bg-slate-950/50 border border-white/10 rounded-xl px-4 appearance-none text-sm font-semibold text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                      value={selectedDay}
                      onChange={(e) => setSelectedDay(e.target.value)}
                      disabled={loading}
                    >
                      {availableDays.map((d) => (
                        <option key={d} value={d} className="bg-slate-900">{d}</option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>
                </div>

                {/* Repeated */}
                <div className="flex flex-col min-w-[140px] md:min-w-0 snap-start">
                  <label className="text-xs font-bold uppercase tracking-wider mb-1.5 text-slate-400 ml-1">Repeated</label>
                  <button
                    onClick={() => setShowRepeated(!showRepeated)}
                    disabled={loading}
                    className={`h-[44px] rounded-xl font-bold text-sm transition-all focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50 ${showRepeated
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                      : 'bg-slate-950/50 text-slate-300 border border-white/10 hover:bg-white/5'
                      }`}
                  >
                    {showRepeated ? 'Show: ON' : 'Show: OFF'}
                  </button>
                </div>

              </div>
            </div>

            {/* Results Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 px-1">
              <h2 className="text-2xl font-bold text-white mb-2 md:mb-0">
                {selectedDay}'s Classes
              </h2>
              <div className="flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-lg">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <span className="text-xs font-bold tracking-wide uppercase">Sync: {formatTime(getSelectedSchoolTimestamp())}</span>
              </div>
            </div>

            {/* Results Grid */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-white/5 rounded-2xl p-6 ring-1 ring-white/10 relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                    <div className="flex justify-between items-start mb-6">
                      <div className="space-y-3 w-2/3">
                        <div className="h-6 bg-white/10 rounded-lg w-full"></div>
                        <div className="h-4 bg-white/10 rounded-lg w-1/2"></div>
                      </div>
                      <div className="h-8 w-20 bg-indigo-500/20 rounded-xl"></div>
                    </div>
                    <div className="pt-4 border-t border-white/5">
                      <div className="flex items-center space-x-3">
                        <div className="w-6 h-6 rounded-md bg-white/10"></div>
                        <div className="h-5 bg-white/10 rounded-lg w-1/3"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (!selectedSchool || !selectedDepartment || !selectedBatch || !selectedSection || !selectedDay) ? (
              <div className="flex flex-col items-center justify-center h-64 bg-white/5 rounded-3xl border border-white/10 p-8 text-center">
                <span className="text-5xl mb-4 opacity-50">🧭</span>
                <p className="text-xl font-medium text-slate-300">Select your criteria above to view classes.</p>
              </div>
            ) : filteredClasses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 bg-white/5 rounded-3xl border border-white/10 p-8 text-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <span className="text-6xl block mb-4 animate-bounce">🎉</span>
                <p className="text-2xl font-bold text-white mb-2">No Classes Today!</p>
                <p className="text-slate-400 font-medium">Enjoy your free time.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredClasses.map((cls, idx) => (
                  <div key={cls.id || idx} className="group bg-white/5 rounded-3xl p-6 ring-1 ring-white/10 hover:ring-indigo-500/30 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/10 hover:bg-white/[0.07] transition-all duration-300 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-4 gap-4">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            {cls.is_cancelled && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.3)] animate-pulse uppercase tracking-widest">
                                Cancelled
                              </span>
                            )}
                            {cls.is_rescheduled && !cls.is_cancelled && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-[0_0_12px_rgba(249,115,22,0.5)] uppercase tracking-widest">
                                Rescheduled
                              </span>
                            )}
                            {cls.is_repeat && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.2)] uppercase tracking-widest">
                                Repeated
                              </span>
                            )}
                          </div>
                          <h3 className="text-lg md:text-xl font-bold text-white tracking-tight leading-tight line-clamp-2">
                            {cls.course_name}
                          </h3>
                          <p className="text-sm font-medium text-slate-400 mt-1 flex items-center">
                            <span className="bg-white/10 px-2 py-0.5 rounded-md text-xs mr-2">SEC</span>
                            {cls.section}
                          </p>
                        </div>
                        <div className="shrink-0 bg-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-xl border border-indigo-500/20 text-xs md:text-sm font-bold text-center">
                          {cls.time_start && (
                            <div className="mb-0.5 whitespace-nowrap">
                              {(() => {
                                const [sh, sm] = cls.time_start.split(':').map(Number);
                                const sp = sh >= 12 ? 'PM' : 'AM';
                                const sH = sh % 12 || 12;
                                return `${sH.toString().padStart(2, '0')}:${sm.toString().padStart(2, '0')} ${sp}`;
                              })()}
                            </div>
                          )}
                          <div className="text-indigo-400/50 text-[10px] leading-none mb-0.5">TO</div>
                          {cls.time_end && (
                            <div className="whitespace-nowrap">
                              {(() => {
                                const [eh, em] = cls.time_end.split(':').map(Number);
                                const ep = eh >= 12 ? 'PM' : 'AM';
                                const eH = eh % 12 || 12;
                                return `${eH.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')} ${ep}`;
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-white/5 group-hover:border-indigo-500/20 transition-colors">
                      <div className="flex items-center text-slate-300 font-medium">
                        <div className="bg-white/5 p-1.5 rounded-lg mr-3 group-hover:bg-indigo-500/20 group-hover:text-indigo-400 transition-colors">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <span className="text-[15px]">{cls.room}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Report Changes Section */}
            <div className="mt-12 bg-white/[0.03] backdrop-blur-md border border-white/10 p-6 md:p-8 rounded-3xl shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none"></div>
              <div className="flex items-start md:items-center gap-4 relative z-10">
                <div className="bg-indigo-500/20 p-3 rounded-2xl border border-indigo-500/30 shrink-0 shadow-inner">
                  <Megaphone className="w-6 h-6 md:w-8 md:h-8 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white tracking-tight">Notice a discrepancy?</h3>
                  <p className="text-sm font-medium text-slate-400 mt-1 max-w-md">
                    Report missing classes, unlisted rescheduled sections, or errors directly to Mussa Raza.
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 md:gap-4 w-full lg:w-auto relative z-10">
                <a
                  href="https://mail.google.com/mail/?view=cm&fs=1&to=i243022@isb.nu.edu.pk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/50 text-slate-200 px-5 py-3 md:py-2.5 rounded-xl text-sm font-bold transition-all min-h-[44px] shadow-sm"
                >
                  <svg className="w-4 h-4 mr-2 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                  Email
                </a>
                <a
                  href="https://wa.me/923191420404"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-400 px-5 py-3 md:py-2.5 rounded-xl text-sm font-bold transition-all min-h-[44px] shadow-sm"
                >
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.711.927 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.274.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564c.173.087.289.129.332.202.043.073.043.423-.101.827z"/></svg>
                  WhatsApp
                </a>
              </div>
            </div>

          </div>
        )}

        {/* About Section */}
        <div className="mt-8 bg-white/5 border border-white/10 p-6 md:p-8 rounded-3xl shadow-sm">
          <h2 className="text-xl font-bold text-white mb-4 tracking-tight">System Architecture</h2>
          <p className="text-slate-400 font-medium mb-6 leading-relaxed max-w-3xl">
            This system automates the extraction and parsing of class schedules directly from the official university Google Sheets. It tracks real-time timetable changes, caches them locally for offline access, and provides a sleek interface for students and faculty.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <a href="https://docs.google.com/spreadsheets/d/1vlTuotLw34fedME3gNQj09cZw-todVomxAiu5P1wZ6Q/edit" target="_blank" rel="noopener noreferrer" className="flex items-center p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 hover:border-indigo-500/30 transition-all group">
              <div className="bg-indigo-500/20 p-2 rounded-xl mr-3 group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
              </div>
              <span className="text-sm font-bold text-slate-300 group-hover:text-white transition-colors">Computing Dept</span>
            </a>
            <a href="https://docs.google.com/spreadsheets/d/1AnFQQhv9lu4grESE2ypbDG7E1QOPGgGCRiejem5ocPw/edit" target="_blank" rel="noopener noreferrer" className="flex items-center p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 hover:border-indigo-500/30 transition-all group">
              <div className="bg-indigo-500/20 p-2 rounded-xl mr-3 group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
              </div>
              <span className="text-sm font-bold text-slate-300 group-hover:text-white transition-colors">Management Dept</span>
            </a>
            <a href="https://docs.google.com/spreadsheets/d/1fL2TWhPgbPc2d66vm_KywTpdsGBIaBLqlmz4JLPudCw/edit" target="_blank" rel="noopener noreferrer" className="flex items-center p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 hover:border-indigo-500/30 transition-all group">
              <div className="bg-indigo-500/20 p-2 rounded-xl mr-3 group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
              </div>
              <span className="text-sm font-bold text-slate-300 group-hover:text-white transition-colors">Engineering Dept</span>
            </a>
          </div>
        </div>
      </main>

      {/* Reserved for future Faculty RAG Chatbot integration */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          className="bg-indigo-600 text-white w-14 h-14 rounded-full shadow-2xl shadow-indigo-500/40 hover:bg-indigo-500 hover:scale-105 hover:-translate-y-1 transition-all duration-300 flex items-center justify-center focus:outline-none ring-2 ring-transparent focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-slate-900"
          aria-label="Chatbot"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </button>
      </div>

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}
