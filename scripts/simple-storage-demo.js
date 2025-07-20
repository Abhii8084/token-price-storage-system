// Simple demonstration of the storage concepts without external dependencies

console.log("🚀 Token Price Storage System Demo\n")

// Simulate Redis-like cache with TTL
class SimpleCache {
  constructor() {
    this.data = new Map()
    this.ttl = new Map()
  }

  set(key, value, ttlSeconds = 300) {
    this.data.set(key, value)
    if (ttlSeconds > 0) {
      this.ttl.set(key, Date.now() + ttlSeconds * 1000)
    }
    return true
  }

  get(key) {
    // Check if expired
    const expiry = this.ttl.get(key)
    if (expiry && Date.now() > expiry) {
      this.data.delete(key)
      this.ttl.delete(key)
      return null
    }
    return this.data.get(key) || null
  }

  delete(key) {
    this.data.delete(key)
    this.ttl.delete(key)
    return true
  }

  size() {
    return this.data.size
  }

  cleanup() {
    let cleaned = 0
    for (const [key, expiry] of this.ttl.entries()) {
      if (Date.now() > expiry) {
        this.data.delete(key)
        this.ttl.delete(key)
        cleaned++
      }
    }
    return cleaned
  }
}

// Simulate MongoDB-like persistent storage
class SimpleDatabase {
  constructor() {
    this.collections = {
      prices: new Map(),
      historical: new Map(),
      metadata: new Map(),
      analytics: new Map(),
    }
  }

  insert(collection, document) {
    if (!this.collections[collection]) {
      this.collections[collection] = new Map()
    }

    const id = document._id || `${Date.now()}_${Math.random()}`
    document._id = id
    document.createdAt = new Date()

    this.collections[collection].set(id, document)
    return id
  }

  find(collection, query = {}) {
    if (!this.collections[collection]) return []

    const results = []
    for (const doc of this.collections[collection].values()) {
      let matches = true
      for (const [key, value] of Object.entries(query)) {
        if (doc[key] !== value) {
          matches = false
          break
        }
      }
      if (matches) results.push(doc)
    }
    return results
  }

  update(collection, query, update) {
    const docs = this.find(collection, query)
    let updated = 0

    for (const doc of docs) {
      Object.assign(doc, update, { updatedAt: new Date() })
      updated++
    }
    return updated
  }

  stats(collection) {
    const coll = this.collections[collection]
    return {
      count: coll ? coll.size : 0,
      size: coll ? JSON.stringify([...coll.values()]).length : 0,
    }
  }
}

// Demo the storage system
async function runDemo() {
  console.log("Initializing storage components...")

  const cache = new SimpleCache()
  const db = new SimpleDatabase()

  console.log("✅ Cache and database initialized\n")

  // Demo 1: Basic caching
  console.log("📋 Demo 1: Basic Token Price Caching")
  console.log("=====================================")

  const tokenPrice = {
    token: "0x1234567890123456789012345678901234567890",
    network: "ethereum",
    symbol: "DEMO",
    price: { usd: 42.5 },
    timestamp: new Date().toISOString(),
  }

  // Store in cache with 5 second TTL
  const cacheKey = `price:${tokenPrice.network}:${tokenPrice.token}`
  cache.set(cacheKey, tokenPrice, 5)
  console.log("💾 Stored in cache with 5s TTL")

  // Store in database for persistence
  db.insert("prices", { ...tokenPrice, _id: cacheKey })
  console.log("💾 Stored in database for persistence")

  // Retrieve from cache
  let retrieved = cache.get(cacheKey)
  console.log("📖 Retrieved from cache:", retrieved ? "✅ HIT" : "❌ MISS")
  if (retrieved) {
    console.log(`   Price: $${retrieved.price.usd}`)
  }

  console.log("\n⏳ Waiting 6 seconds for cache expiration...")
  await new Promise((resolve) => setTimeout(resolve, 6000))

  // Try cache again (should be expired)
  retrieved = cache.get(cacheKey)
  console.log("📖 Retrieved from cache after expiration:", retrieved ? "✅ HIT" : "❌ MISS")

  // Fallback to database
  const dbResults = db.find("prices", { token: tokenPrice.token })
  console.log("📖 Fallback to database:", dbResults.length > 0 ? "✅ FOUND" : "❌ NOT FOUND")
  if (dbResults.length > 0) {
    console.log(`   Price: $${dbResults[0].price.usd}`)
  }

  console.log("\n📋 Demo 2: Storage Strategies")
  console.log("=============================")

  // Hot data (current prices) - short TTL
  const hotData = { ...tokenPrice, strategy: "hot" }
  cache.set(`hot:${cacheKey}`, hotData, 300) // 5 minutes
  db.insert("prices", { ...hotData, _id: `hot:${cacheKey}` })
  console.log("🔥 Hot data stored (5min TTL)")

  // Warm data (recent historical) - medium TTL
  const warmData = { ...tokenPrice, strategy: "warm", timestamp: new Date(Date.now() - 3600000).toISOString() }
  cache.set(`warm:${cacheKey}`, warmData, 3600) // 1 hour
  db.insert("historical", { ...warmData, _id: `warm:${cacheKey}` })
  console.log("🌡️  Warm data stored (1hr TTL)")

  // Cold data (old historical) - no cache, DB only
  const coldData = { ...tokenPrice, strategy: "cold", timestamp: new Date(Date.now() - 86400000).toISOString() }
  db.insert("historical", { ...coldData, _id: `cold:${cacheKey}` })
  console.log("🧊 Cold data stored (DB only)")

  console.log("\n📋 Demo 3: Performance Metrics")
  console.log("===============================")

  // Simulate some cache operations
  let hits = 0,
    misses = 0

  for (let i = 0; i < 100; i++) {
    const testKey = `test:${i}`

    if (i < 70) {
      // Store 70% of keys
      cache.set(testKey, { value: i }, 60)
    }

    // Try to retrieve all 100 keys
    const result = cache.get(testKey)
    if (result) hits++
    else misses++
  }

  const hitRate = (hits / (hits + misses)) * 100
  console.log(`📊 Cache Performance:`)
  console.log(`   Hits: ${hits}`)
  console.log(`   Misses: ${misses}`)
  console.log(`   Hit Rate: ${hitRate.toFixed(1)}%`)

  console.log("\n📋 Demo 4: Storage Statistics")
  console.log("=============================")

  console.log("💾 Cache Statistics:")
  console.log(`   Active Keys: ${cache.size()}`)
  console.log(`   Memory Usage: ~${JSON.stringify([...cache.data.values()]).length} bytes`)

  console.log("\n💾 Database Statistics:")
  Object.entries(db.collections).forEach(([name, collection]) => {
    const stats = db.stats(name)
    console.log(`   ${name}: ${stats.count} documents, ~${stats.size} bytes`)
  })

  console.log("\n📋 Demo 5: Data Lifecycle")
  console.log("=========================")

  // Add some expired entries
  cache.set("expired1", { data: "old" }, -1) // Already expired
  cache.set("expired2", { data: "old" }, 0.1) // Expires in 0.1 seconds

  await new Promise((resolve) => setTimeout(resolve, 200))

  const cleanedCount = cache.cleanup()
  console.log(`🧹 Cleaned up ${cleanedCount} expired cache entries`)

  console.log("\n🎉 Demo completed successfully!")
  console.log("\n📝 Key Concepts Demonstrated:")
  console.log("   ✅ Multi-tier storage (Cache + Database)")
  console.log("   ✅ TTL-based cache expiration")
  console.log("   ✅ Storage strategies (Hot/Warm/Cold)")
  console.log("   ✅ Cache hit/miss handling")
  console.log("   ✅ Performance monitoring")
  console.log("   ✅ Data lifecycle management")
}

// Run the demo
runDemo().catch(console.error)
