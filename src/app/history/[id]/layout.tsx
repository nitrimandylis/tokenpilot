"use client";

import { useRouter, useSearchParams, useParams } from "next/navigation";
import { storage, Vendor } from "@/lib/storage";
import { useEffect, useState, Suspense } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

function HistoryLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const id = params.id as string;

  const [mounted, setMounted] = useState(false);
  const [analysis, setAnalysis] = useState(storage.getAnalysis(id));

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load analysis from storage (reload when URL params change in case storage was updated)
  useEffect(() => {
    if (mounted) {
      const data = storage.getAnalysis(id);
      if (!data) {
        // No analysis found, redirect to home
        router.push("/");
      } else {
        setAnalysis(data);
      }
    }
  }, [mounted, id, router, searchParams]);

  if (!mounted || !analysis) {
    return null; // Prevent hydration mismatch
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <Header currentPage="analysis" vendor={analysis.vendor} />

      <main className="flex-1 max-w-5xl mx-auto px-6 py-10 w-full">
        {children}
      </main>

      <Footer />
    </div>
  );
}

export default function HistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <HistoryLayoutContent>{children}</HistoryLayoutContent>
    </Suspense>
  );
}
