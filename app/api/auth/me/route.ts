import { NextRequest, NextResponse } from "next/server"

import { backendFetch } from "@/lib/backend-api"

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value

    if (!token) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })
    }

    const backendResponse = await backendFetch({
      path: "/api/auth/me",
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    const data = await backendResponse.json()
    return NextResponse.json(data, { status: backendResponse.status })
  } catch (error) {
    console.error("Me proxy error:", error)
    return NextResponse.json({ ok: false, message: "Internal server error" }, { status: 500 })
  }
}
