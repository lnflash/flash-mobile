/**
 * ENG-689, architect decision 3: a debug or e2e build may turn the assistant
 * on with a dev link, so the Maestro flows can open Ask Flash; a release
 * build never does. Only assistantEnabled follows it: voice, spoken replies
 * and the server fallback stay Remote Config's alone.
 *
 * ENG-734: the test phones carry a production-mode bundle, so __DEV__ is
 * false there; ASSISTANT_DEV_LINK=true in the .env they were bundled with
 * honours the link too. Nothing else does. App mounts the link through
 * DevLinks with no condition around it, and nothing in between may add one.
 */
import * as fs from "fs"
import * as path from "path"
import * as React from "react"
import * as ts from "typescript"
import { Linking, LogBox, Text } from "react-native"
import { act, render, renderHook } from "@testing-library/react-native"
import { getRemoteConfig } from "@react-native-firebase/remote-config"

import { DevLinks } from "@app/components/dev-links"
import {
  assistantDevOverride,
  assistantVoiceDevOverride,
  DevAssistantLink,
  parseAssistantDevLink,
  setAssistantDevOverride,
  useDevAssistantLink,
} from "@app/config/assistant-dev-override"
import {
  FeatureFlagContextProvider,
  useFeatureFlags,
} from "@app/config/feature-flags-context"

// react-native-dotenv inlines ASSISTANT_DEV_LINK from .env when the app is
// bundled. Here a getter reads it, so each test picks its own value.
let mockAssistantDevLink: string | undefined
jest.mock("@env", () => ({
  get ASSISTANT_DEV_LINK() {
    return mockAssistantDevLink
  },
}))
jest.mock("@app/hooks", () => ({
  useAppConfig: () => ({ appConfig: { galoyInstance: { id: "Test" } } }),
}))
// DevLinks mounts the card links beside the assistant's. They need
// FlashcardContext and the navigator, and their own spec covers them
// (use-dev-card-links.spec.tsx); this stand-in records whether DevLinks
// mounted them.
const mockDevCardLinks = jest.fn()
jest.mock("@app/hooks/use-tap-flashcard", () => ({
  DevCardLinks: () => {
    mockDevCardLinks()
    return null
  },
}))
// Signed in, so the provider renders at once instead of waiting on the gate.
jest.mock("@app/graphql/level-context", () => ({
  useLevel: () => ({ currentLevel: "ONE" }),
}))

type Dev = { __DEV__: boolean }
const setDev = (value: boolean) => {
  ;(globalThis as unknown as Dev).__DEV__ = value
}
const setDevLink = (value: string | undefined) => {
  mockAssistantDevLink = value
}

const remoteConfig = getRemoteConfig() as unknown as {
  fetchAndActivate: jest.Mock
  getValue: jest.Mock
}

const Flags = () => {
  const flags = useFeatureFlags()
  return (
    <Text testID="flags">
      {JSON.stringify({
        assistantEnabled: flags.assistantEnabled,
        assistantVoice: flags.assistantVoice,
        assistantVoiceReplies: flags.assistantVoiceReplies,
        assistantServerFallback: flags.assistantServerFallback,
      })}
    </Text>
  )
}

const renderFlags = async () => {
  const screen = render(
    <FeatureFlagContextProvider>
      <Flags />
    </FeatureFlagContextProvider>,
  )
  await act(async () => {})
  return {
    screen,
    flags: () => JSON.parse(screen.getByTestId("flags").props.children),
  }
}

let urlListener: ((event: { url: string }) => void) | undefined
const remove = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  setDevLink(undefined)
  setDev(true)
  setAssistantDevOverride(false)
  urlListener = undefined
  remoteConfig.fetchAndActivate.mockReset()
  remoteConfig.fetchAndActivate.mockResolvedValue(true)
  remoteConfig.getValue.mockReset()
  // Remote Config holds every assistant flag off.
  remoteConfig.getValue.mockImplementation(() => ({
    asBoolean: () => false,
    getSource: () => "remote",
  }))
  jest.spyOn(LogBox, "ignoreAllLogs").mockImplementation(() => undefined)
  jest.spyOn(Linking, "getInitialURL").mockResolvedValue(null)
  jest.spyOn(Linking, "addEventListener").mockImplementation(((
    _type: string,
    listener: (event: { url: string }) => void,
  ) => {
    urlListener = listener
    return { remove }
  }) as unknown as typeof Linking.addEventListener)
})

afterEach(() => {
  setDev(true)
  setAssistantDevOverride(false)
  setDevLink(undefined)
  jest.restoreAllMocks()
})

describe("parseAssistantDevLink", () => {
  it("reads on and off, and nothing else", () => {
    expect(parseAssistantDevLink("flash://dev/assistant?on=1")).toBe(true)
    expect(parseAssistantDevLink("flash://dev/assistant/?on=1")).toBe(true)
    expect(parseAssistantDevLink("flash://dev/assistant?off=1")).toBe(false)
    expect(parseAssistantDevLink("flash://dev/assistant")).toBeUndefined()
    expect(parseAssistantDevLink("flash://dev/assistant?on=yes")).toBeUndefined()
    expect(parseAssistantDevLink("flash://dev/card-tap")).toBeUndefined()
    expect(parseAssistantDevLink("flash://assistant?on=1")).toBeUndefined()
    expect(
      parseAssistantDevLink("https://flashapp.me/dev/assistant?on=1"),
    ).toBeUndefined()
  })

  it("reads nothing in a release build", () => {
    setDev(false)
    expect(parseAssistantDevLink("flash://dev/assistant?on=1")).toBeUndefined()
  })
})

describe("the assistant's dev override", () => {
  it("is off until a link turns it on", () => {
    expect(assistantDevOverride()).toBe(false)
    setAssistantDevOverride(true)
    expect(assistantDevOverride()).toBe(true)
  })

  it("is never on in a release build, whatever set it", () => {
    setDev(false)
    setAssistantDevOverride(true)
    expect(assistantDevOverride()).toBe(false)

    // Set in a debug run, read by a release one: still off.
    setDev(true)
    setAssistantDevOverride(true)
    setDev(false)
    expect(assistantDevOverride()).toBe(false)
  })

  it("turns on assistantEnabled alone, while Remote Config holds it off", async () => {
    const { flags } = await renderFlags()
    expect(flags().assistantEnabled).toBe(false)

    act(() => setAssistantDevOverride(true))

    expect(flags()).toEqual({
      assistantEnabled: true,
      assistantVoice: false,
      assistantVoiceReplies: false,
      assistantServerFallback: false,
    })

    act(() => setAssistantDevOverride(false))
    expect(flags().assistantEnabled).toBe(false)
  })

  it("leaves assistantEnabled to Remote Config in a release build", async () => {
    setDev(false)
    const { flags } = await renderFlags()

    act(() => setAssistantDevOverride(true))

    expect(flags().assistantEnabled).toBe(false)
  })
})

describe("useDevAssistantLink", () => {
  it("exposes spoken replies only through an explicit Debug option", async () => {
    ;(Linking.getInitialURL as jest.Mock).mockResolvedValue(
      "flash://dev/assistant?on=1&replies=1",
    )
    const screen = render(
      <FeatureFlagContextProvider>
        <DevAssistantLink />
        <Flags />
      </FeatureFlagContextProvider>,
    )
    await act(async () => {})
    expect(
      JSON.parse(screen.getByTestId("flags").props.children).assistantVoiceReplies,
    ).toBe(true)
  })
  it("never enables spoken replies through a release-mode dev link", async () => {
    setDev(false)
    setDevLink("true")
    ;(Linking.getInitialURL as jest.Mock).mockResolvedValue(
      "flash://dev/assistant?on=1&replies=1",
    )
    const screen = render(
      <FeatureFlagContextProvider>
        <DevAssistantLink />
        <Flags />
      </FeatureFlagContextProvider>,
    )
    await act(async () => {})
    expect(
      JSON.parse(screen.getByTestId("flags").props.children).assistantVoiceReplies,
    ).toBe(false)
  })

  it("publishes assistant and explicit Debug voice together at cold launch", async () => {
    ;(Linking.getInitialURL as jest.Mock).mockResolvedValue(
      "flash://dev/assistant?on=1&voice=1",
    )
    const seen: { assistantEnabled: boolean; assistantVoice: boolean }[] = []
    const Observe = () => {
      const flags = useFeatureFlags()
      seen.push({
        assistantEnabled: flags.assistantEnabled,
        assistantVoice: flags.assistantVoice,
      })
      return null
    }
    render(
      <FeatureFlagContextProvider>
        <DevAssistantLink />
        <Observe />
      </FeatureFlagContextProvider>,
    )
    await act(async () => {})
    expect(assistantVoiceDevOverride()).toBe(true)
    expect(seen.some((flags) => flags.assistantEnabled)).toBe(true)
    expect(
      seen
        .filter((flags) => flags.assistantEnabled)
        .every((flags) => flags.assistantVoice),
    ).toBe(true)
    act(() => setAssistantDevOverride(false))
    expect(assistantVoiceDevOverride()).toBe(false)
  })
  it("ignores the voice opt-in in production-mode local phone builds", async () => {
    setDev(false)
    setDevLink("true")
    ;(Linking.getInitialURL as jest.Mock).mockResolvedValue(
      "flash://dev/assistant?on=1&voice=1",
    )
    renderHook(() => useDevAssistantLink())
    await act(async () => {})
    expect(assistantDevOverride()).toBe(true)
    expect(assistantVoiceDevOverride()).toBe(false)
  })

  it("acts on the link the app was opened with", async () => {
    ;(Linking.getInitialURL as jest.Mock).mockResolvedValue("flash://dev/assistant?on=1")

    renderHook(() => useDevAssistantLink())
    await act(async () => {})

    expect(assistantDevOverride()).toBe(true)
  })

  it("hides LogBox when it turns the assistant on, as the card bridge's link does", async () => {
    // Its toasts cover the thread's input and Ask button, where the flows tap.
    render(<DevAssistantLink />)
    await act(async () => {})

    act(() => urlListener?.({ url: "flash://dev/assistant?on=1" }))
    expect(LogBox.ignoreAllLogs).toHaveBeenCalledWith(true)

    // Off leaves it as it is: the card bridge may be hiding it too.
    ;(LogBox.ignoreAllLogs as jest.Mock).mockClear()
    act(() => urlListener?.({ url: "flash://dev/assistant?off=1" }))
    act(() => urlListener?.({ url: "flash://dev/card-tap" }))
    expect(LogBox.ignoreAllLogs).not.toHaveBeenCalled()
  })

  it("acts on links that arrive while the app runs, and stops listening on unmount", async () => {
    const view = render(<DevAssistantLink />)
    await act(async () => {})

    act(() => urlListener?.({ url: "flash://dev/assistant?on=1" }))
    expect(assistantDevOverride()).toBe(true)
    act(() => urlListener?.({ url: "flash://dev/card-tap" }))
    expect(assistantDevOverride()).toBe(true)
    act(() => urlListener?.({ url: "flash://dev/assistant?off=1" }))
    expect(assistantDevOverride()).toBe(false)

    view.unmount()
    expect(remove).toHaveBeenCalled()
  })

  it("does not listen in a release build", async () => {
    setDev(false)

    renderHook(() => useDevAssistantLink())
    await act(async () => {})

    expect(Linking.addEventListener).not.toHaveBeenCalled()
    expect(Linking.getInitialURL).not.toHaveBeenCalled()
    expect(LogBox.ignoreAllLogs).not.toHaveBeenCalled()
  })
})

describe("a production-mode build with ASSISTANT_DEV_LINK (ENG-734)", () => {
  beforeEach(() => {
    setDev(false)
  })

  it('honours the link when it is "true"', () => {
    setDevLink("true")

    expect(parseAssistantDevLink("flash://dev/assistant?on=1")).toBe(true)
    expect(parseAssistantDevLink("flash://dev/assistant?off=1")).toBe(false)
    expect(parseAssistantDevLink("flash://dev/card-tap")).toBeUndefined()
    expect(parseAssistantDevLink("flash://assistant?on=1")).toBeUndefined()

    setAssistantDevOverride(true)
    expect(assistantDevOverride()).toBe(true)
  })

  // Plain loops rather than it.each: this repo's tsconfig pulls in the
  // wdio/mocha globals, whose `it` has no `.each`.
  for (const value of [undefined, "false", "", "1", "TRUE"]) {
    it(`ignores the link when it is ${JSON.stringify(value)}`, () => {
      setDevLink(value)

      expect(parseAssistantDevLink("flash://dev/assistant?on=1")).toBeUndefined()
      setAssistantDevOverride(true)
      expect(assistantDevOverride()).toBe(false)
    })
  }

  it("is off again without it, whatever set it", () => {
    setDevLink("true")
    setAssistantDevOverride(true)

    setDevLink(undefined)
    expect(assistantDevOverride()).toBe(false)
  })

  it('turns on assistantEnabled alone when it is "true"', async () => {
    setDevLink("true")
    const { flags } = await renderFlags()
    expect(flags().assistantEnabled).toBe(false)

    act(() => setAssistantDevOverride(true))

    expect(flags()).toEqual({
      assistantEnabled: true,
      assistantVoice: false,
      assistantVoiceReplies: false,
      assistantServerFallback: false,
    })
  })

  it('leaves assistantEnabled to Remote Config when it is "false"', async () => {
    setDevLink("false")
    const { flags } = await renderFlags()

    act(() => setAssistantDevOverride(true))

    expect(flags().assistantEnabled).toBe(false)
  })

  it('acts on the link at launch and while the app runs when it is "true"', async () => {
    setDevLink("true")
    ;(Linking.getInitialURL as jest.Mock).mockResolvedValue("flash://dev/assistant?on=1")

    render(<DevAssistantLink />)
    await act(async () => {})

    expect(assistantDevOverride()).toBe(true)
    expect(LogBox.ignoreAllLogs).toHaveBeenCalledWith(true)

    act(() => urlListener?.({ url: "flash://dev/assistant?off=1" }))
    expect(assistantDevOverride()).toBe(false)
  })

  for (const value of [undefined, "false"]) {
    it(`does not listen when it is ${JSON.stringify(value)}`, async () => {
      setDevLink(value)

      render(<DevAssistantLink />)
      await act(async () => {})

      expect(Linking.addEventListener).not.toHaveBeenCalled()
      expect(Linking.getInitialURL).not.toHaveBeenCalled()
      expect(LogBox.ignoreAllLogs).not.toHaveBeenCalled()
    })
  }
})

describe("DevLinks", () => {
  // What App mounts (below). The assistant's link has no gate here but its
  // own: a __DEV__ guard around it, however written, would leave the link dead
  // on the test phones again (ENG-734). These render it as those phones run.
  it('listens for the link in a production-mode build when ASSISTANT_DEV_LINK is "true"', async () => {
    setDev(false)
    setDevLink("true")
    ;(Linking.getInitialURL as jest.Mock).mockResolvedValue("flash://dev/assistant?on=1")

    const { toJSON } = render(<DevLinks />)
    await act(async () => {})

    expect(toJSON()).toBeNull()
    expect(Linking.addEventListener).toHaveBeenCalledWith("url", expect.any(Function))
    expect(assistantDevOverride()).toBe(true)
    act(() => urlListener?.({ url: "flash://dev/assistant?off=1" }))
    expect(assistantDevOverride()).toBe(false)
    // The simulated card stays in development builds.
    expect(mockDevCardLinks).not.toHaveBeenCalled()
  })

  it("listens for nothing in a production-mode build without it", async () => {
    setDev(false)

    render(<DevLinks />)
    await act(async () => {})

    expect(Linking.addEventListener).not.toHaveBeenCalled()
    expect(Linking.getInitialURL).not.toHaveBeenCalled()
    expect(mockDevCardLinks).not.toHaveBeenCalled()
  })

  it("mounts the card links and the assistant's link in a development build", async () => {
    render(<DevLinks />)
    await act(async () => {})

    expect(mockDevCardLinks).toHaveBeenCalled()
    act(() => urlListener?.({ url: "flash://dev/assistant?on=1" }))
    expect(assistantDevOverride()).toBe(true)
  })
})

describe("App", () => {
  // Rendering App needs the whole native provider tree, so this parses
  // app.tsx. DevLinks must be a plain JSX child: every node from it up to
  // App's return a JSX element or fragment. A `__DEV__ &&`, a `? :`, or a
  // variable holding the element stops that walk, however it is written.
  const file = path.join(__dirname, "../../app/app.tsx")
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const elementsNamed = (name: string): ts.JsxSelfClosingElement[] => {
    const found: ts.JsxSelfClosingElement[] = []
    const visit = (node: ts.Node) => {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === name) {
        found.push(node)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    return found
  }

  it("mounts DevLinks once, with no condition around it, inside FlashcardProvider", () => {
    const mounts = elementsNamed("DevLinks")
    expect(mounts).toHaveLength(1)

    const wrappers: string[] = []
    let node: ts.Node = mounts[0].parent
    while (
      ts.isJsxElement(node) ||
      ts.isJsxFragment(node) ||
      ts.isParenthesizedExpression(node)
    ) {
      if (ts.isJsxElement(node))
        wrappers.push(node.openingElement.tagName.getText(source))
      node = node.parent
    }
    expect(ts.SyntaxKind[node.kind]).toBe("ReturnStatement")

    let owner: ts.Node = node.parent
    while (!ts.isArrowFunction(owner) && !ts.isFunctionDeclaration(owner)) {
      owner = owner.parent
    }
    expect(
      ts.isVariableDeclaration(owner.parent) && owner.parent.name.getText(source),
    ).toBe("App")
    // DevCardLinks, inside DevLinks, reads FlashcardContext.
    expect(wrappers).toContain("FlashcardProvider")
  })

  it("mounts the assistant's link only through DevLinks, from the module rendered above", () => {
    expect(elementsNamed("DevAssistantLink")).toHaveLength(0)

    const from = source.statements
      .filter(ts.isImportDeclaration)
      .find(
        ({ importClause }) =>
          importClause?.namedBindings !== undefined &&
          ts.isNamedImports(importClause.namedBindings) &&
          importClause.namedBindings.elements.some(
            ({ name }) => name.text === "DevLinks",
          ),
      )
    expect(
      from && ts.isStringLiteral(from.moduleSpecifier) && from.moduleSpecifier.text,
    ).toBe("./components/dev-links")
  })
})
