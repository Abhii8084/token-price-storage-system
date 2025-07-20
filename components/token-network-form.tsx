"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, CheckCircle, AlertCircle, History } from "lucide-react"

interface FormData {
  token: string
  network: string
  timestamp: string // New field for timestamp
}

interface ApiResponse {
  success: boolean
  message: string
  data?: {
    price?: { usd: number }
    interpolated?: boolean
    fromDB?: boolean
    fromAPI?: boolean
    cached?: boolean
    // Add other relevant fields from your backend response
    symbol?: string
    name?: string
    timestamp?: string
  }
  queued?: boolean
}

export default function TokenNetworkForm() {
  const [formData, setFormData] = useState<FormData>({
    token: "",
    network: "",
    timestamp: "", // Initialize timestamp
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isSchedulingHistory, setIsSchedulingHistory] = useState(false)
  const [response, setResponse] = useState<ApiResponse | null>(null)
  const [historyResponse, setHistoryResponse] = useState<ApiResponse | null>(null)

  const networks = [
    { value: "ethereum", label: "Ethereum" },
    { value: "polygon", label: "Polygon" },
    { value: "bsc", label: "Binance Smart Chain" },
    { value: "avalanche", label: "Avalanche" },
    { value: "arbitrum", label: "Arbitrum" },
    { value: "optimism", label: "Optimism" },
  ]

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
    // Clear previous responses when user starts typing
    if (response) setResponse(null)
    if (historyResponse) setHistoryResponse(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.token.trim() || !formData.network) {
      setResponse({
        success: false,
        message: "Please fill in Token Address and Network.",
      })
      return
    }

    setIsLoading(true)
    setResponse(null) // Clear previous response
    setHistoryResponse(null) // Clear history response too

    try {
      const apiResponse = await fetch("/api/submit-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: formData.token.trim(),
          network: formData.network,
          timestamp: formData.timestamp.trim() || undefined, // Send timestamp if provided
        }),
      })

      const data: ApiResponse = await apiResponse.json()

      if (apiResponse.ok) {
        setResponse({
          success: true,
          message: data.message || "Price retrieved successfully!",
          data: data.data,
          queued: data.queued,
        })
        // Only clear form if it's a direct price retrieval, not a queued job
        if (!data.queued) {
          setFormData((prev) => ({ ...prev, token: "", timestamp: "" })) // Clear token and timestamp
        }
      } else {
        setResponse({
          success: false,
          message: data.message || "Failed to retrieve price.",
          queued: data.queued,
        })
      }
    } catch (error) {
      console.error("Submission error:", error)
      setResponse({
        success: false,
        message: "Network error. Please check your connection and try again.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleScheduleFullHistory = async () => {
    if (!formData.token.trim() || !formData.network) {
      setHistoryResponse({
        success: false,
        message: "Please fill in Token Address and Network to schedule full history.",
      })
      return
    }

    setIsSchedulingHistory(true)
    setResponse(null) // Clear previous response
    setHistoryResponse(null) // Clear history response

    try {
      const apiResponse = await fetch("/api/schedule-history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: formData.token.trim(),
          network: formData.network,
        }),
      })

      const data: ApiResponse = await apiResponse.json()

      if (apiResponse.ok) {
        setHistoryResponse({
          success: true,
          message: data.message || "Full history fetch job queued successfully!",
          data: data.data,
        })
        setFormData((prev) => ({ ...prev, token: "", timestamp: "" })) // Clear token and timestamp
      } else {
        setHistoryResponse({
          success: false,
          message: data.message || "Failed to schedule full history fetch.",
        })
      }
    } catch (error) {
      console.error("Schedule history error:", error)
      setHistoryResponse({
        success: false,
        message: "Network error. Please check your connection and try again.",
      })
    } finally {
      setIsSchedulingHistory(false)
    }
  }

  const getPriceSource = (data: ApiResponse["data"]) => {
    if (!data) return "Unknown"
    if (data.queued) return "Queued for Processing"
    if (data.cached) return "Cached"
    if (data.fromDB) return "Database"
    if (data.fromAPI) return "Alchemy API"
    if (data.interpolated) return "Interpolated"
    return "Unknown"
  }

  return (
    <Card className="w-full shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Token Price Lookup</CardTitle>
        <CardDescription>
          Enter token details to get current/historical prices or schedule full history fetching.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="token" className="text-sm font-medium">
              Token Address *
            </Label>
            <Input
              id="token"
              type="text"
              placeholder="0x..."
              value={formData.token}
              onChange={(e) => handleInputChange("token", e.target.value)}
              className="w-full"
              disabled={isLoading || isSchedulingHistory}
            />
            <p className="text-xs text-slate-500">Enter the contract address of the token.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="network" className="text-sm font-medium">
              Network *
            </Label>
            <Select
              value={formData.network}
              onValueChange={(value) => handleInputChange("network", value)}
              disabled={isLoading || isSchedulingHistory}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a network" />
              </SelectTrigger>
              <SelectContent>
                {networks.map((network) => (
                  <SelectItem key={network.value} value={network.value}>
                    {network.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">Choose the blockchain network for this token.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timestamp" className="text-sm font-medium">
              Timestamp (Optional)
            </Label>
            <Input
              id="timestamp"
              type="datetime-local" // Use datetime-local for a better UX
              value={formData.timestamp}
              onChange={(e) => handleInputChange("timestamp", e.target.value)}
              className="w-full"
              disabled={isLoading || isSchedulingHistory}
            />
            <p className="text-xs text-slate-500">
              For historical price. Leave blank for current price. (e.g., `2023-10-26T10:00:00`)
            </p>
          </div>

          {response && (
            <Alert className={response.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
              {response.success ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600" />
              )}
              <AlertDescription className={response.success ? "text-green-800" : "text-red-800"}>
                <p className="font-semibold">{response.message}</p>
                {response.data && (
                  <div className="mt-2 text-xs">
                    {response.data.price?.usd && (
                      <p>
                        Price: ${response.data.price.usd.toFixed(4)} (Source: {getPriceSource(response.data)})
                      </p>
                    )}
                    {response.data.symbol && <p>Symbol: {response.data.symbol}</p>}
                    {response.data.name && <p>Name: {response.data.name}</p>}
                    {response.data.timestamp && <p>Timestamp: {new Date(response.data.timestamp).toLocaleString()}</p>}
                    {response.data.interpolated && <p className="text-orange-600">This price was interpolated.</p>}
                    {response.queued && (
                      <p className="text-blue-600">
                        Price not immediately available, added to processing queue. Please try again shortly.
                      </p>
                    )}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || isSchedulingHistory || !formData.token.trim() || !formData.network}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Fetching Price...
              </>
            ) : (
              "Fetch Price"
            )}
          </Button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-200 space-y-4">
          <h3 className="text-lg font-semibold">Historical Data Tools</h3>
          {historyResponse && (
            <Alert className={historyResponse.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
              {historyResponse.success ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600" />
              )}
              <AlertDescription className={historyResponse.success ? "text-green-800" : "text-red-800"}>
                {historyResponse.message}
                {historyResponse.data && historyResponse.data.jobId && (
                  <p className="mt-1 text-xs">Job ID: {historyResponse.data.jobId}</p>
                )}
              </AlertDescription>
            </Alert>
          )}
          <Button
            onClick={handleScheduleFullHistory}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            disabled={isLoading || isSchedulingHistory || !formData.token.trim() || !formData.network}
          >
            {isSchedulingHistory ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scheduling History...
              </>
            ) : (
              <>
                <History className="mr-2 h-4 w-4" />
                Schedule Full History Fetch
              </>
            )}
          </Button>
          <p className="text-xs text-slate-500">
            This will trigger a background job to fetch all available historical daily prices for the selected token and
            network from its creation date.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
