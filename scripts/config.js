import dotenv from "dotenv"

// Load environment variables from .env file
dotenv.config()

// Helper function to parse boolean values
const parseBoolean = (value, defaultValue = false) => {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    return value.toLowerCase() === "true" || value === "1"
  }
  return defaultValue
}

// Helper function to parse integer values
const parseInteger = (value, defaultValue = 0) => {
  const parsed = Number.parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

// Helper function to parse array values
const parseArray = (value, defaultValue = []) => {
  if (!value) return defaultValue
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

export const config = {
  // Application Configuration
  app: {
    name: process.env.APP_NAME || "token-price-storage-system",
    env: process.env.NODE_ENV || "development",
    port: parseInteger(process.env.PORT, 3001),
    logLevel: process.env.LOG_LEVEL || "info",
    isDevelopment: (process.env.NODE_ENV || "development") === "development",
    isProduction: (process.env.NODE_ENV || "development") === "production",
  },

  // Redis Configuration
  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
    host: process.env.REDIS_HOST || "localhost",
    port: parseInteger(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInteger(process.env.REDIS_DB, 0),
    maxRetries: parseInteger(process.env.REDIS_MAX_RETRIES, 10),
    retryDelay: parseInteger(process.env.REDIS_RETRY_DELAY, 3000),
    maxMemory: process.env.REDIS_MAX_MEMORY || "2gb",
    maxMemoryPolicy: process.env.REDIS_MAX_MEMORY_POLICY || "allkeys-lru",
  },

  // Cache TTL Configuration
  cache: {
    ttl: {
      currentPrice: parseInteger(process.env.CACHE_TTL_CURRENT_PRICE, 300),
      historicalPrice: parseInteger(process.env.CACHE_TTL_HISTORICAL_PRICE, 3600),
      tokenMetadata: parseInteger(process.env.CACHE_TTL_TOKEN_METADATA, 86400),
      interpolatedPrice: parseInteger(process.env.CACHE_TTL_INTERPOLATED_PRICE, 1800),
      batchResults: parseInteger(process.env.CACHE_TTL_BATCH_RESULTS, 7200),
      analytics: parseInteger(process.env.CACHE_TTL_ANALYTICS, 3600),
      userSession: parseInteger(process.env.CACHE_TTL_USER_SESSION, 1800),
    },
  },

  // MongoDB Configuration
  mongodb: {
    url: process.env.MONGODB_URL || "mongodb://localhost:27017",
    host: process.env.MONGODB_HOST || "localhost",
    port: parseInteger(process.env.MONGODB_PORT, 27017),
    database: process.env.MONGODB_DATABASE || "token_price_storage",
    username: process.env.MONGODB_USERNAME || undefined,
    password: process.env.MONGODB_PASSWORD || undefined,
    authSource: process.env.MONGODB_AUTH_SOURCE || "admin",
    options: {
      maxPoolSize: parseInteger(process.env.MONGODB_MAX_POOL_SIZE, 10),
      minPoolSize: parseInteger(process.env.MONGODB_MIN_POOL_SIZE, 2),
      serverSelectionTimeoutMS: parseInteger(process.env.MONGODB_SERVER_SELECTION_TIMEOUT, 5000),
      socketTimeoutMS: parseInteger(process.env.MONGODB_SOCKET_TIMEOUT, 45000),
      maxIdleTimeMS: parseInteger(process.env.MONGODB_MAX_IDLE_TIME, 30000),
    },
    collections: {
      prices: process.env.MONGODB_COLLECTION_PRICES || "token_prices",
      historical: process.env.MONGODB_COLLECTION_HISTORICAL || "historical_prices",
      metadata: process.env.MONGODB_COLLECTION_METADATA || "token_metadata",
      tokens: process.env.MONGODB_COLLECTION_TOKENS || "tokens",
      interpolated: process.env.MONGODB_COLLECTION_INTERPOLATED || "interpolated_prices",
      analytics: process.env.MONGODB_COLLECTION_ANALYTICS || "price_analytics",
      cacheStats: process.env.MONGODB_COLLECTION_CACHE_STATS || "cache_statistics",
      archived: process.env.MONGODB_COLLECTION_ARCHIVED || "archived_prices",
      batchJobs: process.env.MONGODB_COLLECTION_BATCH_JOBS || "batch_jobs",
    },
  },

  // Alchemy API Configuration
  alchemy: {
    apiKey: process.env.ALCHEMY_API_KEY || "your_alchemy_api_key_here",
    baseUrl: process.env.ALCHEMY_BASE_URL || "https://eth-mainnet.g.alchemy.com/v2",
    webhookSecret: process.env.ALCHEMY_WEBHOOK_SECRET || "your_webhook_secret_here",
    maxRetries: parseInteger(process.env.ALCHEMY_MAX_RETRIES, 3),
    retryDelay: parseInteger(process.env.ALCHEMY_RETRY_DELAY, 1000),
    rateLimitPerSecond: parseInteger(process.env.ALCHEMY_RATE_LIMIT_PER_SECOND, 5),
  },

  // Supported Networks
  networks: {
    supported: parseArray(process.env.SUPPORTED_NETWORKS, ["ethereum", "polygon", "arbitrum", "optimism"]),
  },

  // Bull Queue Configuration
  queue: {
    redis: {
      host: process.env.BULL_REDIS_HOST || "localhost",
      port: parseInteger(process.env.BULL_REDIS_PORT, 6379),
      password: process.env.BULL_REDIS_PASSWORD || undefined,
      db: parseInteger(process.env.BULL_REDIS_DB, 1),
    },
    settings: {
      priceProcessingConcurrency: parseInteger(process.env.QUEUE_PRICE_PROCESSING_CONCURRENCY, 5),
      batchProcessingConcurrency: parseInteger(process.env.QUEUE_BATCH_PROCESSING_CONCURRENCY, 2),
      defaultJobAttempts: parseInteger(process.env.QUEUE_DEFAULT_JOB_ATTEMPTS, 3),
      defaultJobBackoff: process.env.QUEUE_DEFAULT_JOB_BACKOFF || "exponential",
      defaultJobDelay: parseInteger(process.env.QUEUE_DEFAULT_JOB_DELAY, 0),
    },
    names: {
      priceProcessing: process.env.QUEUE_NAME_PRICE_PROCESSING || "price-processing",
      batchProcessing: process.env.QUEUE_NAME_BATCH_PROCESSING || "batch-processing",
      analytics: process.env.QUEUE_NAME_ANALYTICS || "analytics-processing",
    },
  },

  // Data Lifecycle Configuration
  dataLifecycle: {
    retention: {
      pricesDays: parseInteger(process.env.DATA_RETENTION_PRICES_DAYS, 30),
      analyticsDays: parseInteger(process.env.DATA_RETENTION_ANALYTICS_DAYS, 7),
      cacheStatsDays: parseInteger(process.env.DATA_RETENTION_CACHE_STATS_DAYS, 30),
      archivedDays: parseInteger(process.env.DATA_RETENTION_ARCHIVED_DAYS, 365),
    },
    schedules: {
      cacheCleanup: process.env.SCHEDULE_CACHE_CLEANUP || "0 * * * *",
      dataArchival: process.env.SCHEDULE_DATA_ARCHIVAL || "0 3 * * *",
      cacheWarming: process.env.SCHEDULE_CACHE_WARMING || "0 */6 * * *",
      metricsCollection: process.env.SCHEDULE_METRICS_COLLECTION || "*/15 * * * *",
      dbOptimization: process.env.SCHEDULE_DB_OPTIMIZATION || "0 2 * * 0",
      dailyHistoricalFetch: process.env.SCHEDULE_DAILY_HISTORICAL_FETCH || "0 2 * * *", // New schedule
    },
    archive: {
      thresholdDays: parseInteger(process.env.ARCHIVE_THRESHOLD_DAYS, 90),
      compressionEnabled: parseBoolean(process.env.ARCHIVE_COMPRESSION_ENABLED, true),
      batchSize: parseInteger(process.env.ARCHIVE_BATCH_SIZE, 1000),
    },
  },

  // Performance Configuration
  performance: {
    batchSizeDefault: parseInteger(process.env.BATCH_SIZE_DEFAULT, 1000),
    concurrentOperationsMax: parseInteger(process.env.CONCURRENT_OPERATIONS_MAX, 10),
    cacheWarmingEnabled: parseBoolean(process.env.CACHE_WARMING_ENABLED, true),
    compressionEnabled: parseBoolean(process.env.COMPRESSION_ENABLED, true),
    monitoringEnabled: parseBoolean(process.env.MONITORING_ENABLED, true),
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInteger(process.env.RATE_LIMIT_WINDOW_MS, 60000),
    maxRequests: parseInteger(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
    skipSuccessfulRequests: parseBoolean(process.env.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS, false),
  },

  // Interpolation Engine Configuration
  interpolation: {
    maxDataPoints: parseInteger(process.env.INTERPOLATION_MAX_DATA_POINTS, 20),
    maxTimeGapHours: parseInteger(process.env.INTERPOLATION_MAX_TIME_GAP_HOURS, 24),
    minConfidenceThreshold: Number.parseFloat(process.env.INTERPOLATION_MIN_CONFIDENCE_THRESHOLD) || 0.3,
    extrapolationMaxChangePercent: parseInteger(process.env.INTERPOLATION_EXTRAPOLATION_MAX_CHANGE_PERCENT, 50),
  },

  // Security Configuration
  security: {
    apiKeyHeader: process.env.API_KEY_HEADER || "x-api-key",
    apiKeys: parseArray(process.env.API_KEYS, ["dev-key-123"]),
    corsOrigin: parseArray(process.env.CORS_ORIGIN, ["http://localhost:3000"]),
    corsCredentials: parseBoolean(process.env.CORS_CREDENTIALS, true),
    jwt: {
      secret: process.env.JWT_SECRET || "your-super-secret-jwt-key-here",
      expiresIn: process.env.JWT_EXPIRES_IN || "24h",
      issuer: process.env.JWT_ISSUER || "token-price-api",
    },
  },

  // Logging Configuration
  logging: {
    format: process.env.LOG_FORMAT || "combined",
    filePath: process.env.LOG_FILE_PATH || "./logs/app.log",
    errorFilePath: process.env.LOG_ERROR_FILE_PATH || "./logs/error.log",
    maxSize: process.env.LOG_MAX_SIZE || "10m",
    maxFiles: parseInteger(process.env.LOG_MAX_FILES, 5),
    datePattern: process.env.LOG_DATE_PATTERN || "YYYY-MM-DD",
  },

  // Monitoring & Analytics
  monitoring: {
    enabled: parseBoolean(process.env.METRICS_ENABLED, true),
    port: parseInteger(process.env.METRICS_PORT, 9090),
    path: process.env.METRICS_PATH || "/metrics",
    healthCheck: {
      enabled: parseBoolean(process.env.HEALTH_CHECK_ENABLED, true),
      path: process.env.HEALTH_CHECK_PATH || "/health",
      timeout: parseInteger(process.env.HEALTH_CHECK_TIMEOUT, 5000),
    },
    analytics: {
      enabled: parseBoolean(process.env.ANALYTICS_ENABLED, true),
      batchSize: parseInteger(process.env.ANALYTICS_BATCH_SIZE, 100),
      flushInterval: parseInteger(process.env.ANALYTICS_FLUSH_INTERVAL, 60000),
    },
  },

  // External Services
  external: {
    webhooks: {
      priceAlert: process.env.WEBHOOK_PRICE_ALERT || "",
      systemError: process.env.WEBHOOK_SYSTEM_ERROR || "",
      batchComplete: process.env.WEBHOOK_BATCH_COMPLETE || "",
    },
    email: {
      enabled: parseBoolean(process.env.EMAIL_ENABLED, false),
      smtp: {
        host: process.env.EMAIL_SMTP_HOST || "smtp.gmail.com",
        port: parseInteger(process.env.EMAIL_SMTP_PORT, 587),
        secure: parseBoolean(process.env.EMAIL_SMTP_SECURE, false),
        user: process.env.EMAIL_SMTP_USER || "",
        pass: process.env.EMAIL_SMTP_PASS || "",
      },
      from: process.env.EMAIL_FROM || "noreply@yourapp.com",
      admin: process.env.EMAIL_ADMIN || "admin@yourapp.com",
    },
  },

  // Development Configuration
  development: {
    debugEnabled: parseBoolean(process.env.DEBUG_ENABLED, true),
    debugNamespace: process.env.DEBUG_NAMESPACE || "token-price:*",
    mockExternalApis: parseBoolean(process.env.MOCK_EXTERNAL_APIS, false),
    seedDatabase: parseBoolean(process.env.SEED_DATABASE, true),
    enableApiDocs: parseBoolean(process.env.ENABLE_API_DOCS, true),
  },

  // Test Configuration
  test: {
    databaseUrl: process.env.TEST_DATABASE_URL || "mongodb://localhost:27017/token_price_test",
    redisUrl: process.env.TEST_REDIS_URL || "redis://localhost:6379/15",
    timeout: parseInteger(process.env.TEST_TIMEOUT, 30000),
  },
}

// Validate required configuration
export function validateConfig() {
  const errors = []

  // Check required fields
  if (!config.alchemy.apiKey || config.alchemy.apiKey === "your_alchemy_api_key_here") {
    errors.push("ALCHEMY_API_KEY is required")
  }
  if (!config.redis.url || config.redis.url.includes("localhost:6379")) {
    console.warn("REDIS_URL is using default/localhost. Ensure it's correct for your environment.")
  }
  if (!config.mongodb.url || config.mongodb.url.includes("localhost:27017")) {
    console.warn("MONGODB_URL is using default/localhost. Ensure it's correct for your environment.")
  }

  if (config.app.isProduction) {
    if (!config.security.jwt.secret || config.security.jwt.secret === "your-super-secret-jwt-key-here") {
      errors.push("JWT_SECRET must be set in production")
    }

    if (config.security.apiKeys.includes("dev-key-123")) {
      errors.push("Default API keys should not be used in production")
    }
  }

  if (errors.length > 0) {
    console.error("Configuration validation errors:")
    errors.forEach((error) => console.error(`  - ${error}`))

    if (config.app.isProduction) {
      process.exit(1)
    }
  }

  return errors.length === 0
}

// Export default config
export default config
