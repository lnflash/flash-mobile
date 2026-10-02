// A light `react-native-svg` stand-in for specs that check what an <Svg>
// draws, such as the Cashu card art. Every element renders as a host element
// named after the native one and carries the props it was given, untouched:
// the real library turns colours and transforms into native payloads, which
// a spec could not compare with the art's own values.
//
// The host names are flash-pos's (its __mocks__/svgStub.js), so a tree drawn
// here and the same art drawn there compare as they are.
//
// Usage (the factory has to be a `require`, `jest.mock` is hoisted above
// imports):
//
//   jest.mock("react-native-svg", () => require("../helpers/svg-stub"))
import * as React from "react"

type HostProps = { children?: React.ReactNode } & Record<string, unknown>

const host = (name: string) => {
  const Component = ({ children, ...rest }: HostProps) =>
    React.createElement(name, rest, children)
  Component.displayName = name
  return Component
}

export const Svg = host("RNSVGSvg")
export default Svg
export const Circle = host("RNSVGCircle")
export const ClipPath = host("RNSVGClipPath")
export const Defs = host("RNSVGDefs")
export const G = host("RNSVGGroup")
export const Line = host("RNSVGLine")
export const LinearGradient = host("RNSVGLinearGradient")
export const Mask = host("RNSVGMask")
export const Path = host("RNSVGPath")
export const RadialGradient = host("RNSVGRadialGradient")
export const Rect = host("RNSVGRect")
export const Stop = host("RNSVGStop")
export const Text = host("RNSVGText")
export const Use = host("RNSVGUse")
