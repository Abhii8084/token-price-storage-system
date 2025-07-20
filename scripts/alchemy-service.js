import { Alchemy, Network } from "alchemy-sdk"
import { config } from "./config.js"

export class AlchemyService {
  constructor() {
    this.config = {
      apiKey: config.alchemy.apiKey,
      network: Network.ETH_MAINNET, // Default network, will be overridden per request
    }

    this.networkMapping = {
      ethereum: Network.ETH_MAINNET,
      polygon: Network.MATIC_MAINNET,
      bsc: Network.BSC_MAINNET, // Assuming BSC is supported by Alchemy or a similar mapping
      avalanche: Network.AVAX_MAINNET, // Assuming Avalanche is supported
      arbitrum: Network.ARB_MAINNET,
      optimism: Network.OPT_MAINNET,
    }
  }

  getAlchemyInstance(network) {
    const alchemyNetwork = this.networkMapping[network.toLowerCase()]
    if (!alchemyNetwork) {
      throw new Error(`Unsupported network: ${network}`)
    }

    return new Alchemy({
      ...this.config,
      network: alchemyNetwork,
    })
  }

  async getTokenPrice(token, network, timestamp = null) {
    try {
      const alchemy = this.getAlchemyInstance(network)

      // Get token metadata
      const metadata = await alchemy.core.getTokenMetadata(token)
      if (!metadata || !metadata.symbol) {
        console.log(`Token metadata not found or incomplete for: ${token} on ${network}`)
        return null
      }

      let priceData

      if (timestamp) {
        // For historical prices, Alchemy's core API doesn't directly provide historical USD prices for tokens.
        // You would typically use a dedicated price API (e.g., CoinGecko, CoinMarketCap)
        // or query historical block data and calculate price from trades.
        // For this demo, we'll simulate historical data.
        priceData = await this.getHistoricalPrice(token, network, timestamp)
      } else {
        // For current prices, similarly, Alchemy's core API provides on-chain data, not direct USD prices.
        // You'd integrate with a price feed.
        priceData = await this.getCurrentPrice(token, network, metadata)
      }

      if (!priceData || priceData.usd === undefined || priceData.usd === null) {
        return null
      }

      return {
        token: token.toLowerCase(),
        network,
        timestamp: timestamp || new Date().toISOString(),
        symbol: metadata.symbol,
        name: metadata.name || "Unknown Token",
        decimals: metadata.decimals || 18,
        price: priceData,
        metadata: {
          totalSupply: metadata.totalSupply ? metadata.totalSupply.toString() : null,
          logo: metadata.logo,
        },
        source: "alchemy_simulated", // Indicate that price is simulated
        fetchedAt: new Date().toISOString(),
      }
    } catch (error) {
      console.error(`Error fetching price for ${token} on ${network}:`, error)
      return null
    }
  }

  async getCurrentPrice(token, network, metadata) {
    // Simulate current price
    // In a real app, integrate with a price feed API (e.g., CoinGecko, Chainlink Data Feeds)
    const basePrice = 0.1 + Math.random() * 99.9 // Random price between 0.1 and 100
    return {
      usd: Number.parseFloat(basePrice.toFixed(4)),
      lastUpdated: new Date().toISOString(),
    }
  }

  async getHistoricalPrice(token, network, timestamp) {
    // Simulate historical price based on current date and a random factor
    const targetDate = new Date(timestamp)
    const now = new Date()
    const daysDiff = Math.abs((now.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24))

    // Simulate price fluctuation and decay over time
    const basePrice = 0.1 + Math.random() * 99.9
    const historicalPrice = basePrice * (1 - daysDiff * 0.0005 * (Math.random() > 0.5 ? 1 : -1)) // Slight decay/increase

    return {
      usd: Number.parseFloat(Math.max(0.0001, historicalPrice).toFixed(4)), // Ensure price is not negative or too small
      lastUpdated: timestamp,
    }
  }

  async getTokenPriceWithRetry(token, network, timestamp, maxRetries = config.alchemy.maxRetries) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const price = await this.getTokenPrice(token, network, timestamp)
        if (price) {
          return price
        }
      } catch (error) {
        console.error(`Attempt ${attempt} failed for ${token} on ${network}:`, error.message)
        if (attempt === maxRetries) {
          throw error
        }
        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * config.alchemy.retryDelay))
      }
    }
    return null
  }

  async getTokenCreationDate(token, network) {
    try {
      const alchemy = this.getAlchemyInstance(network)

      // Query for the first asset transfer to approximate creation date
      const transfers = await alchemy.core.getAssetTransfers({
        contractAddresses: [token],
        category: ["erc20"],
        order: "asc", // Get the earliest transfer
        maxCount: 1, // Only need the first one
      })

      if (transfers.transfers && transfers.transfers.length > 0) {
        // Alchemy's getAssetTransfers returns blockNum. We need to get the block to find its timestamp.
        const firstTransfer = transfers.transfers[0]
        const block = await alchemy.core.getBlock(firstTransfer.blockNum)
        if (block && block.timestamp) {
          return new Date(block.timestamp * 1000).toISOString() // Convert Unix timestamp to ISO string
        }
      }

      return null
    } catch (error) {
      console.error(`Error getting creation date for ${token} on ${network}:`, error)
      return null
    }
  }

  async batchGetTokenPrices(requests) {
    const results = []
    const batchSize = config.performance.batchSizeDefault // Process in batches to avoid rate limits

    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize)
      const batchPromises = batch.map((req) => this.getTokenPrice(req.token, req.network, req.timestamp))

      try {
        const batchResults = await Promise.allSettled(batchPromises)
        results.push(...batchResults.map((result) => (result.status === "fulfilled" ? result.value : null)))

        // Rate limiting between batches
        if (i + batchSize < requests.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000 / config.alchemy.rateLimitPerSecond))
        }
      } catch (error) {
        console.error("Batch processing error:", error)
        results.push(...new Array(batch.length).fill(null))
      }
    }

    return results
  }
}
