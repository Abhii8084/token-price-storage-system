import redis from "redis"

async function setupRedis() {
  const client = redis.createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
  })

  try {
    await client.connect()
    console.log("Connected to Redis")

    // Test basic operations
    await client.set("test_key", "test_value", { EX: 10 })
    const value = await client.get("test_key")
    console.log("Test value:", value)

    // Clean up test key
    await client.del("test_key")
    console.log("Redis setup completed successfully")
  } catch (error) {
    console.error("Redis setup failed:", error)
  } finally {
    await client.quit()
  }
}

setupRedis()
