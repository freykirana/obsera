import { NextRequest, NextResponse } from "next/server"

export function middleware(request: NextRequest) {
  // Sementara menonaktifkan redirect auth karena halaman sign-in dan dashboard lama sudah dihapus
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icon.svg|apple-icon.png|brand/).*)",
  ],
}
