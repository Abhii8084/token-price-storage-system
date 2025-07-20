// Simple environment configuration test without external dependencies
console.log("🔧 Environment Configuration Test")
console.log("=================================\n")

// Check if .env file exists
import { readFileSync, existsSync } from "fs"

if (existsSync(".env")) {
  console.log("✅ .env file found")
  try {
    const envContent = readFileSync(".env", "utf8")
    const envLines = envContent.split("\n").filter((line) => line.trim() && !line.startsWith("#"))
    console.log(`📄 Found ${envLines.length} environment variables in .env file\n`)
  } catch (error) {
    console.log("⚠️  Could not read .env file:", error.message)
  }
} else {
  console.log("❌ .env file not found - using default values\n")
}

// Test basic environment variables
console.log("📋 Environment Variables Status:")
console.log("================================")

const testVars = [
  { name: "NODE_ENV", value: process.env.NODE_ENV || "development", required: false },
  { name: "PORT", value: process.env.PORT || "3001", required: false },
  { name: "APP_NAME", value: process.env.APP_NAME || "token-price-storage-system", required: false },
  { name: "LOG_LEVEL", value: process.env.LOG_LEVEL || "info", required: false },

  // Redis
  { name: "REDIS_HOST", value: process.env.REDIS_HOST || "localhost", required: false },
  { name: "REDIS_PORT", value: process.env.REDIS_PORT || "6379", required: false },
  { name: "REDIS_URL", value: process.env.REDIS_URL || "redis://localhost:6379", required: true },

  // MongoDB
  { name: "MONGODB_HOST", value: process.env.MONGODB_HOST || "localhost", required: false },
  { name: "MONGODB_PORT", value: process.env.MONGODB_PORT || "27017", required: false },
  { name: "MONGODB_URL", value: process.env.MONGODB_URL || "mongodb://localhost:27017", required: true },
  { name: "MONGODB_DATABASE", value: process.env.MONGODB_DATABASE || "token_price_storage", required: false },

  // Alchemy
  { name: "ALCHEMY_API_KEY", value: process.env.ALCHEMY_API_KEY || "your_alchemy_api_key_here", required: true },
  {
    name: "ALCHEMY_BASE_URL",
    value: process.env.ALCHEMY_BASE_URL || "https://eth-mainnet.g.alchemy.com/v2",
    required: false,
  },

  // Cache TTL
  { name: "CACHE_TTL_CURRENT_PRICE", value: process.env.CACHE_TTL_CURRENT_PRICE || "300", required: false },
  { name: "CACHE_TTL_HISTORICAL_PRICE", value: process.env.CACHE_TTL_HISTORICAL_PRICE || "3600", required: false },

  // Security
  { name: "JWT_SECRET", value: process.env.JWT_SECRET || "your-super-secret-jwt-key-here", required: true },
  { name: "API_KEYS", value: process.env.API_KEYS || "dev-key-123", required: false },
]

let requiredMissing = 0
let totalConfigured = 0

testVars.forEach(({ name, value, required }) => {
  const isDefault = value.includes("your_") || value.includes("dev-key") || value.includes("localhost")
  const isSet = process.env[name] !== undefined

  if (isSet) totalConfigured++

  let status = "✅"
  let note = ""

  if (required && (isDefault || !isSet)) {
    status = "❌"
    note = " (REQUIRED - using default)"
    requiredMissing++
  } else if (isDefault) {
    status = "⚠️ "
    note = " (using default)"
  }

  const displayValue =
    name.includes("KEY") || name.includes("SECRET") || name.includes("PASSWORD")
      ? value.length > 10
        ? `${value.substring(0, 10)}...`
        : value
      : value

  console.log(`  ${status} ${name}: ${displayValue}${note}`)
})

console.log(`\n📊 Summary: ${totalConfigured}/${testVars.length} variables configured`)

if (requiredMissing > 0) {
  console.log(`❌ ${requiredMissing} required variables are missing or using defaults`)
} else {
  console.log("✅ All required variables are properly configured")
}

// Test configuration parsing
console.log("\n📋 Parsed Configuration:")
console.log("========================")

const config = {
  app: {
    name: process.env.APP_NAME || "token-price-storage-system",
    env: process.env.NODE_ENV || "development",
    port: Number.parseInt(process.env.PORT) || 3001,
  },
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number.parseInt(process.env.REDIS_PORT) || 6379,
    maxMemory: process.env.REDIS_MAX_MEMORY || "2gb",
  },
  mongodb: {
    database: process.env.MONGODB_DATABASE || "token_price_storage",
    maxPoolSize: Number.parseInt(process.env.MONGODB_MAX_POOL_SIZE) || 10,
  },
  cache: {
    currentPriceTTL: Number.parseInt(process.env.CACHE_TTL_CURRENT_PRICE) || 300,
    historicalPriceTTL: Number.parseInt(process.env.CACHE_TTL_HISTORICAL_PRICE) || 3600,
  },
  networks: (process.env.SUPPORTED_NETWORKS || "ethereum,polygon,arbitrum,optimism").split(","),
  performance: {
    batchSize: Number.parseInt(process.env.BATCH_SIZE_DEFAULT) || 1000,
    maxConcurrent: Number.parseInt(process.env.CONCURRENT_OPERATIONS_MAX) || 10,
  },
}

console.log("Application:")
console.log(`  Name: ${config.app.name}`)
console.log(`  Environment: ${config.app.env}`)
console.log(`  Port: ${config.app.port}`)

console.log("\nRedis:")
console.log(`  Host: ${config.redis.host}:${config.redis.port}`)
console.log(`  Max Memory: ${config.redis.maxMemory}`)

console.log("\nMongoDB:")
console.log(`  Database: ${config.mongodb.database}`)
console.log(`  Max Pool Size: ${config.mongodb.maxPoolSize}`)

console.log("\nCache TTL:")
console.log(`  Current Price: ${config.cache.currentPriceTTL}s (${Math.round(config.cache.currentPriceTTL / 60)}min)`)
console.log(
  `  Historical Price: ${config.cache.historicalPriceTTL}s (${Math.round(config.cache.historicalPriceTTL / 60)}min)`,
)

console.log("\nSupported Networks:")
console.log(`  ${config.networks.join(", ")}`)

console.log("\nPerformance:")
console.log(`  Batch Size: ${config.performance.batchSize}`)
console.log(`  Max Concurrent: ${config.performance.maxConcurrent}`)

// Environment-specific recommendations
console.log("\n💡 Recommendations:")
console.log("===================")

if (config.app.env === "development") {
  console.log("Development Environment:")
  console.log("  ✅ Using development defaults is OK")
  console.log("  💡 Consider setting ALCHEMY_API_KEY for real data")
  console.log("  💡 Redis and MongoDB can use localhost")
} else if (config.app.env === "production") {
  console.log("Production Environment:")
  if (process.env.JWT_SECRET === "your-super-secret-jwt-key-here") {
    console.log("  ❌ MUST set a strong JWT_SECRET")
  }
  if (process.env.ALCHEMY_API_KEY === "your_alchemy_api_key_here") {
    console.log("  ❌ MUST set real ALCHEMY_API_KEY")
  }
  if (process.env.REDIS_URL === "redis://localhost:6379") {
    console.log("  ⚠️  Consider using managed Redis service")
  }
  if (process.env.MONGODB_URL === "mongodb://localhost:27017") {
    console.log("  ⚠️  Consider using managed MongoDB service")
  }
  console.log("  💡 Enable monitoring and analytics")
  console.log("  💡 Set up proper logging and error handling")
}

console.log("\n📝 Next Steps:")
console.log("==============")
console.log("1. Copy .env file and customize values:")
console.log("   cp .env .env.local")
console.log("2. Set your Alchemy API key")
console.log("3. Configure Redis and MongoDB connections")
console.log("4. Adjust cache TTL values for your use case")
console.log("5. Set strong secrets for production")

console.log("\n🎯 Test completed!")
