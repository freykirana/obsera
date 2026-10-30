import { NextRequest, NextResponse } from "next/server"

import { backendFetch } from "@/lib/backend-api"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const backendResponse = await backendFetch({
      path: "/api/auth/signup",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const data = await backendResponse.json()

    return NextResponse.json(data, { status: backendResponse.status })
  } catch (error) {
    console.error("Signup proxy error:", error)
    return NextResponse.json(
      { ok: false, message: "Internal server error" },
      { status: 500 }
    )
  }
}
