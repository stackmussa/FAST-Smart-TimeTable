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
      // Check cache first
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
          header: false, // We will manually parse due to the complex structure
          skipEmptyLines: true,
          complete: (results) => {
            const rows = results.data as string[][];
            const parsedData: FacultyEntry[] = [];
            let currentDept = "Unknown Department";

            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              // Check if row is a department header
              if (row.length > 0 && row[0].trim().toLowerCase().startsWith('faculty department of')) {
                currentDept = row[0].trim().replace(/^Faculty\s+Department\s+of\s+/i, '').trim();
                continue;
              }
              
              // Skip general headers
              if (row[0] && row[0].toLowerCase().includes('faculty offices')) continue;
              if (row[0] && row[0].toLowerCase().includes('sr #')) continue;

              // Parse actual faculty rows
              let srNo = row[0] ? row[0].trim() : '';
              let name = row[1] ? row[1].trim() : '';
              let designation = row[2] ? row[2].trim() : '';
              let email = row[3] ? row[3].trim() : '';
              let office = row[4] ? row[4].trim() : '';

              // Handle edge case where name is in SrNo column and SrNo is empty (e.g., Dr. Hasan Mujtaba)
              if (srNo && !name && srNo.toLowerCase().includes('dr.')) {
                name = srNo;
                srNo = '';
              }

              if (name) {
                parsedData.push({
                  SrNo: srNo,
                  Name: name,
                  Designation: designation,
                  Email: email,
                  Office: office,
                  Department: currentDept
                });
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
    data.forEach(entry => {
      if (entry.Department) depts.add(entry.Department);
    });
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
    <div className="animate-fadeIn">
      <div className="bg-gray-800 border border-gray-700 p-6 rounded-2xl shadow-xl mb-8">
        <h2 className="text-xl font-bold text-white mb-4">Search Faculty Directory</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Keyword Search */}
          <div className="flex flex-col w-full">
            <label className="text-sm font-semibold text-gray-300 mb-2">Search Name or Office</label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. Dr. Hasan, C-201..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3.5 text-base text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-inner min-h-[44px]"
              />
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                <span className="text-gray-500 text-lg">🔍</span>
              </div>
            </div>
          </div>

          {/* Department Filter */}
          <div className="flex flex-col w-full">
            <label className="text-sm font-semibold text-gray-300 mb-2">Department</label>
            <div className="relative">
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3.5 text-base appearance-none text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer shadow-inner transition-all min-h-[44px]"
              >
                {departments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-400">
                <svg className="h-5 w-5 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                </svg>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Results */}
      <div>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-gray-800 rounded-xl p-5 border border-gray-700 animate-pulse h-36">
                <div className="h-4 bg-gray-700 rounded w-3/4 mb-4"></div>
                <div className="h-3 bg-gray-700 rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-gray-700 rounded w-full mb-2"></div>
                <div className="h-3 bg-gray-700 rounded w-1/3"></div>
              </div>
            ))}
          </div>
        ) : filteredData.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredData.map((faculty, idx) => (
              <div
                key={idx}
                className="bg-gray-800 rounded-xl p-5 border border-gray-700 shadow-sm hover:shadow-md hover:border-gray-600 transition-all group flex flex-col"
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
                    {faculty.Name}
                  </h3>
                  {faculty.Office && (
                    <span className="bg-gray-900 border border-gray-700 text-blue-400 text-xs font-mono px-2 py-1 rounded shadow-inner whitespace-nowrap ml-2">
                      {faculty.Office}
                    </span>
                  )}
                </div>
                
                <div className="flex-grow space-y-3">
                  {faculty.Designation && (
                    <p className="text-base text-gray-300 flex items-start">
                      <span className="mr-2 text-gray-500">🎓</span>
                      <span className="flex-1">{faculty.Designation}</span>
                    </p>
                  )}
                  {faculty.Department && faculty.Department !== "Unknown Department" && (
                    <p className="text-base text-gray-300 flex items-start">
                      <span className="mr-2 text-gray-500">🏢</span>
                      <span className="flex-1">{faculty.Department}</span>
                    </p>
                  )}
                  {faculty.Email && (
                    <p className="text-base text-gray-400 flex items-center mt-4 pt-3 border-t border-gray-700/50">
                      <span className="mr-2 text-gray-500">✉️</span>
                      <a 
                        href={`https://mail.google.com/mail/?view=cm&fs=1&to=${faculty.Email}`} 
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-blue-400 transition-colors truncate min-h-[44px] flex items-center"
                      >
                        {faculty.Email}
                      </a>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 bg-gray-800 rounded-2xl border border-gray-700">
            <span className="text-4xl mb-4 text-gray-500">🔍</span>
            <p className="text-gray-400 text-lg font-medium text-center">No faculty members found</p>
            <p className="text-gray-500 text-sm mt-2 text-center">Try adjusting your search keywords or department filter.</p>
          </div>
        )}
      </div>
    </div>
  );
}
