"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { apiUrl } from "@/lib/api";

interface UserProfile {
  user_id: string;
  display_name: string;
  email: string;
  role: string;
}

interface UserContextType {
  user: UserProfile | null;
  token: string | null;
  login: (token: string, profile: UserProfile) => void;
  logout: () => void;
  isLoading: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Try to load token from localStorage on mount; state is only set once the profile check resolves
    const storedToken = localStorage.getItem("obsera_token");

    const restoreSession = async () => {
      if (!storedToken) return;
      try {
        const res = await fetch(apiUrl("/api/auth/me"), {
          headers: {
            "Authorization": `Bearer ${storedToken}`
          }
        });
        const data = await res.json();
        if (data.ok) {
          setToken(storedToken);
          setUser(data.data);
        } else {
          // Token invalid or expired
          localStorage.removeItem("obsera_token");
        }
      } catch (err) {
        console.error("Failed to fetch user profile", err);
      }
    };

    restoreSession().finally(() => setIsLoading(false));
  }, []);

  const login = (newToken: string, profile: UserProfile) => {
    localStorage.setItem("obsera_token", newToken);
    setToken(newToken);
    setUser(profile);
  };

  const logout = async () => {
    if (token) {
      try {
        await fetch(apiUrl("/api/auth/logout"), {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
      } catch (err) {
        console.error("Logout API failed", err);
      }
    }
    localStorage.removeItem("obsera_token");
    setToken(null);
    setUser(null);
  };

  return (
    <UserContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
