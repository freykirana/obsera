import { NextRequest, NextResponse } from "next/server"

import { backendFetch } from "@/lib/backend-api"

export async function POST(request: NextRequest) {
  try {
    await backendFetch({
      path: "/api/auth/logout",
      method: "POST",
      headers: {
        Authorization: `Bearer ${request.cookies.get("auth-token")?.value || ""}`,
      },
    })
  } catch (error) {
    console.error("Logout proxy error:", error)
  }

  const response = NextResponse.json({
    ok: true,
    message: "Logout successful",
  })

  // Clear auth cookie
  response.cookies.set({
    name: "auth-token",
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  })

  return response
}

