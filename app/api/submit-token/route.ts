import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, network, timestamp } = body

    // Validate input (basic validation, more comprehensive validation is on backend)
    if (!token || !network) {
      return NextResponse.json({ success: false, message: "Token and network are required" }, { status: 400 })
    }

    // Forward to your Node.js backend API
    const backendResponse = await fetch("http://localhost:3001/api/tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token, network, timestamp }),
    })

    const backendData = await backendResponse.json()

    if (backendResponse.ok) {
      const { data, message, queued } = backendData

      if (queued) {
        // If the backend indicates the job is queued, pass that status directly
        return NextResponse.json({ success: true, message, queued }, { status: 202 })
      }

      if (data && data.price && data.price.usd !== undefined) {
        let source = "unknown"
        if (data.cached) source = "cache"
        else if (data.fromAPI) source = "alchemy"
        else if (data.interpolated) source = "interpolated"
        else if (data.fromDB) source = "database" // Added database as a source

        // Return a simplified data structure for the frontend
        return NextResponse.json(
          {
            success: true,
            message: message || "Price retrieved successfully",
            data: {
              price: { usd: data.price.usd }, // Keep price as an object with usd for frontend compatibility
              source: source,
              symbol: data.symbol, // Keep these for display in the frontend
              name: data.name,
              timestamp: data.timestamp,
              interpolated: data.interpolated, // Keep this flag for frontend display
              queued: data.queued, // Keep this flag for frontend display
            },
          },
          { status: backendResponse.status },
        )
      } else {
        return NextResponse.json(
          { success: false, message: "Price data not found in backend response" },
          { status: 500 },
        )
      }
    } else {
      // For non-OK responses, pass the backend error message directly
      return NextResponse.json(backendData, { status: backendResponse.status })
    }
  } catch (error) {
    console.error("API Route Error:", error)
    return NextResponse.json({ success: false, message: "Internal server error in Next.js API route" }, { status: 500 })
  }
}
