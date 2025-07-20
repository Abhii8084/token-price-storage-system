import cron from "node-cron"

export class DataLifecycleManager {
  constructor(dbManager, alchemyService, dataLifecycleConfig, performanceConfig, batchQueue) {
    this.dbManager = dbManager
    this.alchemyService = alchemyService
    this.dataLifecycleConfig = dataLifecycleConfig
    this.performanceConfig = performanceConfig
    this.batchQueue = batchQueue // Inject batchQueue
    this.isRunning = false
    this.jobs = new Map()
  }

  start() {
    if (this.isRunning) {
      console.log("Data lifecycle manager already running")
      return
    }

    this.scheduleJobs()
    this.isRunning = true
    console.log("Data lifecycle manager started")
  }

  stop() {
    this.jobs.forEach((job, name) => {
      job.stop()
      console.log(`Stopped job: ${name}`)
    })
    this.jobs.clear()
    this.isRunning = false
    console.log("Data lifecycle manager stopped")
  }

  scheduleJobs() {
    // Cache cleanup - every hour
    this.jobs.set(
      "cache_cleanup",
      cron.schedule(this.dataLifecycleConfig.schedules.cacheCleanup, async () => {
        console.log("Running cache cleanup...")
        try {
          // Redis TTL handles most cache cleanup. This can be for more complex logic if needed.
          console.log("Redis cache cleanup handled by TTL. No manual cleanup needed here.")
        } catch (error) {
          console.error("Cache cleanup failed:", error)
        }
      }),
    )

    // Data archival - daily at 3 AM
    this.jobs.set(
      "data_archival",
      cron.schedule(this.dataLifecycleConfig.schedules.dataArchival, async () => {
        console.log("Running data archival...")
        try {
          const archivedCount = await this.dbManager.archiveOldData(this.dataLifecycleConfig.archive.thresholdDays)
          console.log(`Data archival completed: ${archivedCount} records archived`)
        } catch (error) {
          console.error("Data archival failed:", error)
        }
      }),
    )

    // Cache warming - every 6 hours
    if (this.performanceConfig.cacheWarmingEnabled) {
      this.jobs.set(
        "cache_warming",
        cron.schedule(this.dataLifecycleConfig.schedules.cacheWarming, async () => {
          console.log("Running cache warming...")
          try {
            await this.warmPopularCache()
            console.log("Cache warming completed")
          } catch (error) {
            console.error("Cache warming failed:", error)
          }
        }),
      )
    }

    // Storage metrics collection - every 15 minutes
    if (this.performanceConfig.monitoringEnabled) {
      this.jobs.set(
        "metrics_collection",
        cron.schedule(this.dataLifecycleConfig.schedules.metricsCollection, async () => {
          try {
            console.log("Collecting storage metrics...")
            const metrics = await this.dbManager.getCacheStats(1) // Get today's stats
            // In a real app, you'd push these to a monitoring system or store them
            console.log("Metrics collected:", metrics)
          } catch (error) {
            console.error("Metrics collection failed:", error)
          }
        }),
      )
    }

    // Database optimization - weekly on Sunday at 2 AM
    this.jobs.set(
      "db_optimization",
      cron.schedule(this.dataLifecycleConfig.schedules.dbOptimization, async () => {
        console.log("Running database optimization...")
        try {
          // This would involve MongoDB commands like compact, reIndex
          console.log("Database optimization simulated.")
        } catch (error) {
          console.error("Database optimization failed:", error)
        }
      }),
    )

    // Daily batch processing for historical data
    this.jobs.set(
      "daily_historical_fetch",
      cron.schedule(this.dataLifecycleConfig.schedules.dailyHistoricalFetch || "0 2 * * *", async () => {
        console.log("Starting daily historical data fetch...")
        try {
          // Fetch all known tokens from DB
          const tokensInDb = await this.dbManager.getAllTokens()
          console.log(`Found ${tokensInDb.length} tokens for daily historical processing.`)

          for (const tokenData of tokensInDb) {
            const { token, network } = tokenData
            let actualCreationDate = tokenData.creationDate // Use stored creation date if available

            if (!actualCreationDate) {
              // If creation date is not stored, try to fetch it from Alchemy
              console.log(`Fetching creation date for new token: ${token} on ${network}`)
              actualCreationDate = await this.alchemyService.getTokenCreationDate(token, network)
              if (actualCreationDate) {
                // Store the newly found creation date in DB for future use
                await this.dbManager.addToken(token, network, actualCreationDate)
                console.log(`Stored creation date for ${token}: ${actualCreationDate}`)
              } else {
                // Fallback to a default if creation date cannot be determined
                actualCreationDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString() // Default to 1 year ago
                console.warn(`Could not determine creation date for ${token}, defaulting to 1 year ago.`)
              }
            }

            const today = new Date()
            today.setUTCHours(0, 0, 0, 0) // Normalize to start of day UTC

            const startDate = new Date(actualCreationDate)
            startDate.setUTCHours(0, 0, 0, 0) // Normalize to start of day UTC

            const timestampsToFetch = this.generateDailyTimestamps(startDate, today)

            // Queue a single batch job for this token's full history
            if (timestampsToFetch.length > 0) {
              console.log(`Queueing ${timestampsToFetch.length} historical requests for ${token} on ${network}`)
              await this.batchQueue.add("historical-batch", {
                token,
                network,
                startDate: timestampsToFetch[0],
                endDate: timestampsToFetch[timestampsToFetch.length - 1],
                requestId: `daily_fetch_${token}_${Date.now()}`,
              })
            }
          }
          console.log("Daily historical data fetch jobs queued.")
        } catch (error) {
          console.error("Daily historical data fetch failed:", error)
        }
      }),
    )

    console.log("All lifecycle jobs scheduled")
  }

  async warmPopularCache() {
    console.log("Simulating cache warming for popular tokens...")
    const demoTokens = [
      { token: "0x1f9840a85d5af5bf1d1762f925bdadgoe987654321", network: "ethereum" },
      { token: "0x2791bca1f2de4661ed88a30c99a7a9219567bc0e", network: "polygon" },
    ]

    for (const { token, network } of demoTokens) {
      const priceData = await this.alchemyService.getTokenPrice(token, network)
      if (priceData) {
        // In a real scenario, you'd use the Redis client directly here
        // await redisClient.setEx(generateCacheKey(token, network), config.cache.ttl.currentPrice, JSON.stringify(priceData));
        console.log(`Warmed cache for ${token} on ${network}`)
      }
    }
  }

  async processBatchHistorical(tokens, networks, startDate, endDate) {
    const results = {
      processed: 0,
      errors: 0,
      skipped: 0,
    }

    // Ensure tokens and networks are arrays for consistency
    const tokensToProcess = Array.isArray(tokens) ? tokens : [tokens]
    const networksToProcess = Array.isArray(networks) ? networks : [networks]

    for (const token of tokensToProcess) {
      for (const network of networksToProcess) {
        const timestamps = this.generateDailyTimestamps(new Date(startDate), new Date(endDate))
        const requests = timestamps.map((ts) => ({ token, network, timestamp: ts }))

        if (requests.length === 0) {
          console.log(`No timestamps to fetch for ${token} on ${network} between ${startDate} and ${endDate}`)
          continue
        }

        console.log(`Fetching ${requests.length} historical prices for ${token} on ${network} in batches...`)

        // Use batchGetTokenPrices for efficient fetching
        const fetchedPrices = await this.alchemyService.batchGetTokenPrices(requests)

        for (let i = 0; i < fetchedPrices.length; i++) {
          const price = fetchedPrices[i]
          const originalRequest = requests[i]

          try {
            // Check if we already have this data (important for idempotency)
            const existing = await this.dbManager.getTokenPrice(
              originalRequest.token,
              originalRequest.network,
              originalRequest.timestamp,
            )
            if (existing) {
              results.skipped++
              continue
            }

            if (price) {
              await this.dbManager.storeTokenPrice(price)
              results.processed++
            } else {
              results.errors++
              console.warn(
                `Could not fetch price for ${originalRequest.token} on ${originalRequest.network} at ${originalRequest.timestamp}`,
              )
            }
          } catch (error) {
            console.error(
              `Error storing price for ${originalRequest.token} on ${originalRequest.network} at ${originalRequest.timestamp}:`,
              error,
            )
            results.errors++
          }
        }
      }
    }

    return results
  }

  // Generates daily timestamps (midnight UTC) between two dates
  generateDailyTimestamps(startDate, endDate) {
    const timestamps = []
    const current = new Date(startDate)
    const end = new Date(endDate)

    // Ensure dates are normalized to UTC midnight for consistent daily buckets
    current.setUTCHours(0, 0, 0, 0)
    end.setUTCHours(0, 0, 0, 0)

    while (current.getTime() <= end.getTime()) {
      timestamps.push(current.toISOString())
      current.setUTCDate(current.getUTCDate() + 1) // Increment by day in UTC
    }

    return timestamps
  }
}
