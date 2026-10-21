"use client";

import { useEffect } from "react";
import { startAuthWatch } from "@/lib/portal/local-state";

/** Mount once per shell (portal, admin): clears device-local portal state on any sign-out. */
export default function AuthWatcher() {
  useEffect(() => {
    startAuthWatch();
  }, []);
  return null;
}
