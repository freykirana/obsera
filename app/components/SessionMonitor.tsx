"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiUrl, fetchApi } from "@/lib/api";

export default function SessionMonitor() {
  const router = useRouter();
  const [timeoutMinutes, setTimeoutMinutes] = useState(30); // Default fallback
  // Set on mount (not during render) so render stays pure
  const lastActivityRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch timeout settings from the backend
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetchApi(apiUrl("/api/settings"));
        if (res.ok) {
          const json = await res.json();
          if (json.data && json.data.session_timeout_minutes) {
            setTimeoutMinutes(json.data.session_timeout_minutes);
          }
        }
      } catch (err) {
        console.error("Failed to fetch session settings", err);
      }
    };
    fetchSettings();
  }, []);

  const handleLogout = useCallback(() => {
    console.log("Session expired due to inactivity. Logging out...");
    localStorage.removeItem("obsera_token");
    // Also dispatch an event in case other components are listening for auth state
    window.dispatchEvent(new Event("auth_changed"));
    router.push("/login");
  }, [router]);

  useEffect(() => {
    const events = ["mousemove", "keydown", "click", "scroll"];

    if (lastActivityRef.current === 0) {
      lastActivityRef.current = Date.now();
    }

    const resetTimer = () => {
      lastActivityRef.current = Date.now();
    };

    events.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    // Check inactivity every 10 seconds
    timerRef.current = setInterval(() => {
      const now = Date.now();
      const diffMs = now - lastActivityRef.current;
      const diffMins = diffMs / 60000;

      if (diffMins >= timeoutMinutes) {
        if (timerRef.current) clearInterval(timerRef.current);
        handleLogout();
      }
    }, 10000);

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeoutMinutes, handleLogout]);

  return null; // Invisible component
}
