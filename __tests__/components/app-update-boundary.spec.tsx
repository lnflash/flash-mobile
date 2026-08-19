// The gate is only worth anything if it is actually mounted. These specs cover
// the mount itself — that the blocking modal reaches the tree from the app root,
// that it is the last sibling (paint order is load-bearing, see #545), and that
// app.tsx still wires it up. Without them, deleting the mount leaves every other
// suite green while the PR's entire purpose is undone.
import fs from "fs"
import path from "path"

import * as React from "react"
import { Text } from "react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render } from "@testing-library/react-native"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"

let mockMobileVersions: unknown

jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useMobileUpdateQuery: () => ({
    data: { mobileVersions: mockMobileVersions },
    refetch: jest.fn().mockResolvedValue({}),
  }),
}))

jest.mock("react-native-device-info", () => ({
  getBuildNumber: () => "89",
  getReadableVersion: () => "0.6.6.89",
  getBundleId: () => "com.lnflash",
}))

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

jest.mock("@app/components/version", () => ({
  VersionComponent: () => null,
}))

jest.mock("react-native-modal", () => {
  const ReactActual = jest.requireActual("react")
  const { View } = jest.requireActual("react-native")
  return {
    __esModule: true,
    default: (props: { isVisible: boolean; children: React.ReactNode }) =>
      props.isVisible ? ReactActual.createElement(View, null, props.children) : null,
  }
})

import { AppUpdateBoundary } from "../../app/components/app-update/app-update-boundary"

loadLocale("en")
const LL = i18nObject("en")

const versions = (minSupported: number, currentSupported: number) => [
  { __typename: "MobileVersions", platform: "android", currentSupported, minSupported },
  { __typename: "MobileVersions", platform: "ios", currentSupported, minSupported },
]

const renderBoundary = () =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <AppUpdateBoundary>
        <Text>app content</Text>
      </AppUpdateBoundary>
    </ThemeProvider>,
  )

describe("AppUpdateBoundary", () => {
  it("renders its children when the build is supported and shows no gate", () => {
    mockMobileVersions = versions(1, 89)

    const { getByText, queryByText } = renderBoundary()

    expect(getByText("app content")).toBeTruthy()
    expect(queryByText(LL.AppUpdate.versionNotSupported())).toBeNull()
  })

  it("blocks from the app root when the build is below minSupported", () => {
    // This is the mount the whole PR exists for: without it the modal is
    // unreachable no matter how correct the component is.
    mockMobileVersions = versions(95, 96)

    const { getByText } = renderBoundary()

    expect(getByText(LL.AppUpdate.versionNotSupported())).toBeTruthy()
    expect(getByText(LL.AppUpdate.updateMandatory())).toBeTruthy()
  })

  it("keeps the gate as the last sibling so nothing paints over the block", () => {
    // coverScreen={false} makes the modal render inline (#545), so paint order
    // follows sibling order. A child mounted after the gate would draw on top of
    // a modal that has no dismiss.
    mockMobileVersions = versions(95, 96)

    const element = AppUpdateBoundary({ children: <Text>app content</Text> })
    const children = React.Children.toArray(
      (element as React.ReactElement).props.children,
    )

    const last = children[children.length - 1] as React.ReactElement
    expect(last.type).toBe(
      jest.requireActual("../../app/components/app-update/app-update").AppUpdateGate,
    )
  })
})

describe("app.tsx wiring", () => {
  // app.tsx cannot be rendered under jest — it pulls Firebase, reanimated and a
  // pile of native modules in at import time — so the mount is asserted against
  // the source. Deleting the boundary from the root tree has to fail something.
  const source = fs.readFileSync(path.join(__dirname, "../../app/app.tsx"), "utf8")

  it("mounts the boundary in the root component tree", () => {
    expect(source).toContain(
      'import { AppUpdateBoundary } from "./components/app-update/app-update-boundary"',
    )
    expect(source).toContain("<AppUpdateBoundary>")
    expect(source).toContain("</AppUpdateBoundary>")
  })

  it("wraps the navigator, so deep-link cold starts cannot bypass the gate", () => {
    const opened = source.indexOf("<AppUpdateBoundary>")
    const rootStack = source.indexOf("<RootStack />")
    const closed = source.indexOf("</AppUpdateBoundary>")

    expect(opened).toBeGreaterThan(-1)
    expect(rootStack).toBeGreaterThan(opened)
    expect(closed).toBeGreaterThan(rootStack)
  })
})
