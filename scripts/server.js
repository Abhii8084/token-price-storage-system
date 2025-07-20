import express from "express"
import cors from "cors"
import redis from "redis"
import { Alchemy, Network } from "alchemy-sdk"

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json())

// Redis client setup
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
})

redisClient.on("error", (err) => {
  console.error("Redis Client Error:", err)
})

redisClient.on("connect", () => {
  console.log("Connected to Redis")
})

// Alchemy SDK setup
const alchemyConfig = {
  apiKey: process.env.ALCHEMY_API_KEY,
  network: Network.ETH_MAINNET, // Default network
}

// Network mapping for Alchemy
const networkMapping = {
  ethereum: Network.ETH_MAINNET,
  polygon: Network.MATIC_MAINNET,
  arbitrum: Network.ARB_MAINNET,
  optimism: Network.OPT_MAINNET,
}

// Cache TTL (Time To Live) in seconds - 5 minutes
const CACHE_TTL = 300

// Helper function to generate cache key
function generateCacheKey(token, network) {
  return `token_price:${network}:${token.toLowerCase()}`
}

// Helper function to get Alchemy instance for network
function getAlchemyInstance(network) {
  const alchemyNetwork = networkMapping[network.toLowerCase()]
  if (!alchemyNetwork) {
    throw new Error(`Unsupported network: ${network}`)
  }

  return new Alchemy({
    ...alchemyConfig,
    network: alchemyNetwork,
  })
}

// API endpoint to handle token price requests
app.post("/api/tokens", async (req, res) => {
  try {
    const { token, network } = req.body

    // Validate input
    if (!token || !network) {
      return res.status(400).json({
        success: false,
        message: "Token address and network are required",
      })
    }

    // Validate token address format
    const tokenRegex = /^0x[a-fA-F0-9]{40}$/
    if (!tokenRegex.test(token)) {
      return res.status(400).json({
        success: false,
        message: "Invalid token address format",
      })
    }

    // Validate network
    if (!networkMapping[network.toLowerCase()]) {
      return res.status(400).json({
        success: false,
        message: `Unsupported network: ${network}`,
      })
    }

    const cacheKey = generateCacheKey(token, network)
    console.log(`Processing request for token: ${token} on network: ${network}`)

    // Check Redis cache first
    console.log("Checking Redis cache...")
    const cachedPrice = await redisClient.get(cacheKey)

    if (cachedPrice) {
      console.log("Cache HIT - Returning cached price")
      const parsedCache = JSON.parse(cachedPrice)

      return res.json({
        success: true,
        message: "Price retrieved from cache",
        data: {
          ...parsedCache,
          cached: true,
          cacheKey,
        },
      })
    }

    console.log("Cache MISS - Querying Alchemy API...")

    // Cache miss - query Alchemy API
    const alchemy = getAlchemyInstance(network)

    // Get token metadata first
    const tokenMetadata = await alchemy.core.getTokenMetadata(token)

    if (!tokenMetadata) {
      return res.status(404).json({
        success: false,
        message: "Token not found or invalid",
      })
    }

    // For demonstration, we'll simulate getting price data
    // In a real implementation, you'd use Alchemy's price endpoints or integrate with a price API
    const mockPrice = {
      token: token,
      network: network,
      symbol: tokenMetadata.symbol || "UNKNOWN",
      name: tokenMetadata.name || "Unknown Token",
      decimals: tokenMetadata.decimals || 18,
      price: {
        usd: Math.random() * 1000, // Mock price - replace with actual Alchemy price call
        lastUpdated: new Date().toISOString(),
      },
      metadata: {
        totalSupply: tokenMetadata.totalSupply,
        logo: tokenMetadata.logo,
      },
    }

    // Cache the result in Redis
    console.log("Caching result in Redis...")
    await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(mockPrice))

    console.log(`Price cached for ${CACHE_TTL} seconds`)

    return res.json({
      success: true,
      message: "Price retrieved from Alchemy API",
      data: {
        ...mockPrice,
        cached: false,
        cacheKey,
        cacheTTL: CACHE_TTL,
      },
    })
  } catch (error) {
    console.error("API Error:", error)

    // Handle specific error types
    if (error.message.includes("Unsupported network")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      })
    }

    if (error.message.includes("Redis")) {
      console.error("Redis error, proceeding without cache")
      // Could implement fallback logic here
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
})

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    // Check Redis connection
    await redisClient.ping()

    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        redis: "connected",
        alchemy: process.env.ALCHEMY_API_KEY ? "configured" : "not configured",
      },
    })
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
    })
  }
})

// Cache management endpoints
app.get("/api/cache/stats", async (req, res) => {
  try {
    const info = await redisClient.info("memory")
    const keyCount = await redisClient.dbSize()

    res.json({
      success: true,
      data: {
        keyCount,
        memoryInfo: info,
      },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get cache stats",
    })
  }
})

app.delete("/api/cache/:token/:network", async (req, res) => {
  try {
    const { token, network } = req.params
    const cacheKey = generateCacheKey(token, network)

    const deleted = await redisClient.del(cacheKey)

    res.json({
      success: true,
      message: deleted ? "Cache entry deleted" : "Cache entry not found",
      deleted: deleted > 0,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete cache entry",
    })
  }
})

// Initialize Redis connection and start server
async function startServer() {
  try {
    await redisClient.connect()
    console.log("Redis connected successfully")

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
      console.log(`Health check: http://localhost:${PORT}/health`)
    })
  } catch (error) {
    console.error("Failed to start server:", error)
    process.exit(1)
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...")
  await redisClient.quit()
  process.exit(0)
})

startServer()
