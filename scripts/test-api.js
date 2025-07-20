// Test script to verify API functionality
async function testAPI() {
  const baseURL = "http://localhost:3001"

  // Test data
  const testToken = "0xA0b86a33E6441b8435b662f0E2d0B8A0b86a33E6" // Example token
  const testNetwork = "ethereum"

  try {
    console.log("Testing API endpoints...\n")

    // Test health endpoint
    console.log("1. Testing health endpoint...")
    const healthResponse = await fetch(`${baseURL}/health`)
    const healthData = await healthResponse.json()
    console.log("Health check:", healthData)

    // Test token price endpoint (first call - cache miss)
    console.log("\n2. Testing token price endpoint (cache miss)...")
    const priceResponse1 = await fetch(`${baseURL}/api/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: testToken,
        network: testNetwork,
      }),
    })
    const priceData1 = await priceResponse1.json()
    console.log("First call (cache miss):", priceData1)

    // Test token price endpoint (second call - cache hit)
    console.log("\n3. Testing token price endpoint (cache hit)...")
    const priceResponse2 = await fetch(`${baseURL}/api/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: testToken,
        network: testNetwork,
      }),
    })
    const priceData2 = await priceResponse2.json()
    console.log("Second call (cache hit):", priceData2)

    // Test cache stats
    console.log("\n4. Testing cache stats...")
    const statsResponse = await fetch(`${baseURL}/api/cache/stats`)
    const statsData = await statsResponse.json()
    console.log("Cache stats:", statsData)
  } catch (error) {
    console.error("Test failed:", error)
  }
}

testAPI()
