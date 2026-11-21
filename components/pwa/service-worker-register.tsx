"use client";

import { useEffect } from "react";
import { shouldRegisterServiceWorker } from "@/lib/push/client";

/**
 * Registers /sw.js once in production (or in development when NEXT_PUBLIC_ENABLE_SW_DEV=1).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      !shouldRegisterServiceWorker({
        nodeEnv: process.env.NODE_ENV,
        enableDevSw: process.env.NEXT_PUBLIC_ENABLE_SW_DEV,
      })
    ) {
      return;
    }
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Non-fatal: SW registration may be blocked in private/insecure contexts.
      });
  }, []);

  return null;
}
