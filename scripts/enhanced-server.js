import express from "express"
import cors from "cors"
import redis from "redis"
import { MongoClient } from "mongodb"
import { Queue, Worker } from "bullmq"
import { InterpolationEngine } from "./interpolation-engine.js"
import { DatabaseManager } from "./database-manager.js"
import { AlchemyService } from "./alchemy-service.js"
import { DataLifecycleManager } from "./data-lifecycle-manager.js"
import { config, validateConfig } from "./config.js"

// Validate configuration on startup
validateConfig()

const app = express()
const PORT = config.app.port

// Middleware
app.use(cors({ origin: config.security.corsOrigin, credentials: config.security.corsCredentials }))
app.use(express.json())

// Redis client setup
const redisClient = redis.createClient({
  url: config.redis.url,
  password: config.redis.password,
  database: config.redis.db,
})

redisClient.on("error", (err) => {
  console.error("Redis Client Error:", err)
})

redisClient.on("connect", () => {
  console.log("Connected to Redis")
})

// MongoDB setup
const mongoClient = new MongoClient(config.mongodb.url, config.mongodb.options)
let db

// Initialize services (will be instantiated after DB/Redis connection)
let dbManager
let alchemyService
let interpolationEngine
let dataLifecycleManager

// Bull Queue setup
const priceQueue = new Queue(config.queue.names.priceProcessing, {
  connection: {
    host: config.queue.redis.host,
    port: config.queue.redis.port,
    password: config.queue.redis.password,
    db: config.queue.redis.db,
  },
})

const batchQueue = new Queue(config.queue.names.batchProcessing, {
  connection: {
    host: config.queue.redis.host,
    port: config.queue.redis.port,
    password: config.queue.redis.password,
    db: config.queue.redis.db,
  },
})

// Helper function to generate cache key
function generateCacheKey(token, network, timestamp = null) {
  const key = `${config.app.name}:price:${network}:${token.toLowerCase()}`
  return timestamp ? `${key}:${timestamp}` : `${key}:current`
}

// Enhanced API endpoint with MongoDB persistence and interpolation
app.post("/api/tokens", async (req, res) => {
  try {
    const { token, network, timestamp } = req.body

    // Validate input
    if (!token || !network) {
      return res.status(400).json({
        success: false,
        message: "Token address and network are required",
      })
    }

    const tokenRegex = /^0x[a-fA-F0-9]{40}$/
    if (!tokenRegex.test(token)) {
      return res.status(400).json({
        success: false,
        message: "Invalid token address format",
      })
    }

    if (!config.networks.supported.includes(network.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Unsupported network: ${network}. Supported networks are: ${config.networks.supported.join(", ")}`,
      })
    }

    const cacheKey = generateCacheKey(token, network, timestamp)
    console.log(`Processing request for token: ${token} on network: ${network}`)

    // Step 1: Check Redis cache
    console.log("Checking Redis cache...")
    const cachedPrice = await redisClient.get(cacheKey)

    if (cachedPrice) {
      console.log("Cache HIT - Returning cached price")
      const parsedCache = JSON.parse(cachedPrice)
      return res.json({
        success: true,
        message: "Price retrieved from cache",
        data: { ...parsedCache, cached: true },
      })
    }

    console.log("Cache MISS - Checking MongoDB...")

    // Step 2: Check MongoDB for historical data
    const dbPrice = await dbManager.getTokenPrice(token, network, timestamp)
    if (dbPrice) {
      console.log("Found price in MongoDB")
      // Cache in Redis for future requests
      await redisClient.setEx(cacheKey, config.cache.ttl.currentPrice, JSON.stringify(dbPrice))
      return res.json({
        success: true,
        message: "Price retrieved from database",
        data: { ...dbPrice, cached: false, fromDB: true },
      })
    }

    console.log("Price not found in DB - Querying Alchemy API...")

    // Step 3: Query Alchemy API
    const alchemyPrice = await alchemyService.getTokenPrice(token, network, timestamp)

    if (alchemyPrice) {
      console.log("Price found in Alchemy API")

      // Store in both Redis and MongoDB
      await Promise.all([
        redisClient.setEx(cacheKey, config.cache.ttl.currentPrice, JSON.stringify(alchemyPrice)),
        dbManager.storeTokenPrice(alchemyPrice),
      ])

      // If this is the first time we've seen this token, add it to the tokens collection
      const existingToken = await dbManager
        .getAllTokens()
        .then((tokens) => tokens.find((t) => t.token === token.toLowerCase() && t.network === network))
      if (!existingToken) {
        const creationDate = await alchemyService.getTokenCreationDate(token, network)
        if (creationDate) {
          await dbManager.addToken(token, network, creationDate)
          console.log(`Added new token ${token} with creation date ${creationDate}`)
        } else {
          console.warn(`Could not determine creation date for new token ${token}`)
        }
      }

      return res.json({
        success: true,
        message: "Price retrieved from Alchemy API",
        data: { ...alchemyPrice, cached: false, fromAPI: true },
      })
    }

    console.log("Price missing from Alchemy - Using interpolation engine...")

    // Step 4: Use Interpolation Engine
    const interpolatedPrice = await interpolationEngine.interpolatePrice(token, network, timestamp)

    if (interpolatedPrice) {
      console.log("Price interpolated successfully")

      // Store interpolated price in both Redis and MongoDB
      await Promise.all([
        redisClient.setEx(cacheKey, config.cache.ttl.interpolatedPrice, JSON.stringify(interpolatedPrice)),
        dbManager.storeTokenPrice({ ...interpolatedPrice, interpolated: true }),
      ])

      return res.json({
        success: true,
        message: "Price interpolated from available data",
        data: { ...interpolatedPrice, cached: false, interpolated: true },
      })
    }

    // Step 5: Add to queue for background processing
    await priceQueue.add(
      "fetch-missing-price",
      {
        token,
        network,
        timestamp,
        priority: timestamp ? 1 : 10, // Current prices have higher priority
      },
      {
        attempts: config.queue.settings.defaultJobAttempts,
        backoff: {
          type: config.queue.settings.defaultJobBackoff,
          delay: config.queue.settings.defaultJobDelay,
        },
      },
    )

    return res.status(202).json({
      success: false,
      message: "Price not available, added to processing queue",
      queued: true,
    })
  } catch (error) {
    console.error("API Error:", error)
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: config.app.isDevelopment ? error.message : undefined,
    })
  }
})

// Batch processing endpoint
app.post("/api/batch/historical", async (req, res) => {
  try {
    const { token, network, startDate, endDate } = req.body // Expect single token/network for full history

    if (!token || !network || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Token, network, startDate, and endDate are required",
      })
    }

    // Add batch job to queue
    const jobId = await batchQueue.add("historical-batch", {
      token, // Pass single token
      network, // Pass single network
      startDate,
      endDate,
      requestId: `batch_full_history_${token}_${Date.now()}`,
    })

    res.json({
      success: true,
      message: "Full historical data processing job queued",
      jobId: jobId.id,
    })
  } catch (error) {
    console.error("Batch API Error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to queue batch job",
    })
  }
})

// Queue status endpoint
app.get("/api/queue/status", async (req, res) => {
  try {
    const [priceStats, batchStats] = await Promise.all([priceQueue.getJobCounts(), batchQueue.getJobCounts()])

    res.json({
      success: true,
      data: {
        priceQueue: priceStats,
        batchQueue: batchStats,
      },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get queue status",
    })
  }
})

// Health check endpoint
app.get(config.monitoring.healthCheck.path, async (req, res) => {
  try {
    // Check Redis connection
    await redisClient.ping()
    // Check MongoDB connection
    await mongoClient.db().command({ ping: 1 })

    // DEBUG: Log queue client statuses
    console.log("DEBUG: priceQueue client status:", priceQueue?.client?.status)
    console.log("DEBUG: batchQueue client status:", batchQueue?.client?.status)

    // Check BullMQ queue connections
    const priceQueueReady = priceQueue.client.status === "ready"
    const batchQueueReady = batchQueue.client.status === "ready"

    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        redis: "connected",
        mongodb: "connected",
        alchemy:
          config.alchemy.apiKey && config.alchemy.apiKey !== "your_alchemy_api_key_here"
            ? "configured"
            : "not configured",
        queues: {
          priceQueue: priceQueueReady ? "ready" : priceQueue.client.status,
          batchQueue: batchQueueReady ? "ready" : batchQueue.client.status,
        },
      },
    })
  } catch (error) {
    console.error("Health check error:", error)
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
    })
  }
})

// Initialize services and start server
async function startServer() {
  try {
    // Connect to Redis
    await redisClient.connect()
    console.log("Redis connected successfully")

    // Connect to MongoDB
    await mongoClient.connect()
    db = mongoClient.db(config.mongodb.database)
    console.log("MongoDB connected successfully")

    // Initialize services
    dbManager = new DatabaseManager(db, config.mongodb.collections)
    alchemyService = new AlchemyService()
    interpolationEngine = new InterpolationEngine(dbManager, alchemyService)

    // Initialize database collections and indexes
    await dbManager.initialize()

    // Start queue workers
    startQueueWorkers()

    // DataLifecycleManager needs the batchQueue instance
    dataLifecycleManager = new DataLifecycleManager(
      dbManager,
      alchemyService,
      config.dataLifecycle,
      config.performance,
      batchQueue, // Pass the batchQueue instance
    )
    // Start scheduled tasks
    dataLifecycleManager.start()

    app.listen(PORT, () => {
      console.log(`Enhanced server running on port ${PORT}`)
      console.log(`Health check: http://localhost:${PORT}${config.monitoring.healthCheck.path}`)
    })
  } catch (error) {
    console.error("Failed to start server:", error)
    process.exit(1)
  }
}

// Queue Workers
function startQueueWorkers() {
  // Price processing worker
  new Worker(
    config.queue.names.priceProcessing,
    async (job) => {
      const { token, network, timestamp } = job.data
      console.log(`Processing missing price job: ${token} on ${network}`)

      try {
        // Try to fetch from Alchemy with retries
        const price = await alchemyService.getTokenPriceWithRetry(token, network, timestamp)

        if (price) {
          // Store in both Redis and MongoDB
          const cacheKey = generateCacheKey(token, network, timestamp)
          await Promise.all([
            redisClient.setEx(cacheKey, config.cache.ttl.currentPrice, JSON.stringify(price)),
            dbManager.storeTokenPrice(price),
          ])

          // If this is the first time we've seen this token, add it to the tokens collection
          const existingToken = await dbManager
            .getAllTokens()
            .then((tokens) => tokens.find((t) => t.token === token.toLowerCase() && t.network === network))
          if (!existingToken) {
            const creationDate = await alchemyService.getTokenCreationDate(token, network)
            if (creationDate) {
              await dbManager.addToken(token, network, creationDate)
              console.log(`Added new token ${token} with creation date ${creationDate} from worker`)
            } else {
              console.warn(`Could not determine creation date for new token ${token} from worker`)
            }
          }

          return { success: true, price }
        }

        // If still no price, try interpolation
        const interpolatedPrice = await interpolationEngine.interpolatePrice(token, network, timestamp)
        if (interpolatedPrice) {
          const cacheKey = generateCacheKey(token, network, timestamp)
          await Promise.all([
            redisClient.setEx(cacheKey, config.cache.ttl.interpolatedPrice, JSON.stringify(interpolatedPrice)),
            dbManager.storeTokenPrice({ ...interpolatedPrice, interpolated: true }),
          ])

          return { success: true, price: interpolatedPrice, interpolated: true }
        }

        return { success: false, reason: "No price data available" }
      } catch (error) {
        console.error("Price processing job failed:", error)
        throw error
      }
    },
    {
      connection: {
        host: config.queue.redis.host,
        port: config.queue.redis.port,
        password: config.queue.redis.password,
        db: config.queue.redis.db,
      },
      concurrency: config.queue.settings.priceProcessingConcurrency,
      attempts: config.queue.settings.defaultJobAttempts,
      backoff: {
        type: config.queue.settings.defaultJobBackoff,
        delay: config.queue.settings.defaultJobDelay,
      },
    },
  )

  // Batch processing worker
  new Worker(
    config.queue.names.batchProcessing,
    async (job) => {
      const { token, network, requestId, startDate, endDate } = job.data // Now expects single token/network and date range
      console.log(`Processing batch job: ${requestId} for token ${token} on ${network} from ${startDate} to ${endDate}`)

      try {
        const results = await dataLifecycleManager.processBatchHistorical(token, network, startDate, endDate)
        console.log(`Batch job ${requestId} completed: ${results.processed} prices processed`)
        return results
      } catch (error) {
        console.error(`Batch job ${requestId} failed:`, error)
        throw error
      }
    },
    {
      connection: {
        host: config.queue.redis.host,
        port: config.queue.redis.port,
        password: config.queue.redis.password,
        db: config.queue.redis.db,
      },
      concurrency: config.queue.settings.batchProcessingConcurrency,
      attempts: config.queue.settings.defaultJobAttempts,
      backoff: {
        type: config.queue.settings.defaultJobBackoff,
        delay: config.queue.settings.defaultJobDelay,
      },
    },
  )

  console.log("Queue workers started")
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...")
  await Promise.all([
    redisClient.quit(),
    mongoClient.close(),
    priceQueue.close(),
    batchQueue.close(),
    dataLifecycleManager.stop(), // Stop cron jobs
  ])
  process.exit(0)
})

startServer()
