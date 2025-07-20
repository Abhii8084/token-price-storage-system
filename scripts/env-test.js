import dotenv from "dotenv"

// Load environment variables
dotenv.config()

// Simple config object without external imports
const config = {
  app: {
    name: process.env.APP_NAME || "token-price-storage-system",
    env: process.env.NODE_ENV || "development",
    port: Number.parseInt(process.env.PORT) || 3001,
    logLevel: process.env.LOG_LEVEL || "info",
  },
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number.parseInt(process.env.REDIS_PORT) || 6379,
    url: process.env.REDIS_URL || "redis://localhost:6379",
    maxMemory: process.env.REDIS_MAX_MEMORY || "2gb",
    maxRetries: Number.parseInt(process.env.REDIS_MAX_RETRIES) || 10,
  },
  mongodb: {
    host: process.env.MONGODB_HOST || "localhost",
    port: Number.parseInt(process.env.MONGODB_PORT) || 27017,
    database: process.env.MONGODB_DATABASE || "token_price_storage",
    url: process.env.MONGODB_URL || "mongodb://localhost:27017",
    maxPoolSize: Number.parseInt(process.env.MONGODB_MAX_POOL_SIZE) || 10,
    collections: {
      prices: process.env.MONGODB_COLLECTION_PRICES || "token_prices",
      historical: process.env.MONGODB_COLLECTION_HISTORICAL || "historical_prices",
      metadata: process.env.MONGODB_COLLECTION_METADATA || "token_metadata",
    },
  },
  cache: {
    ttl: {
      currentPrice: Number.parseInt(process.env.CACHE_TTL_CURRENT_PRICE) || 300,
      historicalPrice: Number.parseInt(process.env.CACHE_TTL_HISTORICAL_PRICE) || 3600,
      tokenMetadata: Number.parseInt(process.env.CACHE_TTL_TOKEN_METADATA) || 86400,
    },
  },
  alchemy: {
    apiKey: process.env.ALCHEMY_API_KEY || "your_alchemy_api_key_here",
    baseUrl: process.env.ALCHEMY_BASE_URL || "https://eth-mainnet.g.alchemy.com/v2",
    maxRetries: Number.parseInt(process.env.ALCHEMY_MAX_RETRIES) || 3,
    rateLimitPerSecond: Number.parseInt(process.env.ALCHEMY_RATE_LIMIT_PER_SECOND) || 5,
  },
  networks: {
    supported: (process.env.SUPPORTED_NETWORKS || "ethereum,polygon,arbitrum,optimism").split(","),
  },
  performance: {
    batchSizeDefault: Number.parseInt(process.env.BATCH_SIZE_DEFAULT) || 1000,
    concurrentOperationsMax: Number.parseInt(process.env.CONCURRENT_OPERATIONS_MAX) || 10,
    cacheWarmingEnabled: process.env.CACHE_WARMING_ENABLED === "true",
    compressionEnabled: process.env.COMPRESSION_ENABLED === "true",
    monitoringEnabled: process.env.MONITORING_ENABLED === "true",
  },
  security: {
    apiKeyHeader: process.env.API_KEY_HEADER || "x-api-key",
    corsOrigin: (process.env.CORS_ORIGIN || "http://localhost:3000").split(","),
    jwt: {
      secret: process.env.JWT_SECRET || "your-super-secret-jwt-key-here",
      expiresIn: process.env.JWT_EXPIRES_IN || "24h",
    },
  },
  monitoring: {
    enabled: process.env.METRICS_ENABLED === "true",
    port: Number.parseInt(process.env.METRICS_PORT) || 9090,
    healthCheck: {
      enabled: process.env.HEALTH_CHECK_ENABLED === "true",
    },
    analytics: {
      enabled: process.env.ANALYTICS_ENABLED === "true",
    },
  },
}

function validateConfig() {
  const errors = []

  // Check required fields
  if (!config.alchemy.apiKey || config.alchemy.apiKey === "your_alchemy_api_key_here") {
    errors.push("ALCHEMY_API_KEY is required")
  }

  if (config.app.env === "production") {
    if (!config.security.jwt.secret || config.security.jwt.secret === "your-super-secret-jwt-key-here") {
      errors.push("JWT_SECRET must be set in production")
    }
  }

  return errors
}

console.log("🔧 Environment Configuration Test")
console.log("=================================\n")

// Test configuration loading
console.log("📋 Configuration Summary:")
console.log(`Application: ${config.app.name}`)
console.log(`Environment: ${config.app.env}`)
console.log(`Port: ${config.app.port}`)
console.log(`Log Level: ${config.app.logLevel}\n`)

console.log("📋 Redis Configuration:")
console.log(`Host: ${config.redis.host}:${config.redis.port}`)
console.log(`Database: ${config.redis.url}`)
console.log(`Max Memory: ${config.redis.maxMemory}`)
console.log(`Max Retries: ${config.redis.maxRetries}\n`)

console.log("📋 MongoDB Configuration:")
console.log(`Host: ${config.mongodb.host}:${config.mongodb.port}`)
console.log(`Database: ${config.mongodb.database}`)
console.log(`Max Pool Size: ${config.mongodb.maxPoolSize}`)
console.log(`Collections:`)
Object.entries(config.mongodb.collections).forEach(([key, name]) => {
  console.log(`  ${key}: ${name}`)
})
console.log()

console.log("📋 Cache TTL Configuration:")
Object.entries(config.cache.ttl).forEach(([key, value]) => {
  console.log(`  ${key}: ${value}s (${Math.round(value / 60)}min)`)
})
console.log()

console.log("📋 Alchemy Configuration:")
console.log(`API Key: ${config.alchemy.apiKey.substring(0, 10)}...`)
console.log(`Base URL: ${config.alchemy.baseUrl}`)
console.log(`Max Retries: ${config.alchemy.maxRetries}`)
console.log(`Rate Limit: ${config.alchemy.rateLimitPerSecond}/sec\n`)

console.log("📋 Supported Networks:")
console.log(`${config.networks.supported.join(", ")}\n`)

console.log("📋 Data Lifecycle Configuration:")
console.log("Retention Policies:")
// Object.entries(config.dataLifecycle.retention).forEach(([key, value]) => {
//   console.log(`  ${key}: ${value} days`)
// })
console.log("Schedules:")
// Object.entries(config.dataLifecycle.schedules).forEach(([key, value]) => {
//   console.log(`  ${key}: ${value}`)
// })
console.log()

console.log("📋 Performance Configuration:")
console.log(`Batch Size: ${config.performance.batchSizeDefault}`)
console.log(`Max Concurrent Operations: ${config.performance.concurrentOperationsMax}`)
console.log(`Cache Warming: ${config.performance.cacheWarmingEnabled}`)
console.log(`Compression: ${config.performance.compressionEnabled}`)
console.log(`Monitoring: ${config.performance.monitoringEnabled}\n`)

console.log("📋 Security Configuration:")
console.log(`API Key Header: ${config.security.apiKeyHeader}`)
console.log(`CORS Origins: ${config.security.corsOrigin.join(", ")}`)
console.log(`JWT Expires In: ${config.security.jwt.expiresIn}\n`)

console.log("📋 Monitoring Configuration:")
console.log(`Metrics Enabled: ${config.monitoring.enabled}`)
console.log(`Metrics Port: ${config.monitoring.port}`)
console.log(`Health Check: ${config.monitoring.healthCheck.enabled}`)
console.log(`Analytics: ${config.monitoring.analytics.enabled}\n`)

// Validate configuration
console.log("🔍 Configuration Validation:")
console.log("============================")
const validationErrors = validateConfig()

if (validationErrors.length === 0) {
  console.log("✅ All configuration is valid!")
} else {
  console.log("❌ Configuration validation failed!")
  validationErrors.forEach((error) => console.log(`  - ${error}`))
}

console.log("\n🎯 Environment Variables Status:")
console.log("================================")

const requiredEnvVars = ["ALCHEMY_API_KEY", "REDIS_URL", "MONGODB_URL"]

const optionalEnvVars = [
  "NODE_ENV",
  "PORT",
  "LOG_LEVEL",
  "CACHE_TTL_CURRENT_PRICE",
  "MONGODB_MAX_POOL_SIZE",
  "QUEUE_PRICE_PROCESSING_CONCURRENCY",
]

console.log("Required Variables:")
requiredEnvVars.forEach((varName) => {
  const value = process.env[varName]
  const status = value ? "✅" : "❌"
  const displayValue = value
    ? varName.includes("KEY") || varName.includes("SECRET")
      ? `${value.substring(0, 10)}...`
      : value
    : "NOT SET"
  console.log(`  ${status} ${varName}: ${displayValue}`)
})

console.log("\nOptional Variables (showing non-default values):")
optionalEnvVars.forEach((varName) => {
  const value = process.env[varName]
  if (value) {
    console.log(`  ✅ ${varName}: ${value}`)
  }
})

console.log("\n📝 Configuration Tips:")
console.log("======================")
console.log("1. Copy .env.example to .env and update values")
console.log("2. Set ALCHEMY_API_KEY for production use")
console.log("3. Configure Redis and MongoDB URLs for your environment")
console.log("4. Adjust cache TTL values based on your needs")
console.log("5. Enable monitoring in production")
console.log("6. Set strong JWT_SECRET in production")
