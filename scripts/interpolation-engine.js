import { config } from "./config.js"

export class InterpolationEngine {
  constructor(dbManager, alchemyService) {
    this.dbManager = dbManager
    this.alchemyService = alchemyService
  }

  async interpolatePrice(token, network, timestamp) {
    try {
      console.log(`Attempting to interpolate price for ${token} on ${network} at ${timestamp}`)

      // Get nearest available prices
      const nearestPrices = await this.dbManager.getNearestPrices(
        token,
        network,
        timestamp,
        config.interpolation.maxDataPoints,
      )

      if (nearestPrices.length < 2) {
        console.log("Insufficient data points for interpolation")
        return null
      }

      const targetDate = new Date(timestamp)

      // Filter prices within a reasonable time gap
      const filteredPrices = nearestPrices.filter((p) => {
        const priceDate = new Date(p.timestamp)
        const hoursDiff = Math.abs(targetDate.getTime() - priceDate.getTime()) / (1000 * 60 * 60)
        return hoursDiff <= config.interpolation.maxTimeGapHours
      })

      if (filteredPrices.length < 2) {
        console.log(`Insufficient data points within ${config.interpolation.maxTimeGapHours} hours for interpolation`)
        return null
      }

      const beforePrices = filteredPrices.filter((p) => new Date(p.timestamp) < targetDate)
      const afterPrices = filteredPrices.filter((p) => new Date(p.timestamp) > targetDate)

      let interpolatedPriceData
      let interpolationMethod
      let dataPointsUsed

      if (beforePrices.length === 0 || afterPrices.length === 0) {
        // Use extrapolation if we only have data on one side
        const { price, method, points } = this.extrapolatePrice(filteredPrices, targetDate, token, network)
        interpolatedPriceData = price
        interpolationMethod = method
        dataPointsUsed = points
      } else {
        // Linear interpolation between closest points
        const beforePrice = beforePrices[beforePrices.length - 1] // Most recent before
        const afterPrice = afterPrices[0] // Earliest after
        const { price, method, points } = this.linearInterpolation(beforePrice, afterPrice, targetDate)
        interpolatedPriceData = price
        interpolationMethod = method
        dataPointsUsed = points
      }

      if (!interpolatedPriceData || interpolatedPriceData.usd <= 0) {
        console.log("Interpolation resulted in invalid price.")
        return null
      }

      const confidence = this.calculateConfidence(dataPointsUsed, targetDate, interpolationMethod)

      if (confidence < config.interpolation.minConfidenceThreshold) {
        console.log(
          `Interpolated price confidence (${confidence.toFixed(2)}) below threshold (${config.interpolation.minConfidenceThreshold}). Skipping.`,
        )
        return null
      }

      console.log(
        `Successfully interpolated price: $${interpolatedPriceData.usd.toFixed(4)} with confidence ${confidence.toFixed(2)}`,
      )

      return {
        token,
        network,
        timestamp,
        price: {
          usd: interpolatedPriceData.usd,
          lastUpdated: new Date().toISOString(),
        },
        interpolated: true,
        interpolationMethod: interpolationMethod,
        dataPoints: dataPointsUsed,
        confidence: confidence,
      }
    } catch (error) {
      console.error("Interpolation error:", error)
      return null
    }
  }

  linearInterpolation(beforePrice, afterPrice, targetDate) {
    const beforeDate = new Date(beforePrice.timestamp)
    const afterDate = new Date(afterPrice.timestamp)

    // Calculate time ratios
    const totalTimeDiff = afterDate.getTime() - beforeDate.getTime()
    const targetTimeDiff = targetDate.getTime() - beforeDate.getTime()
    const ratio = totalTimeDiff === 0 ? 0 : targetTimeDiff / totalTimeDiff

    // Interpolate price
    const beforeUsd = beforePrice.price.usd
    const afterUsd = afterPrice.price.usd
    const interpolatedUsd = beforeUsd + (afterUsd - beforeUsd) * ratio

    return {
      price: {
        usd: interpolatedUsd,
      },
      method: "linear",
      points: [beforePrice, afterPrice],
    }
  }

  extrapolatePrice(prices, targetDate, token, network) {
    if (prices.length < 2) return { price: null, method: "none", points: [] }

    // Sort prices by timestamp
    const sortedPrices = prices.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

    // Use the two closest points to the target date for trend analysis
    let p1, p2
    if (targetDate < new Date(sortedPrices[0].timestamp)) {
      // Extrapolating backwards
      p1 = sortedPrices[0]
      p2 = sortedPrices[1]
    } else {
      // Extrapolating forwards
      p1 = sortedPrices[sortedPrices.length - 2]
      p2 = sortedPrices[sortedPrices.length - 1]
    }

    const date1 = new Date(p1.timestamp)
    const date2 = new Date(p2.timestamp)

    const timeDiff = date2.getTime() - date1.getTime()
    const priceDiff = p2.price.usd - p1.price.usd

    if (timeDiff === 0) return { price: null, method: "none", points: [] }

    const priceChangeRate = priceDiff / timeDiff // USD per millisecond

    const targetTimeDiff = targetDate.getTime() - date2.getTime()
    let extrapolatedUsd = p2.price.usd + priceChangeRate * targetTimeDiff

    // Apply bounds to prevent unrealistic extrapolation
    const maxChange = Math.abs(p2.price.usd * (config.interpolation.extrapolationMaxChangePercent / 100))
    extrapolatedUsd = Math.max(p2.price.usd - maxChange, Math.min(p2.price.usd + maxChange, extrapolatedUsd))
    extrapolatedUsd = Math.max(0.0001, extrapolatedUsd) // Ensure price is not negative or zero

    return {
      price: {
        usd: extrapolatedUsd,
      },
      method: "extrapolation",
      points: [p1, p2],
    }
  }

  calculateConfidence(dataPoints, targetDate, method) {
    if (dataPoints.length === 0) return 0

    let timeConfidence = 0
    let volatilityConfidence = 1 // Start high, reduce if volatile

    if (method === "linear" && dataPoints.length === 2) {
      const [beforePrice, afterPrice] = dataPoints
      const beforeDate = new Date(beforePrice.timestamp)
      const afterDate = new Date(afterPrice.timestamp)
      const targetTime = targetDate.getTime()

      const totalSpan = afterDate.getTime() - beforeDate.getTime()
      const targetPosition = totalSpan === 0 ? 0.5 : (targetTime - beforeDate.getTime()) / totalSpan

      // Confidence is highest at 0.5 (middle) and decreases towards edges
      timeConfidence = 1 - Math.abs(0.5 - targetPosition) * 2

      // Price volatility confidence (smaller price differences = higher confidence)
      const priceDiff = Math.abs(afterPrice.price.usd - beforePrice.price.usd)
      const avgPrice = (afterPrice.price.usd + beforePrice.price.usd) / 2
      const volatility = avgPrice === 0 ? 1 : priceDiff / avgPrice // Avoid division by zero
      volatilityConfidence = Math.max(0, 1 - volatility) // 0 to 1
    } else if (method === "extrapolation" && dataPoints.length >= 2) {
      const sortedPrices = dataPoints.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      const lastKnownDate = new Date(sortedPrices[sortedPrices.length - 1].timestamp)
      const firstKnownDate = new Date(sortedPrices[0].timestamp)

      const dataSpan = lastKnownDate.getTime() - firstKnownDate.getTime()
      const extrapolationDistance = Math.abs(targetDate.getTime() - lastKnownDate.getTime())

      // Confidence decreases significantly with extrapolation distance
      timeConfidence = dataSpan === 0 ? 0.1 : Math.max(0.1, 1 - extrapolationDistance / dataSpan)

      // Volatility based on the last two points
      const p1 = sortedPrices[sortedPrices.length - 2]
      const p2 = sortedPrices[sortedPrices.length - 1]
      const priceDiff = Math.abs(p2.price.usd - p1.price.usd)
      const avgPrice = (p2.price.usd + p1.price.usd) / 2
      const volatility = avgPrice === 0 ? 1 : priceDiff / avgPrice
      volatilityConfidence = Math.max(0, 1 - volatility)
    } else {
      return 0 // Invalid method or data points
    }

    // Combined confidence score
    return Math.min(1, (timeConfidence + volatilityConfidence) / 2)
  }
}
