/**
 * Storage helpers for analysis history
 * Uses localStorage for persistent history across sessions
 * Each analysis is stored with a unique ULID
 */

import { ulid } from "ulid";
import type { Report, RawAPIData } from "@/types";

export enum Vendor {
  ANTHROPIC = "anthropic",
  OPENAI = "openai",
}

export interface MonthData {
  year: number;
  month: number;
  report: Report;
  rawData: RawAPIData;
  timestamp: string; // When this month was fetched
}

export interface AnalysisRecord {
  id: string; // ULID
  vendor: Vendor; // AI provider
  orgName: string;
  orgId: string;
  createdAt: string; // ISO timestamp when first created
  // Store multiple months under this analysis session
  months: {
    [key: string]: MonthData; // key format: "YYYY-MM"
  };
}

interface StoredHistory {
  [id: string]: AnalysisRecord;
}

const HISTORY_STORAGE_KEY = "tokenpilot_history";

/**
 * Generate a new ULID (lexicographically sortable, timestamp-based)
 */
export function generateId(): string {
  return ulid();
}

/**
 * Generate a deterministic ID based on vendor, org, year, and month
 * Format: vendor-orgId-YYYY-MM
 * This ensures one analysis per vendor/org/month combination
 */
export function generateMonthId(
  vendor: Vendor,
  orgId: string,
  year: number,
  month: number
): string {
  const paddedMonth = String(month).padStart(2, "0");
  const sanitizedOrgId = orgId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 20);
  return `${vendor}-${sanitizedOrgId}-${year}-${paddedMonth}`;
}

/**
 * Get all analysis records from localStorage
 */
function getHistory(): StoredHistory {
  if (typeof window === "undefined") return {};
  try {
    const data = localStorage.getItem(HISTORY_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    console.warn("Failed to load history:", e);
    return {};
  }
}

/**
 * Save history to localStorage
 */
function saveHistory(history: StoredHistory): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    console.error("Failed to save history:", e);
  }
}

export const storage = {
  /**
   * Save or update an analysis record with month data
   */
  saveAnalysis(
    id: string,
    vendor: Vendor,
    year: number,
    month: number,
    orgName: string,
    orgId: string,
    report: Report,
    rawData: RawAPIData
  ): void {
    const history = getHistory();
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;

    if (!history[id]) {
      // Create new analysis record
      history[id] = {
        id,
        vendor,
        orgName,
        orgId,
        createdAt: new Date().toISOString(),
        months: {},
      };
    } else {
      // Update orgName and orgId if we have better values
      if (orgName && orgName !== "Organization") {
        history[id].orgName = orgName;
      }
      if (orgId) {
        history[id].orgId = orgId;
      }
    }

    // Add or update this month's data
    history[id].months[monthKey] = {
      year,
      month,
      report,
      rawData,
      timestamp: new Date().toISOString(),
    };

    saveHistory(history);
  },

  /**
   * Get a specific analysis by UUID
   */
  getAnalysis(id: string): AnalysisRecord | null {
    const history = getHistory();
    return history[id] || null;
  },

  /**
   * Get month data for a specific analysis and month
   */
  getMonthData(id: string, year: number, month: number): MonthData | null {
    const analysis = this.getAnalysis(id);
    if (!analysis) return null;

    const monthKey = `${year}-${String(month).padStart(2, "0")}`;
    return analysis.months[monthKey] || null;
  },

  /**
   * Check if month data exists for an analysis
   */
  hasMonthData(id: string, year: number, month: number): boolean {
    return this.getMonthData(id, year, month) !== null;
  },

  /**
   * Get all analyses sorted by creation time (newest first)
   */
  getAllAnalyses(): AnalysisRecord[] {
    const history = getHistory();
    return Object.values(history).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  /**
   * Delete a specific analysis
   */
  deleteAnalysis(id: string): void {
    const history = getHistory();
    delete history[id];
    saveHistory(history);
  },

  /**
   * Clear month data for a specific analysis and month
   * Forces re-fetch on next load
   */
  clearMonthData(id: string, year: number, month: number): void {
    const history = getHistory();
    const analysis = history[id];
    if (!analysis) {
      console.log(`[Storage] No analysis found for id: ${id}`);
      return;
    }

    const monthKey = `${year}-${String(month).padStart(2, "0")}`;
    console.log(
      `[Storage] Deleting month data: ${monthKey} from analysis ${id}`
    );
    delete analysis.months[monthKey];
    saveHistory(history);
    console.log(`[Storage] Month data cleared successfully`);
  },

  /**
   * Clear all history
   */
  clearAll(): void {
    if (typeof window !== "undefined") {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    }
  },
};
