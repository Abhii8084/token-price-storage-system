import redis from "redis"
import { MongoClient } from "mongodb"

export class StorageManager {
  constructor() {
    this.redisClient = null
    this.mongoClient = null
    this.db = null
    this.collections = {}

    // Cache configuration
    this.cacheTTL = {
      current_price: 300, // 5 minutes
      historical_price: 3600, // 1 hour
      token_metadata: 86400, // 24 hours
      interpolated_price: 1800, // 30 minutes
      batch_results: 7200, // 2 hours
    }

    // Storage strategies
    this.storageStrategies = {
      hot: { redis: true, mongo: true, ttl: this.cacheTTL.current_price },
      warm: { redis: true, mongo: true, ttl: this.cacheTTL.historical_price },
      cold: { redis: false, mongo: true, ttl: 0 },
      archive: { redis: false, mongo: true, ttl: 0, compressed: true },
    }
  }

  async initialize() {
    await this.initializeRedis()
    await this.initializeMongoDB()
    console.log("Storage Manager initialized successfully")
  }

  async initializeRedis() {
    this.redisClient = redis.createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
      retry_strategy: (options) => {
        if (options.error && options.error.code === "ECONNREFUSED") {
          return new Error("Redis server connection refused")
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          return new Error("Redis retry time exhausted")
        }
        if (options.attempt > 10) {
          return undefined
        }
        return Math.min(options.attempt * 100, 3000)
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
  }

  async initializeMongoDB() {
    this.mongoClient = new MongoClient(process.env.MONGODB_URL || "mongodb://localhost:27017", {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    })

    await this.mongoClient.connect()
    this.db = this.mongoClient.db("token_price_storage")

    // Initialize collections
    this.collections = {
      prices: this.db.collection("token_prices"),
      metadata: this.db.collection("token_metadata"),
      tokens: this.db.collection("tokens"),
      historical: this.db.collection("historical_prices"),
      interpolated: this.db.collection("interpolated_prices"),
      analytics: this.db.collection("price_analytics"),
      cache_stats: this.db.collection("cache_statistics"),
    }

    await this.createIndexes()
    console.log("MongoDB initialized with collections and indexes")
  }

  async createIndexes() {
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
        { expireAfterSeconds: 2592000, name: "auto_expire_30_days" }, // 30 days TTL
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

      // Interpolated prices indexes
      this.collections.interpolated.createIndex(
        { token: 1, network: 1, timestamp: 1 },
        { unique: true, name: "interpolated_unique" },
      ),
      this.collections.interpolated.createIndex({ confidence: 1 }, { name: "confidence_filtering" }),

      // Analytics indexes
      this.collections.analytics.createIndex({ token: 1, network: 1, period: 1 }, { name: "analytics_lookup" }),
      this.collections.analytics.createIndex(
        { calculatedAt: 1 },
        { expireAfterSeconds: 604800, name: "analytics_expire_7_days" }, // 7 days TTL
      ),
    ]

    await Promise.all(indexOperations)
    console.log("Database indexes created successfully")
  }

  // Redis Operations
  async cacheSet(key, data, strategy = "hot") {
    try {
      const config = this.storageStrategies[strategy]
      if (!config.redis) return false

      const serializedData = JSON.stringify({
        ...data,
        cached_at: new Date().toISOString(),
        strategy: strategy,
      })

      if (config.ttl > 0) {
        await this.redisClient.setEx(key, config.ttl, serializedData)
      } else {
        await this.redisClient.set(key, serializedData)
      }

      // Update cache statistics
      await this.updateCacheStats("set", key, strategy)
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
      return JSON.parse(data)
    } catch (error) {
      console.error("Redis cache get error:", error)
      return null
    }
  }

  async cacheDelete(key) {
    try {
      const deleted = await this.redisClient.del(key)
      await this.updateCacheStats("delete", key)
      return deleted > 0
    } catch (error) {
      console.error("Redis cache delete error:", error)
      return false
    }
  }

  async cacheExists(key) {
    try {
      return (await this.redisClient.exists(key)) === 1
    } catch (error) {
      console.error("Redis cache exists error:", error)
      return false
    }
  }

  async cacheTTL(key) {
    try {
      return await this.redisClient.ttl(key)
    } catch (error) {
      console.error("Redis cache TTL error:", error)
      return -1
    }
  }

  // MongoDB Operations
  async mongoStore(collection, data, options = {}) {
    try {
      const document = {
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      if (options.upsert) {
        const filter = options.filter || { _id: document._id }
        const result = await this.collections[collection].replaceOne(filter, document, { upsert: true })
        return result.upsertedId || result.modifiedCount > 0
      } else {
        const result = await this.collections[collection].insertOne(document)
        return result.insertedId
      }
    } catch (error) {
      console.error(`MongoDB store error in ${collection}:`, error)
      throw error
    }
  }

  async mongoFind(collection, query, options = {}) {
    try {
      const cursor = this.collections[collection].find(query, options.projection)

      if (options.sort) cursor.sort(options.sort)
      if (options.limit) cursor.limit(options.limit)
      if (options.skip) cursor.skip(options.skip)

      return options.single ? await cursor.next() : await cursor.toArray()
    } catch (error) {
      console.error(`MongoDB find error in ${collection}:`, error)
      return options.single ? null : []
    }
  }

  async mongoUpdate(collection, filter, update, options = {}) {
    try {
      const updateDoc = {
        $set: {
          ...update,
          updatedAt: new Date(),
        },
      }

      if (options.upsert) {
        return await this.collections[collection].updateOne(filter, updateDoc, { upsert: true })
      } else {
        return await this.collections[collection].updateMany(filter, updateDoc)
      }
    } catch (error) {
      console.error(`MongoDB update error in ${collection}:`, error)
      throw error
    }
  }

  async mongoDelete(collection, filter) {
    try {
      return await this.collections[collection].deleteMany(filter)
    } catch (error) {
      console.error(`MongoDB delete error in ${collection}:`, error)
      throw error
    }
  }

  // High-level storage operations
  async storeTokenPrice(priceData, strategy = "hot") {
    const key = this.generatePriceKey(priceData.token, priceData.network, priceData.timestamp)

    try {
      // Store in cache if strategy allows
      if (this.storageStrategies[strategy].redis) {
        await this.cacheSet(key, priceData, strategy)
      }

      // Always store in MongoDB for persistence
      const mongoDoc = {
        _id: key,
        ...priceData,
        storage_strategy: strategy,
      }

      await this.mongoStore("prices", mongoDoc, { upsert: true, filter: { _id: key } })

      // Store in historical collection for daily aggregation
      if (priceData.timestamp) {
        await this.storeHistoricalPrice(priceData)
      }

      return true
    } catch (error) {
      console.error("Error storing token price:", error)
      throw error
    }
  }

  async getTokenPrice(token, network, timestamp = null) {
    const key = this.generatePriceKey(token, network, timestamp)

    try {
      // Try cache first
      const cachedData = await this.cacheGet(key)
      if (cachedData) {
        return { ...cachedData, source: "cache" }
      }

      // Fallback to MongoDB
      const mongoData = await this.mongoFind("prices", { _id: key }, { single: true })
      if (mongoData) {
        // Re-cache if found in MongoDB
        await this.cacheSet(key, mongoData, "warm")
        return { ...mongoData, source: "database" }
      }

      return null
    } catch (error) {
      console.error("Error getting token price:", error)
      return null
    }
  }

  async storeHistoricalPrice(priceData) {
    try {
      const date = new Date(priceData.timestamp).toISOString().split("T")[0] // YYYY-MM-DD
      const historicalKey = `${priceData.token}_${priceData.network}_${date}`

      const historicalDoc = {
        _id: historicalKey,
        token: priceData.token,
        network: priceData.network,
        date: date,
        prices: [
          {
            timestamp: priceData.timestamp,
            price: priceData.price,
            source: priceData.source || "unknown",
          },
        ],
        daily_stats: {
          count: 1,
          first_price: priceData.price.usd,
          last_price: priceData.price.usd,
          min_price: priceData.price.usd,
          max_price: priceData.price.usd,
          avg_price: priceData.price.usd,
        },
      }

      // Use upsert with aggregation to update daily stats
      await this.collections.historical.updateOne(
        { _id: historicalKey },
        {
          $setOnInsert: {
            token: priceData.token,
            network: priceData.network,
            date: date,
            createdAt: new Date(),
          },
          $push: {
            prices: {
              timestamp: priceData.timestamp,
              price: priceData.price,
              source: priceData.source || "unknown",
            },
          },
          $inc: { "daily_stats.count": 1 },
          $min: { "daily_stats.min_price": priceData.price.usd },
          $max: { "daily_stats.max_price": priceData.price.usd },
          $set: {
            "daily_stats.last_price": priceData.price.usd,
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      )

      return true
    } catch (error) {
      console.error("Error storing historical price:", error)
      return false
    }
  }

  async getPriceHistory(token, network, startDate, endDate, granularity = "daily") {
    try {
      const query = {
        token: token.toLowerCase(),
        network: network,
        date: {
          $gte: startDate,
          $lte: endDate,
        },
      }

      const historicalData = await this.mongoFind("historical", query, {
        sort: { date: 1 },
      })

      if (granularity === "hourly" || granularity === "minute") {
        // For finer granularity, query the main prices collection
        const detailedQuery = {
          token: token.toLowerCase(),
          network: network,
          timestamp: {
            $gte: new Date(startDate).toISOString(),
            $lte: new Date(endDate).toISOString(),
          },
        }

        return await this.mongoFind("prices", detailedQuery, {
          sort: { timestamp: 1 },
        })
      }

      return historicalData
    } catch (error) {
      console.error("Error getting price history:", error)
      return []
    }
  }

  // Cache management and cleanup
  async cleanupExpiredCache() {
    try {
      console.log("Starting cache cleanup...")

      // Get all keys with pattern
      const keys = await this.redisClient.keys("token_price:*")
      let expiredCount = 0

      for (const key of keys) {
        const ttl = await this.cacheTTL(key)
        if (ttl === -2) {
          // Key doesn't exist
          expiredCount++
        }
      }

      console.log(`Cache cleanup completed. ${expiredCount} expired keys found`)
      return expiredCount
    } catch (error) {
      console.error("Cache cleanup error:", error)
      return 0
    }
  }

  async archiveOldData(daysOld = 90) {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysOld)

      // Move old data to archive collection
      const oldData = await this.mongoFind("prices", {
        createdAt: { $lt: cutoffDate },
      })

      if (oldData.length > 0) {
        // Insert into archive collection (you'd create this)
        const archiveCollection = this.db.collection("archived_prices")
        await archiveCollection.insertMany(
          oldData.map((doc) => ({
            ...doc,
            archivedAt: new Date(),
            compressed: true,
          })),
        )

        // Remove from main collection
        await this.mongoDelete("prices", {
          createdAt: { $lt: cutoffDate },
        })

        console.log(`Archived ${oldData.length} old price records`)
      }

      return oldData.length
    } catch (error) {
      console.error("Archive operation error:", error)
      return 0
    }
  }

  // Analytics and monitoring
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
        },
      }

      if (strategy) {
        update.$inc[`strategies.${strategy}`] = 1
      }

      await this.collections.cache_stats.updateOne({ _id: statsKey }, update, { upsert: true })
    } catch (error) {
      console.error("Error updating cache stats:", error)
    }
  }

  async getCacheStats(days = 7) {
    try {
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      const stats = await this.mongoFind("cache_stats", {
        _id: {
          $gte: startDate.toISOString().split("T")[0],
          $lte: endDate.toISOString().split("T")[0],
        },
      })

      // Calculate aggregated stats
      const aggregated = {
        total_operations: 0,
        hit_rate: 0,
        operations: {},
        strategies: {},
        daily_breakdown: stats,
      }

      stats.forEach((day) => {
        aggregated.total_operations += day.operations?.total || 0
        Object.keys(day.operations || {}).forEach((op) => {
          aggregated.operations[op] = (aggregated.operations[op] || 0) + day.operations[op]
        })
        Object.keys(day.strategies || {}).forEach((strategy) => {
          aggregated.strategies[strategy] = (aggregated.strategies[strategy] || 0) + day.strategies[strategy]
        })
      })

      if (aggregated.operations.hit && aggregated.operations.total) {
        aggregated.hit_rate =
          (aggregated.operations.hit / (aggregated.operations.hit + aggregated.operations.miss)) * 100
      }

      return aggregated
    } catch (error) {
      console.error("Error getting cache stats:", error)
      return null
    }
  }

  async getStorageMetrics() {
    try {
      const [redisInfo, mongoStats] = await Promise.all([this.getRedisMetrics(), this.getMongoMetrics()])

      return {
        redis: redisInfo,
        mongodb: mongoStats,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      console.error("Error getting storage metrics:", error)
      return null
    }
  }

  async getRedisMetrics() {
    try {
      const info = await this.redisClient.info("memory")
      const keyCount = await this.redisClient.dbSize()

      return {
        memory_usage: this.parseRedisInfo(info),
        key_count: keyCount,
        connected: true,
      }
    } catch (error) {
      return {
        connected: false,
        error: error.message,
      }
    }
  }

  async getMongoMetrics() {
    try {
      const stats = await this.db.stats()
      const collections = {}

      for (const [name, collection] of Object.entries(this.collections)) {
        const collStats = await collection.stats()
        collections[name] = {
          count: collStats.count,
          size: collStats.size,
          avgObjSize: collStats.avgObjSize,
          indexes: collStats.nindexes,
        }
      }

      return {
        database_stats: stats,
        collections: collections,
        connected: true,
      }
    } catch (error) {
      return {
        connected: false,
        error: error.message,
      }
    }
  }

  // Utility methods
  generatePriceKey(token, network, timestamp = null) {
    const baseKey = `token_price:${network}:${token.toLowerCase()}`
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
      if (this.redisClient) {
        await this.redisClient.quit()
        console.log("Redis connection closed")
      }

      if (this.mongoClient) {
        await this.mongoClient.close()
        console.log("MongoDB connection closed")
      }
    } catch (error) {
      console.error("Error closing storage connections:", error)
    }
  }
}
