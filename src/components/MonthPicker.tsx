"use client";

import { useState } from "react";

interface MonthPickerProps {
  currentYear: number;
  currentMonth: number;
  onSelect: (year: number, month: number) => void;
  onClose: () => void;
}

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function MonthPicker({
  currentYear,
  currentMonth,
  onSelect,
  onClose,
}: MonthPickerProps) {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const now = new Date();
  const currentYearNow = now.getFullYear();
  const currentMonthNow = now.getMonth();

  // Generate year range (5 years back, current year, and future years up to current)
  const startYear = currentYearNow - 5;
  const endYear = currentYearNow;
  const years = Array.from(
    { length: endYear - startYear + 1 },
    (_, i) => startYear + i
  ).reverse();

  const isMonthDisabled = (year: number, month: number) => {
    // Disable future months
    if (year > currentYearNow) return true;
    if (year === currentYearNow && month > currentMonthNow) return true;
    return false;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-5 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Year selector */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() =>
              setSelectedYear(Math.max(selectedYear - 1, startYear))
            }
            disabled={selectedYear <= startYear}
            className="p-2 text-slate-400 hover:text-slate-200 disabled:text-slate-700 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <span className="text-lg font-semibold text-slate-200">
            {selectedYear}
          </span>
          <button
            onClick={() => setSelectedYear(Math.min(selectedYear + 1, endYear))}
            disabled={selectedYear >= endYear}
            className="p-2 text-slate-400 hover:text-slate-200 disabled:text-slate-700 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>

        {/* Month grid */}
        <div className="grid grid-cols-3 gap-2">
          {monthNames.map((name, month) => {
            const disabled = isMonthDisabled(selectedYear, month);
            const isSelected =
              selectedYear === currentYear && month === currentMonth;
            const isCurrent =
              selectedYear === currentYearNow && month === currentMonthNow;

            return (
              <button
                key={month}
                onClick={() => {
                  if (!disabled) {
                    onSelect(selectedYear, month);
                    onClose();
                  }
                }}
                disabled={disabled}
                className={`
                  px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                  ${disabled ? "text-slate-700 cursor-not-allowed" : "cursor-pointer"}
                  ${isSelected ? "bg-emerald-500 text-slate-950 font-semibold" : ""}
                  ${!isSelected && !disabled ? "text-slate-300 hover:bg-slate-800 hover:text-slate-100" : ""}
                  ${isCurrent && !isSelected ? "ring-1 ring-emerald-500/50" : ""}
                `}
              >
                {name.substring(0, 3)}
              </button>
            );
          })}
        </div>

        {/* Close button */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
