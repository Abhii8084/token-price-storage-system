import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, network } = body

    // Basic validation
    if (!token || !network) {
      return NextResponse.json({ success: false, message: "Token and network are required" }, { status: 400 })
    }

    // Forward to your Node.js backend API's batch endpoint
    // The backend will now determine the actual start date (token creation date)
    const backendResponse = await fetch("http://localhost:3001/api/batch/historical", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token, // Send single token
        network, // Send single network
      }),
    })

    const backendData = await backendResponse.json()

    if (backendResponse.ok) {
      return NextResponse.json(backendData, { status: backendResponse.status })
    } else {
      // Pass through backend errors
      return NextResponse.json(backendData, { status: backendResponse.status })
    }
  } catch (error) {
    console.error("API Route Error (schedule-history):", error)
    return NextResponse.json(
      { success: false, message: "Internal server error in Next.js API route for scheduling history" },
      { status: 500 },
    )
  }
}
