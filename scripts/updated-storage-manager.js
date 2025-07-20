import redis from "redis"
import { MongoClient } from "mongodb"
import { config, validateConfig } from "./config.js"

export class StorageManager {
  constructor() {
    // Validate configuration on initialization
    validateConfig()

    this.redisClient = null
    this.mongoClient = null
    this.db = null
    this.collections = {}

    // Use configuration from .env
    this.cacheTTL = config.cache.ttl
    this.storageStrategies = {
      hot: {
        redis: true,
        mongo: true,
        ttl: this.cacheTTL.currentPrice,
      },
      warm: {
        redis: true,
        mongo: true,
        ttl: this.cacheTTL.historicalPrice,
      },
      cold: {
        redis: false,
        mongo: true,
        ttl: 0,
      },
      archive: {
        redis: false,
        mongo: true,
        ttl: 0,
        compressed: config.dataLifecycle.archive.compressionEnabled,
      },
    }
  }

  async initialize() {
    console.log(`Initializing Storage Manager for ${config.app.name} in ${config.app.env} mode...`)

    await this.initializeRedis()
    await this.initializeMongoDB()

    console.log("Storage Manager initialized successfully")
  }

  async initializeRedis() {
    console.log(`Connecting to Redis at ${config.redis.host}:${config.redis.port}...`)

    this.redisClient = redis.createClient({
      url: config.redis.url,
      password: config.redis.password,
      database: config.redis.db,
      retry_strategy: (options) => {
        if (options.error && options.error.code === "ECONNREFUSED") {
          console.error("Redis server connection refused")
          return new Error("Redis server connection refused")
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          console.error("Redis retry time exhausted")
          return new Error("Redis retry time exhausted")
        }
        if (options.attempt > config.redis.maxRetries) {
          return undefined
        }
        return Math.min(options.attempt * 100, config.redis.retryDelay)
      },
    })

    this.redisClient.on("error", (err) => {
      console.error("Redis Client Error:", err)
    })

    this.redisClient.on("connect", () => {
      console.log("Connected to Redis")
    })

    this.redisClient.on("ready", () => {
      console.log("Redis client ready")
    })

    await this.redisClient.connect()

    // Configure Redis memory settings if in development
    if (config.app.isDevelopment) {
      try {
        await this.redisClient.configSet("maxmemory", config.redis.maxMemory)
        await this.redisClient.configSet("maxmemory-policy", config.redis.maxMemoryPolicy)
        console.log(`Redis memory configured: ${config.redis.maxMemory} with ${config.redis.maxMemoryPolicy} policy`)
      } catch (error) {
        console.warn("Could not configure Redis memory settings:", error.message)
      }
    }
  }

  async initializeMongoDB() {
    console.log(`Connecting to MongoDB at ${config.mongodb.host}:${config.mongodb.port}...`)

    // Build connection URL with authentication if provided
    let mongoUrl = config.mongodb.url
    if (config.mongodb.username && config.mongodb.password) {
      const auth = `${config.mongodb.username}:${config.mongodb.password}`
      mongoUrl = mongoUrl.replace("mongodb://", `mongodb://${auth}@`)
    }

    this.mongoClient = new MongoClient(mongoUrl, {
      ...config.mongodb.options,
      retryWrites: true,
      w: "majority",
    })

    await this.mongoClient.connect()
    this.db = this.mongoClient.db(config.mongodb.database)

    // Initialize collections using names from config
    this.collections = {}
    Object.entries(config.mongodb.collections).forEach(([key, collectionName]) => {
      this.collections[key] = this.db.collection(collectionName)
    })

    await this.createIndexes()
    console.log(`MongoDB initialized with database: ${config.mongodb.database}`)
  }

  async createIndexes() {
    console.log("Creating database indexes...")

    const indexOperations = [
      // Token prices indexes
      this.collections.prices.createIndex(
        { token: 1, network: 1, timestamp: 1 },
        { unique: true, name: "token_network_timestamp_unique" },
      ),
      this.collections.prices.createIndex({ token: 1, network: 1 }, { name: "token_network_lookup" }),
      this.collections.prices.createIndex({ timestamp: 1 }, { name: "timestamp_range_queries" }),
      this.collections.prices.createIndex({ "price.usd": 1 }, { name: "price_value_queries" }),
      this.collections.prices.createIndex(
        { createdAt: 1 },
        {
          expireAfterSeconds: config.dataLifecycle.retention.pricesDays * 24 * 60 * 60,
          name: "auto_expire_prices",
        },
      ),

      // Historical prices indexes
      this.collections.historical.createIndex(
        { token: 1, network: 1, date: 1 },
        { unique: true, name: "historical_unique" },
      ),
      this.collections.historical.createIndex({ date: 1 }, { name: "historical_date_range" }),

      // Token metadata indexes
      this.collections.metadata.createIndex({ token: 1, network: 1 }, { unique: true, name: "metadata_unique" }),
      this.collections.metadata.createIndex({ symbol: 1 }, { name: "symbol_lookup" }),

      // Analytics indexes
      this.collections.analytics.createIndex({ token: 1, network: 1, period: 1 }, { name: "analytics_lookup" }),
      this.collections.analytics.createIndex(
        { calculatedAt: 1 },
        {
          expireAfterSeconds: config.dataLifecycle.retention.analyticsDays * 24 * 60 * 60,
          name: "analytics_expire",
        },
      ),

      // Cache stats indexes
      this.collections.cacheStats.createIndex({ date: 1 }, { name: "cache_stats_date" }),
      this.collections.cacheStats.createIndex(
        { createdAt: 1 },
        {
          expireAfterSeconds: config.dataLifecycle.retention.cacheStatsDays * 24 * 60 * 60,
          name: "cache_stats_expire",
        },
      ),
    ]

    await Promise.all(indexOperations)
    console.log("Database indexes created successfully")
  }

  // Cache operations using config values
  async cacheSet(key, data, strategy = "hot") {
    try {
      const config_strategy = this.storageStrategies[strategy]
      if (!config_strategy.redis) return false

      const serializedData = JSON.stringify({
        ...data,
        cached_at: new Date().toISOString(),
        strategy: strategy,
        ttl: config_strategy.ttl,
      })

      if (config_strategy.ttl > 0) {
        await this.redisClient.setEx(key, config_strategy.ttl, serializedData)
      } else {
        await this.redisClient.set(key, serializedData)
      }

      await this.updateCacheStats("set", key, strategy)

      if (config.development.debugEnabled) {
        console.log(`Cache SET: ${key} with TTL ${config_strategy.ttl}s`)
      }

      return true
    } catch (error) {
      console.error("Redis cache set error:", error)
      return false
    }
  }

  async cacheGet(key) {
    try {
      const data = await this.redisClient.get(key)
      if (!data) {
        await this.updateCacheStats("miss", key)
        return null
      }

      await this.updateCacheStats("hit", key)

      if (config.development.debugEnabled) {
        console.log(`Cache HIT: ${key}`)
      }

      return JSON.parse(data)
    } catch (error) {
      console.error("Redis cache get error:", error)
      return null
    }
  }

  // MongoDB operations using config collection names
  async mongoStore(collectionKey, data, options = {}) {
    try {
      const collection = this.collections[collectionKey]
      if (!collection) {
        throw new Error(`Collection ${collectionKey} not found`)
      }

      const document = {
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
        environment: config.app.env,
      }

      if (options.upsert) {
        const filter = options.filter || { _id: document._id }
        const result = await collection.replaceOne(filter, document, { upsert: true })
        return result.upsertedId || result.modifiedCount > 0
      } else {
        const result = await collection.insertOne(document)
        return result.insertedId
      }
    } catch (error) {
      console.error(`MongoDB store error in ${collectionKey}:`, error)
      throw error
    }
  }

  async mongoFind(collectionKey, query, options = {}) {
    try {
      const collection = this.collections[collectionKey]
      if (!collection) {
        throw new Error(`Collection ${collectionKey} not found`)
      }

      const cursor = collection.find(query, options.projection)

      if (options.sort) cursor.sort(options.sort)
      if (options.limit) cursor.limit(options.limit)
      if (options.skip) cursor.skip(options.skip)

      return options.single ? await cursor.next() : await cursor.toArray()
    } catch (error) {
      console.error(`MongoDB find error in ${collectionKey}:`, error)
      return options.single ? null : []
    }
  }

  // Storage metrics with environment info
  async getStorageMetrics() {
    try {
      const [redisInfo, mongoStats] = await Promise.all([this.getRedisMetrics(), this.getMongoMetrics()])

      return {
        environment: config.app.env,
        application: config.app.name,
        redis: redisInfo,
        mongodb: mongoStats,
        configuration: {
          cache_ttl: this.cacheTTL,
          retention_policies: config.dataLifecycle.retention,
          performance_settings: config.performance,
        },
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      console.error("Error getting storage metrics:", error)
      return null
    }
  }

  async getRedisMetrics() {
    try {
      const [info, keyCount, memoryUsage] = await Promise.all([
        this.redisClient.info("memory"),
        this.redisClient.dbSize(),
        this.redisClient.memoryUsage("nonexistent-key").catch(() => null),
      ])

      return {
        connected: true,
        host: config.redis.host,
        port: config.redis.port,
        database: config.redis.db,
        key_count: keyCount,
        memory_info: this.parseRedisInfo(info),
        configuration: {
          max_memory: config.redis.maxMemory,
          max_memory_policy: config.redis.maxMemoryPolicy,
          max_retries: config.redis.maxRetries,
        },
      }
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        configuration: {
          host: config.redis.host,
          port: config.redis.port,
        },
      }
    }
  }

  async getMongoMetrics() {
    try {
      const stats = await this.db.stats()
      const collections = {}

      for (const [name, collection] of Object.entries(this.collections)) {
        try {
          const collStats = await collection.stats()
          collections[name] = {
            count: collStats.count,
            size: collStats.size,
            avgObjSize: collStats.avgObjSize,
            indexes: collStats.nindexes,
            totalIndexSize: collStats.totalIndexSize,
          }
        } catch (error) {
          collections[name] = { error: error.message }
        }
      }

      return {
        connected: true,
        host: config.mongodb.host,
        port: config.mongodb.port,
        database: config.mongodb.database,
        database_stats: {
          collections: stats.collections,
          dataSize: stats.dataSize,
          indexSize: stats.indexSize,
          storageSize: stats.storageSize,
        },
        collections: collections,
        configuration: {
          max_pool_size: config.mongodb.options.maxPoolSize,
          socket_timeout: config.mongodb.options.socketTimeoutMS,
        },
      }
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        configuration: {
          host: config.mongodb.host,
          port: config.mongodb.port,
          database: config.mongodb.database,
        },
      }
    }
  }

  // Update cache statistics using config collection name
  async updateCacheStats(operation, key, strategy = null) {
    try {
      const today = new Date().toISOString().split("T")[0]
      const statsKey = `cache_stats_${today}`

      const update = {
        $inc: {
          [`operations.${operation}`]: 1,
          "operations.total": 1,
        },
        $set: {
          lastUpdated: new Date(),
          environment: config.app.env,
        },
      }

      if (strategy) {
        update.$inc[`strategies.${strategy}`] = 1
      }

      await this.collections.cacheStats.updateOne({ _id: statsKey }, update, { upsert: true })
    } catch (error) {
      console.error("Error updating cache stats:", error)
    }
  }

  // Utility methods
  generatePriceKey(token, network, timestamp = null) {
    const baseKey = `${config.app.name}:price:${network}:${token.toLowerCase()}`
    return timestamp ? `${baseKey}:${timestamp}` : `${baseKey}:current`
  }

  parseRedisInfo(info) {
    const lines = info.split("\r\n")
    const parsed = {}

    lines.forEach((line) => {
      if (line.includes(":")) {
        const [key, value] = line.split(":")
        parsed[key] = isNaN(value) ? value : Number.parseInt(value)
      }
    })

    return parsed
  }

  // Graceful shutdown
  async close() {
    try {
      console.log("Closing storage connections...")

      if (this.redisClient) {
        await this.redisClient.quit()
        console.log("Redis connection closed")
      }

      if (this.mongoClient) {
        await this.mongoClient.close()
        console.log("MongoDB connection closed")
      }

      console.log("Storage Manager shutdown complete")
    } catch (error) {
      console.error("Error closing storage connections:", error)
    }
  }
}
