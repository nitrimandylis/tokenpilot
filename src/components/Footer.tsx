export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-ink-border bg-ink py-6 mt-auto">
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-xs text-bone-subtle">
            © {currentYear} TokenPilot
          </div>
          <div className="text-xs text-bone-subtle italic">
            See everything. Touch nothing. Save thousands.
          </div>
        </div>
      </div>
    </footer>
  );
}
