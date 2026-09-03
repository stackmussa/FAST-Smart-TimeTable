"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';

type FacultyEntry = {
  SrNo: string;
  Name: string;
  Designation: string;
  Email: string;
  Office: string;
  Department: string;
};

export default function FacultyFinder() {
  const [data, setData] = useState<FacultyEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All Departments');

  useEffect(() => {
    const fetchData = async () => {
      const cached = localStorage.getItem('faculty_data');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setData(parsed);
            setLoading(false);
          }
        } catch (e) {
          console.error("Failed to parse cached faculty data", e);
        }
      }

      try {
        const isProd = process.env.NODE_ENV === 'production';
        const basePath = isProd ? '/FAST-Smart-TimeTable' : '';
        const response = await fetch(`${basePath}/Faculty Offices-School of Computing.xlsx - Directory_2.csv`);
        const csvText = await response.text();
        
        Papa.parse(csvText, {
          header: false,
          skipEmptyLines: true,
          complete: (results) => {
            const rows = results.data as string[][];
            const parsedData: FacultyEntry[] = [];
            let currentDept = "Unknown Department";

            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              if (row.length > 0 && row[0].trim().toLowerCase().startsWith('faculty department of')) {
                currentDept = row[0].trim().replace(/^Faculty\s+Department\s+of\s+/i, '').trim();
                continue;
              }
              if (row[0] && row[0].toLowerCase().includes('faculty offices')) continue;
              if (row[0] && row[0].toLowerCase().includes('sr #')) continue;

              let srNo = row[0] ? row[0].trim() : '';
              let name = row[1] ? row[1].trim() : '';
              let designation = row[2] ? row[2].trim() : '';
              let email = row[3] ? row[3].trim() : '';
              let office = row[4] ? row[4].trim() : '';

              if (srNo && !name && srNo.toLowerCase().includes('dr.')) {
                name = srNo;
                srNo = '';
              }

              if (name) {
                parsedData.push({ SrNo: srNo, Name: name, Designation: designation, Email: email, Office: office, Department: currentDept });
              }
            }

            if (parsedData.length > 0) {
              setData(parsedData);
              localStorage.setItem('faculty_data', JSON.stringify(parsedData));
            }
            setLoading(false);
          },
          error: (error: any) => {
            console.error("CSV Parse Error", error);
            setLoading(false);
          }
        });
      } catch (err) {
        console.error("Failed to fetch faculty CSV", err);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const departments = useMemo(() => {
    const depts = new Set<string>();
    data.forEach(entry => { if (entry.Department) depts.add(entry.Department); });
    return ['All Departments', ...Array.from(depts).sort()];
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter(entry => {
      const matchDept = selectedDepartment === 'All Departments' || entry.Department === selectedDepartment;
      const query = searchQuery.toLowerCase();
      const matchSearch =
        entry.Name.toLowerCase().includes(query) ||
        entry.Designation.toLowerCase().includes(query) ||
        entry.Office.toLowerCase().includes(query) ||
        entry.Email.toLowerCase().includes(query);
      return matchDept && matchSearch;
    });
  }, [data, selectedDepartment, searchQuery]);

  return (
    <div>
      {/* Search filters — match the timetable filter bar style */}
      <div className="mb-6 bg-slate-900/40 border border-white/5 p-4 rounded-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Search */}
          <div className="flex flex-col">
            <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-500 ml-1">Search</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Name, designation, office..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-[40px] bg-slate-950 border border-white/10 rounded-lg px-3 pr-10 text-sm text-slate-200 placeholder-slate-600 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              />
              <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Department */}
          <div className="flex flex-col">
            <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-500 ml-1">Department</label>
            <div className="relative">
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full h-[40px] bg-slate-950 border border-white/10 rounded-lg px-3 appearance-none text-sm font-medium text-slate-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all cursor-pointer"
              >
                {departments.map((dept) => (
                  <option key={dept} value={dept} className="bg-slate-900">{dept}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-slate-900/50 rounded-xl p-5 border border-white/5 relative overflow-hidden">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
              <div className="flex justify-between items-start mb-4">
                <div className="space-y-2 w-2/3">
                  <div className="h-5 bg-white/5 rounded w-full"></div>
                  <div className="h-4 bg-white/5 rounded w-1/2"></div>
                </div>
                <div className="h-6 w-14 bg-white/5 rounded"></div>
              </div>
              <div className="pt-3 border-t border-white/5 space-y-2">
                <div className="h-4 bg-white/5 rounded w-3/4"></div>
                <div className="h-4 bg-white/5 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredData.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredData.map((faculty, idx) => (
            <div
              key={idx}
              className="bg-slate-900/50 rounded-xl p-5 border border-white/5 hover:border-indigo-500/30 transition-all duration-200 flex flex-col justify-between"
            >
              {/* Top: name + office badge */}
              <div>
                <div className="flex justify-between items-start mb-3 gap-3">
                  <h3 className="text-base font-bold text-slate-100 leading-tight">{faculty.Name}</h3>
                  {faculty.Office && (
                    <span className="shrink-0 bg-indigo-500/10 text-indigo-300 px-2.5 py-1 rounded-lg border border-indigo-500/20 shadow-[0_0_12px_rgba(99,102,241,0.2)] text-xs font-semibold whitespace-nowrap">
                      {faculty.Office}
                    </span>
                  )}
                </div>

                {/* Designation & Department */}
                <div className="space-y-1.5 mb-3">
                  {faculty.Designation && (
                    <p className="text-sm text-slate-400 flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-slate-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                      </svg>
                      {faculty.Designation}
                    </p>
                  )}
                  {faculty.Department && faculty.Department !== "Unknown Department" && (
                    <p className="text-sm text-slate-400 flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-slate-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                      </svg>
                      {faculty.Department}
                    </p>
                  )}
                </div>
              </div>

              {/* Bottom: email link */}
              {faculty.Email && (
                <div className="pt-3 mt-3 border-t border-white/5">
                  <a
                    href={`https://mail.google.com/mail/?view=cm&fs=1&to=${faculty.Email}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
                  >
                    <svg className="w-4 h-4 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="truncate">{faculty.Email}</span>
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 bg-slate-900/30 rounded-2xl border border-white/5 p-6 text-center">
          <svg className="w-10 h-10 text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-lg font-bold text-slate-300 mb-1">No faculty found</p>
          <p className="text-slate-500 text-sm">Try adjusting your search or department filter.</p>
        </div>
      )}
    </div>
  );
}
