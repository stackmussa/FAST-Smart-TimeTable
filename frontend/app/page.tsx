"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Megaphone, Calendar, Users, Compass, CheckCircle2, Clock, Sun, Moon, Timer, X, Sparkles } from 'lucide-react';
import { useTheme } from 'next-themes';
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

  const { theme, setTheme } = useTheme();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [nextClass, setNextClass] = useState<any>(null);
  const [isNextClassModalOpen, setIsNextClassModalOpen] = useState(false);
  const [countdownText, setCountdownText] = useState("");
  const [mounted, setMounted] = useState(false);
  const [initialDaySet, setInitialDaySet] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const getNextClass = () => {
      if (!data.length || !selectedSchool || !selectedDepartment || !selectedBatch || !selectedSection) return null;

      const currentDayIdx = (currentTime.getDay() + 6) % 7; 
      const currentMins = currentTime.getHours() * 60 + currentTime.getMinutes();

      const filtered = data.filter((c: ClassEntry) => 
        c.school === selectedSchool && 
        c.department === selectedDepartment && 
        c.batch === selectedBatch && 
        c.section === selectedSection &&
        !c.is_cancelled &&
        (showRepeated ? true : !c.is_repeat)
      );

      if (filtered.length === 0) return null;

      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const searchDayIdx = (currentDayIdx + dayOffset) % 7;
        const searchDayName = dayOrder[searchDayIdx];
        
        const dayClasses = filtered.filter((c: ClassEntry) => c.day && c.day.startsWith(searchDayName));
        
        dayClasses.sort((a: ClassEntry, b: ClassEntry) => {
           if(!a.time_start || !b.time_start) return 0;
           const aMins = parseInt(a.time_start.split(':')[0]) * 60 + parseInt(a.time_start.split(':')[1]);
           const bMins = parseInt(b.time_start.split(':')[0]) * 60 + parseInt(b.time_start.split(':')[1]);
           return aMins - bMins;
        });

        for (const c of dayClasses) {
          if(!c.time_start) continue;
          const startMins = parseInt(c.time_start.split(':')[0]) * 60 + parseInt(c.time_start.split(':')[1]);
          
          if (dayOffset === 0) {
            if (currentMins <= startMins + 10) {
              return { ...c, dayOffset, startMins };
            }
          } else {
            return { ...c, dayOffset, startMins };
          }
        }
      }
      return null;
    };

    const nxt = getNextClass();
    setNextClass(nxt);
    
    // (removed initialDaySet logic from here)
    
    if (nxt) {
      const currentMins = currentTime.getHours() * 60 + currentTime.getMinutes();
      
      if (nxt.dayOffset === 0 && currentMins >= nxt.startMins && currentMins <= nxt.startMins + 10) {
        setCountdownText("Class Started (Ongoing)");
      } else {
        let targetDate = new Date(currentTime);
        targetDate.setDate(targetDate.getDate() + nxt.dayOffset);
        targetDate.setHours(Math.floor(nxt.startMins / 60), nxt.startMins % 60, 0, 0);
        
        const diffMs = targetDate.getTime() - currentTime.getTime();
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000);
        
        let text = "Next in: ";
        if (diffHrs > 0) text += `${diffHrs.toString().padStart(2, '0')}h `;
        text += `${diffMins.toString().padStart(2, '0')}m `;
        text += `${diffSecs.toString().padStart(2, '0')}s`;
        
        if (nxt.dayOffset > 0) {
           text = `Next: ${nxt.day} at ${nxt.time_start}`; 
        }
        setCountdownText(text);
      }
    } else {
      setCountdownText("");
    }
  }, [currentTime, data, selectedSchool, selectedDepartment, selectedBatch, selectedSection, mounted, showRepeated]);


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

    let p: any = null;
    if (cachedFilters) {
      try {
        p = JSON.parse(cachedFilters);
        if (p.selectedSchool) setSelectedSchool(p.selectedSchool);
        if (p.selectedDepartment) setSelectedDepartment(p.selectedDepartment);
        if (p.selectedBatch) setSelectedBatch(p.selectedBatch);
        if (p.selectedSection) setSelectedSection(p.selectedSection);
      } catch (e) {
        console.error("Failed to parse cached filters", e);
      }
    }

    // Wait for data to load before setting selectedDay to correctly match appended dates
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
    const interval = setInterval(fetchData, 600000); // Auto refresh every 10 minutes
    
    return () => clearInterval(interval);
  }, []);

  // Save filters to localStorage whenever they change
  useEffect(() => {
    // Only save if data is loaded to avoid overwriting with empty states during initial render
    if (data.length > 0) {
      const filters = {
        selectedSchool,
        selectedDepartment,
        selectedBatch,
        selectedSection,
        selectedDay
      };
      localStorage.setItem('timetable_filters', JSON.stringify(filters));
    }
  }, [selectedSchool, selectedDepartment, selectedBatch, selectedSection, selectedDay, data.length]);

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

  useEffect(() => {
    if (data.length === 0 || availableDays.length === 0) return;
    
    if (!initialDaySet) {
      const options: Intl.DateTimeFormatOptions = { weekday: 'long', timeZone: 'Asia/Karachi' };
      const pktDay = new Intl.DateTimeFormat('en-US', options).format(new Date());
      const targetDay = pktDay === 'Sunday' ? 'Monday' : pktDay;
      
      const matchedDay = availableDays.find(d => d.startsWith(targetDay));
      if (matchedDay) {
        setSelectedDay(matchedDay);
      } else {
        setSelectedDay(availableDays[0]);
      }
      setInitialDaySet(true);
    } else if (!availableDays.includes(selectedDay)) {
      setSelectedDay(availableDays[0]);
    }
  }, [availableDays, selectedDay, data.length, initialDaySet]);

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
    <div className="min-h-screen font-sans bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 overflow-x-hidden selection:bg-indigo-500/30">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                FAST-NUCES Islamabad
              </h1>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-1">
                Smart Schedule Viewer
              </p>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap self-start md:self-auto">

              {loading ? (
                <div className="flex items-center space-x-2 bg-indigo-100 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-lg shadow-sm">
                  <div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
                  <span className="text-xs font-semibold tracking-wide uppercase">Syncing...</span>
                </div>
              ) : (offlineMode || !isOnline) ? (
                <div className="flex items-center space-x-2 bg-amber-100 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-lg shadow-sm">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                  </span>
                  <span className="text-xs font-semibold tracking-wide uppercase">Device lost Connection</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center space-x-2 bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-lg shadow-sm dark:shadow-[0_0_12px_rgba(16,185,129,0.3)] animate-pulse">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs font-semibold tracking-wide uppercase">Live</span>
                  </div>
                  <div className="flex items-center space-x-2 bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-lg shadow-sm dark:shadow-[0_0_12px_rgba(16,185,129,0.3)] animate-pulse">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold tracking-wide uppercase">Sync: {formatTime(getSelectedSchoolTimestamp())}</span>
                  </div>
                </>
              )}

              {mounted && (
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="p-1.5 sm:p-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors border border-slate-300 dark:border-slate-700 shrink-0"
                  aria-label="Toggle Dark Mode"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
              )}

            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 pb-12">
        
        {/* Navigation Tabs */}
        <div className="flex bg-white dark:bg-slate-900/50 p-1 rounded-xl border border-slate-200 dark:border-white/5 w-full md:w-fit mb-5 shadow-sm">
          <button
            onClick={() => setActiveTab('timetable')}
            className={`flex items-center justify-center flex-1 md:flex-none px-6 py-2.5 rounded-lg font-medium text-sm transition-all duration-300 min-h-[40px] ${
              activeTab === 'timetable'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 hover:bg-slate-200 hover:dark:bg-white/5'
            }`}
          >
            <Calendar className="w-4 h-4 mr-2" />
            Timetable
          </button>
          <button
            onClick={() => setActiveTab('faculty')}
            className={`flex items-center justify-center flex-1 md:flex-none px-6 py-2.5 rounded-lg font-medium text-sm transition-all duration-300 min-h-[40px] ${
              activeTab === 'faculty'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 hover:bg-slate-200 hover:dark:bg-white/5'
            }`}
          >
            <Users className="w-4 h-4 mr-2" />
            Faculty
          </button>
        </div>

        <div key={activeTab} className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-forwards">
          {activeTab === 'faculty' ? (
            <FacultyFinder />
          ) : (
            <div>
              {/* Filters */}
              <div className="mb-5 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/5 p-3 rounded-2xl">
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  
                  {/* School */}
                  <div className="flex flex-col">
                    <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-500 dark:text-slate-400 ml-1">School</label>
                    <div className="relative">
                      <select
                        className="w-full h-[40px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-white/10 rounded-lg px-3 appearance-none text-sm font-medium text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                        value={selectedSchool}
                        onChange={(e) => setSelectedSchool(e.target.value)}
                        disabled={loading}
                      >
                        {availableSchools.map((s) => (
                          <option key={s} value={s} className="bg-white dark:bg-slate-900">{s}</option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-500 dark:text-slate-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>

                  {/* Department */}
                  <div className="flex flex-col">
                    <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-500 dark:text-slate-400 ml-1">Department</label>
                    <div className="relative">
                      <select
                        className="w-full h-[40px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-white/10 rounded-lg px-3 appearance-none text-sm font-medium text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all cursor-pointer disabled:opacity-50"
                        value={selectedDepartment}
                        onChange={(e) => setSelectedDepartment(e.target.value)}
                        disabled={loading || !availableDepartments.length}
                      >
                        {availableDepartments.length ? (
                          availableDepartments.map((d) => (
                            <option key={d} value={d} className="bg-white dark:bg-slate-900">{d}</option>
                          ))
                        ) : (
                          <option value="" className="bg-white dark:bg-slate-900">None</option>
                        )}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-500 dark:text-slate-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>

                  {/* Batch */}
                  <div className="flex flex-col">
                    <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-500 dark:text-slate-400 ml-1">Batch</label>
                    <div className="relative">
                      <select
                        className="w-full h-[40px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-white/10 rounded-lg px-3 appearance-none text-sm font-medium text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all cursor-pointer disabled:opacity-50"
                        value={selectedBatch}
                        onChange={(e) => setSelectedBatch(e.target.value)}
                        disabled={loading || !availableBatches.length}
                      >
                        {availableBatches.length ? (
                          availableBatches.map((b) => (
                            <option key={b} value={b} className="bg-white dark:bg-slate-900">{b}</option>
                          ))
                        ) : (
                          <option value="" className="bg-white dark:bg-slate-900">None</option>
                        )}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-500 dark:text-slate-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>

                  {/* Section */}
                  <div className="flex flex-col">
                    <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-500 dark:text-slate-400 ml-1">Section</label>
                    <div className="relative">
                      <select
                        className="w-full h-[40px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-white/10 rounded-lg px-3 appearance-none text-sm font-medium text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all cursor-pointer disabled:opacity-50"
                        value={selectedSection}
                        onChange={(e) => setSelectedSection(e.target.value)}
                        disabled={loading || !availableSections.length}
                      >
                        {availableSections.length ? availableSections.map((s) => (
                          <option key={s} value={s} className="bg-white dark:bg-slate-900">{s}</option>
                        )) : (
                          <option value="" className="bg-white dark:bg-slate-900">None</option>
                        )}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-500 dark:text-slate-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>

                  {/* Day */}
                  <div className="flex flex-col">
                    <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-500 dark:text-slate-400 ml-1">Day</label>
                    <div className="relative">
                      <select
                        className="w-full h-[40px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-white/10 rounded-lg px-3 appearance-none text-sm font-medium text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                        value={selectedDay}
                        onChange={(e) => setSelectedDay(e.target.value)}
                        disabled={loading}
                      >
                        {availableDays.map((d) => (
                          <option key={d} value={d} className="bg-white dark:bg-slate-900">{d}</option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-500 dark:text-slate-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>

                  {/* Repeated */}
                  <div className="flex flex-col">
                    <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-500 dark:text-slate-400 ml-1">Repeated</label>
                    <button
                      onClick={() => setShowRepeated(!showRepeated)}
                      disabled={loading}
                      className={`h-[40px] rounded-lg font-medium text-sm transition-all focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-50 flex items-center justify-center ${showRepeated
                        ? 'bg-indigo-600 text-slate-900 dark:text-white border-transparent'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-white/10 hover:bg-white dark:bg-slate-900'
                        }`}
                    >
                      {showRepeated ? 'Show: ON' : 'Show: OFF'}
                    </button>
                  </div>

                </div>
              </div>

              {/* Results Header */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 px-1 gap-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2 md:mb-0">
                  {selectedDay}'s Classes
                </h2>
                {nextClass && (
                  <button 
                    onClick={() => setIsNextClassModalOpen(true)}
                    className="flex items-center text-indigo-600 dark:text-indigo-400 text-sm bg-indigo-100 dark:bg-indigo-500/10 px-4 py-2 rounded-xl border border-indigo-200 dark:border-indigo-500/20 shadow-sm dark:shadow-[0_0_15px_rgba(99,102,241,0.2)] hover:bg-indigo-200 dark:hover:bg-indigo-500/20 transition-all active:scale-95 w-full md:w-auto justify-center min-h-[44px]"
                  >
                    <Timer className="w-4 h-4 mr-2 shrink-0" />
                    <span className="font-bold tracking-wide">{countdownText}</span>
                  </button>
                )}
              </div>

              {/* Results Grid */}
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="bg-white dark:bg-slate-900/50 rounded-xl p-5 border border-slate-200 dark:border-white/5 relative overflow-hidden">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                      <div className="flex justify-between items-start mb-5">
                        <div className="space-y-2 w-2/3">
                          <div className="h-5 bg-slate-200 dark:bg-white/5 rounded w-full"></div>
                          <div className="h-4 bg-slate-200 dark:bg-white/5 rounded w-1/2"></div>
                        </div>
                        <div className="h-6 w-16 bg-slate-200 dark:bg-white/5 rounded"></div>
                      </div>
                      <div className="pt-3 border-t border-slate-200 dark:border-white/5">
                        <div className="h-4 bg-slate-200 dark:bg-white/5 rounded w-1/3"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (!selectedSchool || !selectedDepartment || !selectedBatch || !selectedSection || !selectedDay) ? (
                <div className="flex flex-col items-center justify-center h-48 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-slate-200 dark:border-white/5 p-6 text-center">
                  <Compass className="w-12 h-12 text-slate-600 mb-3" />
                  <p className="text-lg font-medium text-slate-600 dark:text-slate-400">Select your criteria above to view classes.</p>
                </div>
              ) : filteredClasses.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-slate-200 dark:border-white/5 p-6 text-center">
                  <CheckCircle2 className="w-12 h-12 text-slate-600 mb-3" />
                  <p className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-1">No Classes Today!</p>
                  <p className="text-slate-500 dark:text-slate-400 font-medium">Enjoy your free time.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredClasses.map((cls, idx) => (
                    <div key={cls.id || idx} className="bg-white dark:bg-slate-900/50 rounded-xl p-5 border border-slate-200 dark:border-white/5 hover:border-indigo-500/30 transition-all duration-200 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-3 gap-4">
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              {cls.is_cancelled && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.4)] animate-pulse uppercase tracking-widest">
                                  Cancelled
                                </span>
                              )}
                              {cls.is_rescheduled && !cls.is_cancelled && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-[0_0_10px_rgba(249,115,22,0.4)] animate-pulse uppercase tracking-widest">
                                  Rescheduled
                                </span>
                              )}
                              {cls.is_repeat && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.4)] animate-pulse uppercase tracking-widest">
                                  Repeated
                                </span>
                              )}
                            </div>
                            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">
                              {cls.course_name}
                            </h3>
                          </div>
                          <div className="shrink-0 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 px-2.5 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-500/20 shadow-[0_0_15px_rgba(79,70,229,0.3)] dark:shadow-[0_0_15px_rgba(99,102,241,0.25)] text-xs font-semibold text-center">
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
                            <div className="text-indigo-500/70 dark:text-indigo-400/50 text-[10px] leading-none mb-0.5">TO</div>
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

                      <div className="pt-3 mt-3 border-t border-slate-200 dark:border-white/5 flex flex-col gap-2">
                        <div className="flex items-center text-slate-600 dark:text-slate-400 font-medium text-sm">
                          <svg className="w-4 h-4 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          <span className="truncate">{cls.room}</span>
                        </div>
                        {cls.school === 'School of Engineering' && cls.instructor && (
                          <div className="flex items-center text-slate-600 dark:text-slate-400 font-medium text-sm">
                            <Users className="w-4 h-4 mr-2 shrink-0" />
                            <span className="truncate">{cls.instructor}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Report Changes Section */}
              <div className="mt-10 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/5 p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-start md:items-center gap-4">
                  <div className="bg-slate-100 dark:bg-slate-800 p-2.5 rounded-xl shrink-0">
                    <Megaphone className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Notice a discrepancy?</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 max-w-md">
                      Report missing classes, unlisted rescheduled sections, or errors to Mussa Raza.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                  <a
                    href="https://mail.google.com/mail/?view=cm&fs=1&to=i243022@isb.nu.edu.pk"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 px-4 py-2 rounded-lg text-sm font-medium transition-all border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.3)] animate-pulse min-h-[40px]"
                  >
                    <svg className="w-4 h-4 mr-2 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                    Email
                  </a>
                  <a
                    href="https://wa.me/923191420404"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-4 py-2 rounded-lg text-sm font-medium transition-all border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.3)] animate-pulse min-h-[40px]"
                  >
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 448 512"><path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/></svg>
                    WhatsApp
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* About Section */}
        <div className="mt-8 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/5 p-6 rounded-2xl">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-3">System Architecture</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm mb-5 leading-relaxed max-w-3xl">
            This system automates the extraction and parsing of class schedules directly from the official university Google Sheets. It tracks real-time timetable changes, caches them locally for offline access, and provides a sleek interface for students and faculty.
            <br/><br/>
            <strong>Note:</strong> It is recommended to refer to the original timetable using the links below for official verification.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <a href="https://docs.google.com/spreadsheets/d/1vlTuotLw34fedME3gNQj09cZw-todVomxAiu5P1wZ6Q/edit" target="_blank" rel="noopener noreferrer" className="flex items-center p-3 bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-white/5 transition-colors">
              <div className="bg-slate-200 dark:bg-slate-700 p-1.5 rounded-lg mr-3">
                <svg className="w-4 h-4 text-slate-700 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
              </div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Computing Dept</span>
            </a>
            <a href="https://docs.google.com/spreadsheets/d/1AnFQQhv9lu4grESE2ypbDG7E1QOPGgGCRiejem5ocPw/edit" target="_blank" rel="noopener noreferrer" className="flex items-center p-3 bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-white/5 transition-colors">
              <div className="bg-slate-200 dark:bg-slate-700 p-1.5 rounded-lg mr-3">
                <svg className="w-4 h-4 text-slate-700 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
              </div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Management Dept</span>
            </a>
            <a href="https://docs.google.com/spreadsheets/d/1fL2TWhPgbPc2d66vm_KywTpdsGBIaBLqlmz4JLPudCw/edit" target="_blank" rel="noopener noreferrer" className="flex items-center p-3 bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-white/5 transition-colors">
              <div className="bg-slate-200 dark:bg-slate-700 p-1.5 rounded-lg mr-3">
                <svg className="w-4 h-4 text-slate-700 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
              </div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Engineering Dept</span>
            </a>
          </div>
        </div>
      </main>

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
    
      {/* Next Class Modal Drawer */}
      {isNextClassModalOpen && nextClass && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsNextClassModalOpen(false)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <button onClick={() => setIsNextClassModalOpen(false)} className="absolute top-4 right-4 p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center flex-wrap gap-2">
              Upcoming Class
              {nextClass.is_rescheduled && !nextClass.is_cancelled && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-[0_0_10px_rgba(249,115,22,0.4)] animate-pulse uppercase tracking-widest">
                  Rescheduled
                </span>
              )}
              {nextClass.is_repeat && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.4)] animate-pulse uppercase tracking-widest">
                  Repeated
                </span>
              )}
            </h3>
            
            <div className="space-y-4">
              <div>
                 <div className="flex flex-wrap gap-2 mb-2">
                     <span className="text-xs font-bold bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 px-2 py-0.5 rounded uppercase tracking-wider">{nextClass.day}</span>
                     {nextClass.is_rescheduled && <span className="text-xs font-bold bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-300 px-2 py-0.5 rounded uppercase tracking-wider">Rescheduled</span>}
                 </div>
                 <h4 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{nextClass.course_name}</h4>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-white/5">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold mb-1 tracking-wider">Time</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                         {nextClass.time_start} - {nextClass.time_end}
                      </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-white/5">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold mb-1 tracking-wider">Room</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{nextClass.room}</p>
                  </div>
              </div>
            </div>
          </div>
        </div>
      )}
</div>
  );
}
