import { element, by, waitFor } from "detox"

/**
 * Waits for the on-device Storybook UI to be fully loaded.
 * The sidebar contains a list of story kinds; we wait for the first visible item.
 */
export async function waitForStorybookToLoad(timeoutMs = 30000): Promise<void> {
  // Storybook renders a list with accessibility labels or text nodes
  // Wait for any element with "Storybook" text or the story list
  try {
    await waitFor(element(by.text("Storybook")))
      .toBeVisible()
      .withTimeout(timeoutMs)
  } catch {
    // Fallback: wait for any story kind text to appear
    await waitFor(element(by.text("Get started screen")))
      .toBeVisible()
      .withTimeout(timeoutMs)
  }
}

/**
 * Navigates to a story in the on-device Storybook UI.
 * Tries multiple selector strategies.
 */
export async function navigateToStory(
  kind: string,
  storyName: string,
): Promise<void> {
  const TIMEOUT = 10000

  // Strategy 1: tap story name directly (visible in collapsed or expanded sidebar)
  try {
    await waitFor(element(by.text(storyName)))
      .toBeVisible()
      .withTimeout(TIMEOUT)
    await element(by.text(storyName)).tap()
    return
  } catch {}

  // Strategy 2: expand the kind group first (last path segment as group label)
  const kindLabel = kind.split("/").pop() ?? kind
  try {
    await element(by.text(kindLabel)).tap()
    await waitFor(element(by.text(storyName)))
      .toBeVisible()
      .withTimeout(TIMEOUT)
    await element(by.text(storyName)).tap()
    return
  } catch {}

  // Strategy 3: use testID pattern used by @storybook/react-native v6
  // testID format: "{kind}--{storyName}"
  try {
    const testId = `${kind}--${storyName}`
    await element(by.id(testId)).tap()
  } catch {
    console.warn(`[Storybook] Could not navigate to ${kind}/${storyName} — story may render in current view`)
  }
}
