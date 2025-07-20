// Standalone configuration demonstration
console.log("🚀 Configuration System Demo")
console.log("============================\n")

// Simulate loading environment variables
const mockEnv = {
  NODE_ENV: "development",
  PORT: "3001",
  APP_NAME: "token-price-storage-system",
  REDIS_HOST: "localhost",
  REDIS_PORT: "6379",
  MONGODB_HOST: "localhost",
  MONGODB_PORT: "27017",
  CACHE_TTL_CURRENT_PRICE: "300",
  CACHE_TTL_HISTORICAL_PRICE: "3600",
  ALCHEMY_API_KEY: "demo_key_12345",
  SUPPORTED_NETWORKS: "ethereum,polygon,arbitrum",
}

// Helper functions
function parseBoolean(value, defaultValue = false) {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    return value.toLowerCase() === "true" || value === "1"
  }
  return defaultValue
}

function parseInteger(value, defaultValue = 0) {
  const parsed = Number.parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

function parseArray(value, defaultValue = []) {
  if (!value) return defaultValue
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

// Build configuration object
const config = {
  app: {
    name: mockEnv.APP_NAME || "token-price-storage-system",
    env: mockEnv.NODE_ENV || "development",
    port: parseInteger(mockEnv.PORT, 3001),
  },
  redis: {
    host: mockEnv.REDIS_HOST || "localhost",
    port: parseInteger(mockEnv.REDIS_PORT, 6379),
    url: `redis://${mockEnv.REDIS_HOST || "localhost"}:${mockEnv.REDIS_PORT || 6379}`,
  },
  mongodb: {
    host: mockEnv.MONGODB_HOST || "localhost",
    port: parseInteger(mockEnv.MONGODB_PORT, 27017),
    database: mockEnv.MONGODB_DATABASE || "token_price_storage",
    url: `mongodb://${mockEnv.MONGODB_HOST || "localhost"}:${mockEnv.MONGODB_PORT || 27017}`,
  },
  cache: {
    ttl: {
      currentPrice: parseInteger(mockEnv.CACHE_TTL_CURRENT_PRICE, 300),
      historicalPrice: parseInteger(mockEnv.CACHE_TTL_HISTORICAL_PRICE, 3600),
    },
  },
  alchemy: {
    apiKey: mockEnv.ALCHEMY_API_KEY || "your_alchemy_api_key_here",
  },
  networks: {
    supported: parseArray(mockEnv.SUPPORTED_NETWORKS, ["ethereum"]),
  },
}

// Demo the configuration system
console.log("📋 Configuration Loaded:")
console.log("========================")
console.log(JSON.stringify(config, null, 2))

console.log("\n🔍 Configuration Analysis:")
console.log("==========================")

// Analyze configuration
const analysis = {
  totalSettings: 0,
  defaultValues: 0,
  customValues: 0,
  issues: [],
}

function analyzeValue(key, value, defaultValue, isRequired = false) {
  analysis.totalSettings++

  if (value === defaultValue) {
    analysis.defaultValues++
    if (isRequired) {
      analysis.issues.push(`${key} is using default value but is required`)
    }
  } else {
    analysis.customValues++
  }
}

// Analyze each configuration section
analyzeValue("APP_NAME", config.app.name, "token-price-storage-system")
analyzeValue("NODE_ENV", config.app.env, "development")
analyzeValue("PORT", config.app.port, 3001)
analyzeValue("REDIS_HOST", config.redis.host, "localhost")
analyzeValue("MONGODB_HOST", config.mongodb.host, "localhost")
analyzeValue("ALCHEMY_API_KEY", config.alchemy.apiKey, "your_alchemy_api_key_here", true)

console.log(`Total Settings: ${analysis.totalSettings}`)
console.log(`Custom Values: ${analysis.customValues}`)
console.log(`Default Values: ${analysis.defaultValues}`)
console.log(`Configuration Coverage: ${Math.round((analysis.customValues / analysis.totalSettings) * 100)}%`)

if (analysis.issues.length > 0) {
  console.log("\n⚠️  Issues Found:")
  analysis.issues.forEach((issue) => console.log(`  - ${issue}`))
} else {
  console.log("\n✅ No configuration issues found")
}

// Demo different environment scenarios
console.log("\n🌍 Environment Scenarios:")
console.log("=========================")

const scenarios = [
  {
    name: "Development",
    env: { NODE_ENV: "development", ALCHEMY_API_KEY: "dev_key" },
    description: "Local development with mock services",
  },
  {
    name: "Staging",
    env: { NODE_ENV: "staging", ALCHEMY_API_KEY: "staging_key", REDIS_HOST: "staging-redis" },
    description: "Staging environment with external services",
  },
  {
    name: "Production",
    env: { NODE_ENV: "production", ALCHEMY_API_KEY: "prod_key", REDIS_HOST: "prod-redis", MONGODB_HOST: "prod-mongo" },
    description: "Production environment with managed services",
  },
]

scenarios.forEach((scenario) => {
  console.log(`\n${scenario.name} Environment:`)
  console.log(`  Description: ${scenario.description}`)
  console.log(`  Settings:`)
  Object.entries(scenario.env).forEach(([key, value]) => {
    console.log(`    ${key}: ${value}`)
  })
})

console.log("\n💡 Configuration Best Practices:")
console.log("=================================")
console.log("1. ✅ Use environment variables for all configuration")
console.log("2. ✅ Provide sensible defaults for development")
console.log("3. ✅ Validate required settings on startup")
console.log("4. ✅ Use different configs per environment")
console.log("5. ✅ Keep secrets out of code (use .env files)")
console.log("6. ✅ Document all configuration options")
console.log("7. ✅ Use type conversion for non-string values")

console.log("\n🎉 Configuration demo completed!")
