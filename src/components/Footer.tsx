export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-800 bg-slate-950 py-6 mt-auto">
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-600">
            © {currentYear} TokenPilot. All rights reserved.
          </div>
          <div className="text-xs text-slate-600 italic">
            See everything. Touch nothing. Save thousands.
          </div>
        </div>
      </div>
    </footer>
  );
}
