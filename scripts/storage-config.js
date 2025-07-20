export const StorageConfig = {
  // Redis Configuration
  redis: {
    // Connection settings
    connection: {
      url: process.env.REDIS_URL || "redis://localhost:6379",
      retry_strategy: {
        max_attempts: 10,
        max_delay: 3000,
        initial_delay: 100,
      },
    },

    // TTL settings for different data types
    ttl: {
      current_price: 300, // 5 minutes
      historical_price: 3600, // 1 hour
      token_metadata: 86400, // 24 hours
      interpolated_price: 1800, // 30 minutes
      batch_results: 7200, // 2 hours
      analytics: 3600, // 1 hour
      user_session: 1800, // 30 minutes
    },

    // Key patterns
    key_patterns: {
      price: "token_price:{network}:{token}:{timestamp?}",
      metadata: "token_meta:{network}:{token}",
      batch: "batch_result:{batch_id}",
      analytics: "analytics:{token}:{network}:{period}",
      session: "session:{user_id}",
    },

    // Memory management
    memory: {
      max_memory_policy: "allkeys-lru",
      max_memory: "2gb",
    },
  },

  // MongoDB Configuration
  mongodb: {
    // Connection settings
    connection: {
      url: process.env.MONGODB_URL || "mongodb://localhost:27017",
      options: {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        maxIdleTimeMS: 30000,
        retryWrites: true,
        w: "majority",
      },
    },

    // Database and collection names
    database: "token_price_storage",
    collections: {
      prices: "token_prices",
      historical: "historical_prices",
      metadata: "token_metadata",
      tokens: "tokens",
      interpolated: "interpolated_prices",
      analytics: "price_analytics",
      cache_stats: "cache_statistics",
      archived: "archived_prices",
      batch_jobs: "batch_jobs",
    },

    // Index configurations
    indexes: {
      prices: [
        { fields: { token: 1, network: 1, timestamp: 1 }, options: { unique: true } },
        { fields: { token: 1, network: 1 }, options: {} },
        { fields: { timestamp: 1 }, options: {} },
        { fields: { "price.usd": 1 }, options: {} },
        { fields: { createdAt: 1 }, options: { expireAfterSeconds: 2592000 } }, // 30 days
      ],
      historical: [
        { fields: { token: 1, network: 1, date: 1 }, options: { unique: true } },
        { fields: { date: 1 }, options: {} },
      ],
      metadata: [
        { fields: { token: 1, network: 1 }, options: { unique: true } },
        { fields: { symbol: 1 }, options: {} },
      ],
    },

    // Data retention policies
    retention: {
      prices: 30, // days
      analytics: 7, // days
      cache_stats: 30, // days
      archived: 365, // days
    },
  },

  // Storage strategies
  strategies: {
    hot: {
      description: "Current and frequently accessed data",
      redis: { enabled: true, ttl: 300 },
      mongodb: { enabled: true, collection: "prices" },
    },
    warm: {
      description: "Recent historical data",
      redis: { enabled: true, ttl: 3600 },
      mongodb: { enabled: true, collection: "historical" },
    },
    cold: {
      description: "Old historical data",
      redis: { enabled: false },
      mongodb: { enabled: true, collection: "historical" },
    },
    archive: {
      description: "Very old data for compliance",
      redis: { enabled: false },
      mongodb: { enabled: true, collection: "archived", compressed: true },
    },
  },

  // Performance settings
  performance: {
    batch_size: 1000,
    concurrent_operations: 10,
    cache_warming_enabled: true,
    compression_enabled: true,
    monitoring_enabled: true,
  },
}
