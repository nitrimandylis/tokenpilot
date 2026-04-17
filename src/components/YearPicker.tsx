"use client";

interface YearPickerProps {
  currentYear: number;
  onSelect: (year: number) => void;
  onClose: () => void;
}

export default function YearPicker({
  currentYear,
  onSelect,
  onClose,
}: YearPickerProps) {
  const now = new Date();
  const currentYearNow = now.getFullYear();

  // Generate year range (10 years back to current year)
  const startYear = currentYearNow - 10;
  const endYear = currentYearNow;
  const years = Array.from(
    { length: endYear - startYear + 1 },
    (_, i) => startYear + i
  ).reverse();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-5 max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-200 mb-4">
          Select Year
        </h3>

        {/* Year grid */}
        <div className="grid grid-cols-3 gap-2 max-h-96 overflow-y-auto">
          {years.map((year) => {
            const isSelected = year === currentYear;
            const isCurrent = year === currentYearNow;
            const isFuture = year > currentYearNow;

            return (
              <button
                key={year}
                onClick={() => {
                  if (!isFuture) {
                    onSelect(year);
                    onClose();
                  }
                }}
                disabled={isFuture}
                className={`
                  px-4 py-3 rounded-lg text-sm font-medium transition-all
                  ${isFuture ? "text-slate-700 cursor-not-allowed" : "cursor-pointer"}
                  ${isSelected ? "bg-emerald-500 text-slate-950 font-semibold" : ""}
                  ${!isSelected && !isFuture ? "text-slate-300 hover:bg-slate-800 hover:text-slate-100" : ""}
                  ${isCurrent && !isSelected ? "ring-1 ring-emerald-500/50" : ""}
                `}
              >
                {year}
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
