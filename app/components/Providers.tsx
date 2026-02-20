"use client";

import { AlertProvider } from "./AlertDialog";
import { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AlertProvider>
      {children}
    </AlertProvider>
  );
}
