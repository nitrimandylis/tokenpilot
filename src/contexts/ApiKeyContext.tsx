"use client";

import { createContext, useContext, ReactNode } from "react";
import { Vendor } from "@/lib/storage";

interface ApiKeyContextType {
  getKey: (vendor: Vendor) => string | null;
  setKey: (vendor: Vendor, key: string) => void;
  clearKey: (vendor: Vendor) => void;
  clearAllKeys: () => void;
}

const ApiKeyContext = createContext<ApiKeyContextType | undefined>(undefined);

const STORAGE_PREFIX = "tokenpilot_key_";

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const getKey = (vendor: Vendor): string | null => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(STORAGE_PREFIX + vendor) || null;
  };

  const setKeyForVendor = (vendor: Vendor, key: string) => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(STORAGE_PREFIX + vendor, key);
  };

  const clearKey = (vendor: Vendor) => {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(STORAGE_PREFIX + vendor);
  };

  const clearAllKeys = () => {
    if (typeof window === "undefined") return;
    Object.values(Vendor).forEach((vendor) => {
      sessionStorage.removeItem(STORAGE_PREFIX + vendor);
    });
  };

  return (
    <ApiKeyContext.Provider
      value={{ getKey, setKey: setKeyForVendor, clearKey, clearAllKeys }}
    >
      {children}
    </ApiKeyContext.Provider>
  );
}

export function useApiKey() {
  const context = useContext(ApiKeyContext);
  if (!context) {
    throw new Error("useApiKey must be used within ApiKeyProvider");
  }
  return context;
}
