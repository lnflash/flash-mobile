/**
 * Boltcard API Service
 *
 * Handles REST API calls to BTCPayServer Flash Plugin for Boltcard settings management.
 * These endpoints manage card PIN, max withdrawal limits, and enable/disable status.
 */

import axios, { AxiosError } from "axios"

// Types for API responses
export interface BoltcardSettings {
  maxWithdrawSats: number
  withdrawEnabled: boolean
  isConfigured: boolean
}

export interface BoltcardBalance {
  cardId: string
  walletBalanceSats: number
  maxWithdrawPerTapSats: number
  maxWithdrawLimitSats: number
  withdrawEnabled: boolean
  note?: string
}

export interface PinStatus {
  cardId: string
  pinEnabled: boolean
  isLockedOut: boolean
  lockoutMinutesRemaining: number
}

export interface BoltcardSettingsUpdate {
  maxWithdrawSats?: number
  withdrawEnabled?: boolean
}

export interface SetPinRequest {
  pin: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// API Error class
export class BoltcardApiError extends Error {
  statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = "BoltcardApiError"
    this.statusCode = statusCode
  }
}

/**
 * Build the full API URL for a BTCPayServer endpoint
 */
const buildUrl = (baseUrl: string, storeId: string, path: string): string => {
  // Ensure baseUrl doesn't have trailing slash
  const cleanBaseUrl = baseUrl.replace(/\/$/, "")
  return `${cleanBaseUrl}/plugins/${storeId}/flash/${path}`
}

/**
 * Handle API errors consistently
 */
const handleApiError = (error: unknown): never => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: string; reason?: string }>
    const message =
      axiosError.response?.data?.error ||
      axiosError.response?.data?.reason ||
      axiosError.message ||
      "Network error"
    throw new BoltcardApiError(message, axiosError.response?.status)
  }
  throw new BoltcardApiError(error instanceof Error ? error.message : "Unknown error")
}

/**
 * Get current Boltcard withdrawal settings for a store
 */
export const getSettings = async (
  baseUrl: string,
  storeId: string,
): Promise<BoltcardSettings> => {
  try {
    const url = buildUrl(baseUrl, storeId, "boltcard/settings")
    const response = await axios.get<BoltcardSettings>(url, {
      timeout: 10000,
    })
    return response.data
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Update Boltcard withdrawal settings for a store
 */
export const updateSettings = async (
  baseUrl: string,
  storeId: string,
  settings: BoltcardSettingsUpdate,
): Promise<BoltcardSettings> => {
  try {
    const url = buildUrl(baseUrl, storeId, "boltcard/settings")
    const response = await axios.post<BoltcardSettings & { success: boolean }>(url, settings, {
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
      },
    })
    return response.data
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Get card balance and limits
 */
export const getCardBalance = async (
  baseUrl: string,
  storeId: string,
  cardId: string,
): Promise<BoltcardBalance> => {
  try {
    const url = buildUrl(baseUrl, storeId, `boltcard/${cardId}/balance`)
    const response = await axios.get<BoltcardBalance>(url, {
      timeout: 10000,
    })
    return response.data
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Set or update PIN for a Boltcard (4-8 digits)
 */
export const setPin = async (
  baseUrl: string,
  storeId: string,
  cardId: string,
  pin: string,
): Promise<{ success: boolean; message: string; cardId: string }> => {
  // Client-side validation
  if (!pin || pin.length < 4 || pin.length > 8) {
    throw new BoltcardApiError("PIN must be 4-8 digits")
  }
  if (!/^\d+$/.test(pin)) {
    throw new BoltcardApiError("PIN must contain only digits")
  }

  try {
    const url = buildUrl(baseUrl, storeId, `boltcard/${cardId}/pin`)
    const response = await axios.post<{ success: boolean; message: string; cardId: string }>(
      url,
      { pin } as SetPinRequest,
      {
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
    return response.data
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Remove PIN from a Boltcard
 */
export const removePin = async (
  baseUrl: string,
  storeId: string,
  cardId: string,
): Promise<{ success: boolean; message: string; cardId: string }> => {
  try {
    const url = buildUrl(baseUrl, storeId, `boltcard/${cardId}/pin`)
    const response = await axios.delete<{ success: boolean; message: string; cardId: string }>(
      url,
      {
        timeout: 10000,
      },
    )
    return response.data
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Get PIN status for a Boltcard (enabled, locked out, etc.)
 */
export const getPinStatus = async (
  baseUrl: string,
  storeId: string,
  cardId: string,
): Promise<PinStatus> => {
  try {
    const url = buildUrl(baseUrl, storeId, `boltcard/${cardId}/pin/status`)
    const response = await axios.get<PinStatus>(url, {
      timeout: 10000,
    })
    return response.data
  } catch (error) {
    handleApiError(error)
  }
}

/**
 * Unlock a locked Boltcard (admin function)
 */
export const unlockCard = async (
  baseUrl: string,
  storeId: string,
  cardId: string,
): Promise<{ success: boolean; message: string; cardId: string }> => {
  try {
    const url = buildUrl(baseUrl, storeId, `boltcard/${cardId}/pin/unlock`)
    const response = await axios.post<{ success: boolean; message: string; cardId: string }>(
      url,
      {},
      {
        timeout: 10000,
      },
    )
    return response.data
  } catch (error) {
    handleApiError(error)
  }
}

// Export all functions as a service object for convenience
export const BoltcardApi = {
  getSettings,
  updateSettings,
  getCardBalance,
  setPin,
  removePin,
  getPinStatus,
  unlockCard,
}

export default BoltcardApi
