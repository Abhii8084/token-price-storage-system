import { config } from "./config.js"

export class DatabaseManager {
  constructor(db, collectionsConfig) {
    this.db = db
    this.collections = {}
    // Map collection keys to actual collection instances
    Object.entries(collectionsConfig).forEach(([key, name]) => {
      this.collections[key] = db.collection(name)
    })
  }

  async initialize() {
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
    console.log("Database indexes created")
  }

  async storeTokenPrice(priceData) {
    try {
      const document = {
        ...priceData,
        storedAt: new Date(),
        _id: `${priceData.token}_${priceData.network}_${priceData.timestamp || "current"}`,
      }

      await this.collections.prices.replaceOne({ _id: document._id }, document, { upsert: true })

      // Also store token metadata if not exists
      if (priceData.metadata) {
        await this.storeTokenMetadata(priceData.token, priceData.network, priceData.metadata)
      }

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
    try {
      const query = { token: token.toLowerCase(), network }

      if (timestamp) {
        query.timestamp = timestamp
      } else {
        // Get most recent price
        const result = await this.collections.prices.findOne(query, { sort: { timestamp: -1 } })
        return result
      }

      return await this.collections.prices.findOne(query)
    } catch (error) {
      console.error("Error getting token price:", error)
      return null
    }
  }

  async getNearestPrices(token, network, targetTimestamp, limit = config.interpolation.maxDataPoints) {
    try {
      const targetDate = new Date(targetTimestamp)

      // Get prices before and after the target timestamp
      const [beforePrices, afterPrices] = await Promise.all([
        this.collections.prices
          .find({
            token: token.toLowerCase(),
            network,
            timestamp: { $lt: targetDate.toISOString() },
          })
          .sort({ timestamp: -1 })
          .limit(limit / 2)
          .toArray(),

        this.collections.prices
          .find({
            token: token.toLowerCase(),
            network,
            timestamp: { $gt: targetDate.toISOString() },
          })
          .sort({ timestamp: 1 })
          .limit(limit / 2)
          .toArray(),
      ])

      return [...beforePrices, ...afterPrices].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    } catch (error) {
      console.error("Error getting nearest prices:", error)
      return []
    }
  }

  async storeTokenMetadata(token, network, metadata) {
    try {
      const document = {
        token: token.toLowerCase(),
        network,
        ...metadata,
        updatedAt: new Date(),
      }

      await this.collections.metadata.replaceOne({ token: token.toLowerCase(), network }, document, { upsert: true })

      return true
    } catch (error) {
      console.error("Error storing token metadata:", error)
      return false
    }
  }

  async getAllTokens() {
    try {
      return await this.collections.tokens.find({}).toArray()
    } catch (error) {
      console.error("Error getting all tokens:", error)
      return []
    }
  }

  async addToken(token, network, creationDate) {
    try {
      const document = {
        token: token.toLowerCase(),
        network,
        creationDate, // Store the creation date
        addedAt: new Date(),
      }

      await this.collections.tokens.replaceOne({ token: token.toLowerCase(), network }, document, { upsert: true })

      return true
    } catch (error) {
      console.error("Error adding token:", error)
      return false
    }
  }

  async getPriceHistory(token, network, startDate, endDate) {
    try {
      return await this.collections.prices
        .find({
          token: token.toLowerCase(),
          network,
          timestamp: {
            $gte: startDate,
            $lte: endDate,
          },
        })
        .sort({ timestamp: 1 })
        .toArray()
    } catch (error) {
      console.error("Error getting price history:", error)
      return []
    }
  }

  async storeHistoricalPrice(priceData) {
    try {
      const date = new Date(priceData.timestamp).toISOString().split("T")[0] // YYYY-MM-DD
      const historicalKey = `${priceData.token}_${priceData.network}_${date}`

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

  async archiveOldData(daysOld = config.dataLifecycle.archive.thresholdDays) {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysOld)

      const oldData = await this.collections.prices
        .find({
          createdAt: { $lt: cutoffDate },
        })
        .toArray()

      if (oldData.length > 0) {
        const archivedCollection = this.collections.archived
        await archivedCollection.insertMany(
          oldData.map((doc) => ({
            ...doc,
            archivedAt: new Date(),
            compressed: config.dataLifecycle.archive.compressionEnabled,
          })),
        )

        await this.collections.prices.deleteMany({
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

  async getCacheStats(days = 7) {
    try {
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      const stats = await this.collections.cacheStats
        .find({
          _id: {
            $gte: startDate.toISOString().split("T")[0],
            $lte: endDate.toISOString().split("T")[0],
          },
        })
        .toArray()

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
}
