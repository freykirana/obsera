import { NextRequest, NextResponse } from "next/server"

import { backendFetch } from "@/lib/backend-api"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const backendResponse = await backendFetch({
      path: "/api/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const data = await backendResponse.json()

    if (!backendResponse.ok) {
      return NextResponse.json(data, { status: backendResponse.status })
    }

    const response = NextResponse.json({
      ok: true,
      message: data.message ?? "Login successful",
      token: data.token,
      name: data.user?.name ?? data.name,
      email: data.user?.email ?? data.email,
      user: data.user,
    })

    response.cookies.set({
      name: "auth-token",
      value: data.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60,
      path: "/",
    })

    return response
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json(
      { ok: false, message: "Internal server error" },
      { status: 500 }
    )
  }
}
