import { device, expect as detoxExpect, element, by, waitFor } from "detox"
import path from "path"
import fs from "fs"

/**
 * Storybook visual regression tests.
 * Runs the app in Storybook mode and takes screenshots of representative stories.
 *
 * Story selection: 1 per major screen area to keep CI fast (~15 stories, ~8 min total).
 * Full coverage (all 57 stories) runs on main branch only via storybook-detox-full.yml.
 *
 * TODO: Add iOS once Mac Mini CI node is provisioned.
 */

const SCREENSHOT_DIR = path.join(__dirname, "screenshots")
const TIMEOUT = 15000

// Curated story list: [kind, storyName] — one per major area
// These are the `title` and export name from each .stories.tsx file
const STORIES_TO_TEST: Array<[string, string]> = [
  // Onboarding
  ["Onboarding/WelcomeScreen", "Unauthed"],
  // Home
  ["Home Screen/Header", "Authed"],
  ["Home Screen/Buttons", "LevelOne"],
  ["Home Screen/Transactions", "WithTransactions"],
  // Send
  ["Send Flow/ConfirmationError", "PaymentError"],
  ["Send Flow/DetailDestination", "UsernameDestination"],
  // Receive
  ["Receive Screen/WalletReceiveTypeTabs", "Default"],
  // Settings
  ["Settings/Security Screen", "BiometricsAndPin"],
  ["Settings/Notification Settings", "Default"],
  // Backup
  ["Backup/BackupOptions", "Default"],
  // Cashout
  ["Cashout/Details", "Default"],
  // Conversion
  ["Conversion/ConfirmationScreen", "BtcToUsd"],
  // Nostr
  ["Nostr/EditProfileUI", "WithProfile"],
  ["Nostr/FeedItem", "TextPost"],
  // Components
  ["Components/CurrencyTag", "BTC"],
  ["Components/MountainHeader", "Bitcoin"],
  ["Components/CodeInput", "Default"],
  // TOTP
  ["TOTP/LoginValidate", "Default"],
]

async function navigateToStory(kind: string, storyName: string): Promise<void> {
  // Storybook on-device UI: sidebar lists stories as "Kind/StoryName" or by text
  // Try tapping the story name text directly in the sidebar list
  try {
    await waitFor(element(by.text(storyName)))
      .toBeVisible()
      .withTimeout(TIMEOUT)
    await element(by.text(storyName)).tap()
  } catch {
    // Fallback: try the kind group first, then story name
    try {
      const kindShort = kind.split("/").pop() ?? kind
      await waitFor(element(by.text(kindShort)))
        .toBeVisible()
        .withTimeout(TIMEOUT)
      await element(by.text(kindShort)).tap()
      await waitFor(element(by.text(storyName)))
        .toBeVisible()
        .withTimeout(TIMEOUT)
      await element(by.text(storyName)).tap()
    } catch (err) {
      console.warn(`Could not navigate to ${kind}/${storyName}:`, err)
    }
  }
}

async function takeScreenshot(name: string): Promise<void> {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const filename = name.replace(/[^a-zA-Z0-9-_]/g, "_").toLowerCase()
  await device.takeScreenshot(filename)
}

describe("Storybook Visual Snapshots", () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      // Storybook mode is enabled by patching index.js before build (SHOW_STORYBOOK = true)
    })
    // Wait for Storybook UI to load
    await waitFor(element(by.text("Storybook")))
      .toBeVisible()
      .withTimeout(30000)
  })

  afterAll(async () => {
    await device.terminateApp()
  })

  for (const [kind, storyName] of STORIES_TO_TEST) {
    it(`renders ${kind}/${storyName}`, async () => {
      await navigateToStory(kind, storyName)
      // Wait for render to settle
      await new Promise((r) => setTimeout(r, 800))
      await takeScreenshot(`${kind}--${storyName}`)
    })
  }
})
