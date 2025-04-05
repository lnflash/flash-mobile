import { loadJson, save } from "@app/utils/storage"

export interface MintInfo {
  url: string
  name?: string
  isActive: boolean
  isDefault?: boolean
  lastUsed?: Date
}

const MINTS_STORAGE_KEY = "cashu_saved_mints"
const DEFAULT_MINT = "https://forge.flashapp.me"

/**
 * Service for managing Cashu mints
 */
export class MintManagementService {
  private static instance: MintManagementService
  private mints: MintInfo[] = []
  private initialized = false

  // Private constructor prevents direct instantiation
  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  /**
   * Get the singleton instance of MintManagementService
   * @returns The singleton instance
   */
  public static getInstance(): MintManagementService {
    if (!MintManagementService.instance) {
      MintManagementService.instance = new MintManagementService()
    }
    return MintManagementService.instance
  }

  /**
   * Initialize the mint management service
   * @returns Promise that resolves when initialization is complete
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      // Load saved mints from storage
      const savedMints = await loadJson(MINTS_STORAGE_KEY)

      if (savedMints && Array.isArray(savedMints)) {
        this.mints = savedMints.map((mint) => ({
          ...mint,
          lastUsed: mint.lastUsed ? new Date(mint.lastUsed) : undefined,
        }))
      } else {
        // Initialize with default mint if no saved mints
        this.mints = [
          {
            url: DEFAULT_MINT,
            name: "Flash App Mint",
            isActive: true,
            isDefault: true,
            lastUsed: new Date(),
          },
        ]
        await this.saveMints()
      }

      this.initialized = true
    } catch (error) {
      console.error("Failed to initialize mint management:", error)
      // Reset to default state
      this.mints = [
        {
          url: DEFAULT_MINT,
          name: "Flash App Mint",
          isActive: true,
          isDefault: true,
          lastUsed: new Date(),
        },
      ]
      this.initialized = true
    }
  }

  /**
   * Get all saved mints
   * @returns Array of mint info objects
   */
  public async getAllMints(): Promise<MintInfo[]> {
    if (!this.initialized) {
      await this.initialize()
    }
    return [...this.mints]
  }

  /**
   * Get active mints only
   * @returns Array of active mint info objects
   */
  public async getActiveMints(): Promise<MintInfo[]> {
    if (!this.initialized) {
      await this.initialize()
    }
    return this.mints.filter((mint) => mint.isActive)
  }

  /**
   * Get the default mint
   * @returns The default mint info or undefined if none is set
   */
  public async getDefaultMint(): Promise<MintInfo | undefined> {
    if (!this.initialized) {
      await this.initialize()
    }
    return this.mints.find((mint) => mint.isDefault)
  }

  /**
   * Add a new mint
   * @param url The URL of the mint
   * @param name Optional name for the mint
   * @param setAsDefault Whether to set this mint as the default
   * @returns Promise that resolves to the added mint info
   */
  public async addMint(
    url: string,
    name?: string,
    setAsDefault = false,
  ): Promise<MintInfo> {
    if (!this.initialized) {
      await this.initialize()
    }

    // Check if mint already exists
    const existingMintIndex = this.mints.findIndex((m) => m.url === url)

    if (existingMintIndex >= 0) {
      // Update existing mint
      this.mints[existingMintIndex] = {
        ...this.mints[existingMintIndex],
        name: name || this.mints[existingMintIndex].name,
        isActive: true,
        lastUsed: new Date(),
      }

      if (setAsDefault) {
        this.setDefaultMint(url)
      }

      await this.saveMints()
      return this.mints[existingMintIndex]
    }

    // Create new mint
    const newMint: MintInfo = {
      url,
      name,
      isActive: true,
      isDefault: setAsDefault,
      lastUsed: new Date(),
    }

    // If this is the first mint or setAsDefault is true, make it the default
    if (setAsDefault) {
      // Remove default flag from other mints
      this.mints.forEach((m) => {
        m.isDefault = false
      })
    }

    this.mints.push(newMint)
    await this.saveMints()
    return newMint
  }

  /**
   * Remove a mint
   * @param url The URL of the mint to remove
   * @returns Promise that resolves when the operation is complete
   */
  public async removeMint(url: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    // Find the mint to remove
    const mintIndex = this.mints.findIndex((m) => m.url === url)

    if (mintIndex < 0) {
      // Mint not found
      return
    }

    // If removing the default mint, choose another mint as default
    if (this.mints[mintIndex].isDefault && this.mints.length > 1) {
      // Find another active mint to make default
      const newDefaultIndex = this.mints.findIndex((m) => m.isActive && m.url !== url)

      if (newDefaultIndex >= 0) {
        this.mints[newDefaultIndex].isDefault = true
      }
    }

    // Remove the mint
    this.mints.splice(mintIndex, 1)

    // If no mints left, add the default mint
    if (this.mints.length === 0) {
      this.mints.push({
        url: DEFAULT_MINT,
        name: "Flash App Mint",
        isActive: true,
        isDefault: true,
        lastUsed: new Date(),
      })
    }

    await this.saveMints()
  }

  /**
   * Set a mint as the default
   * @param url The URL of the mint to set as default
   * @returns Promise that resolves when the operation is complete
   */
  public async setDefaultMint(url: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    // Find the mint to set as default
    const mintIndex = this.mints.findIndex((m) => m.url === url)

    if (mintIndex < 0) {
      // Mint not found
      return
    }

    // Remove default flag from all mints
    this.mints.forEach((mint, index) => {
      mint.isDefault = index === mintIndex
    })

    // Ensure the mint is active
    this.mints[mintIndex].isActive = true

    await this.saveMints()
  }

  /**
   * Set a mint as active or inactive
   * @param url The URL of the mint to update
   * @param isActive Whether the mint should be active
   * @returns Promise that resolves when the operation is complete
   */
  public async setMintActive(url: string, isActive: boolean): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    // Find the mint to update
    const mintIndex = this.mints.findIndex((m) => m.url === url)

    if (mintIndex < 0) {
      // Mint not found
      return
    }

    // Update active status
    this.mints[mintIndex].isActive = isActive

    // If setting to inactive and this is the default mint, find another mint to make default
    if (!isActive && this.mints[mintIndex].isDefault) {
      // Find another active mint to make default
      const newDefaultIndex = this.mints.findIndex((m) => m.isActive && m.url !== url)

      if (newDefaultIndex >= 0) {
        this.mints[mintIndex].isDefault = false
        this.mints[newDefaultIndex].isDefault = true
      } else {
        // Keep this mint as default even though it's inactive
        // This ensures we always have a default mint
      }
    }

    await this.saveMints()
  }

  /**
   * Update the last used timestamp for a mint
   * @param url The URL of the mint to update
   * @returns Promise that resolves when the operation is complete
   */
  public async updateMintUsage(url: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    // Find the mint to update
    const mintIndex = this.mints.findIndex((m) => m.url === url)

    if (mintIndex < 0) {
      // Mint not found
      return
    }

    // Update last used timestamp
    this.mints[mintIndex].lastUsed = new Date()

    await this.saveMints()
  }

  /**
   * Save mints to storage
   * @returns Promise that resolves when the save is complete
   */
  private async saveMints(): Promise<void> {
    await save(MINTS_STORAGE_KEY, this.mints)
  }
}
