/**
 * The Cashu card's art (Flash Card v2 "Bearer") is flash-pos's, shared
 * byte-for-byte: app/components/flashcard-v2-art/cardArtV2.tsx here,
 * src/components/cashu/charge/cardArtV2.tsx there. These specs pin this copy
 * to flash-pos's, and pin how this app frames it.
 */
import { createHash } from "crypto"
import * as React from "react"
import { StyleSheet, View } from "react-native"
import { render } from "@testing-library/react-native"
import type { ReactTestRendererJSON } from "react-test-renderer"

import {
  CARD_ART,
  CARD_PALETTE,
  CardArtV2,
  FlashcardV2Art,
  flashcardV2ArtSize,
} from "../../app/components/flashcard-v2-art"
import { grainTile } from "../../app/components/flashcard-v2-art/cardArtV2"

jest.mock("react-native-svg", () => require("../helpers/svg-stub"))

/**
 * flash-pos's __tests__/components/cashu/cardArtV2.test.tsx pins the same
 * digest of CARD_ART: every coordinate, colour, opacity, gradient, outlined
 * glyph, the grain and the z-order. Change both copies and both digests
 * together, or neither.
 */
const PARITY_DIGEST = "88c4f9c1ca91a921cab0d09362c42d12647a155d0a6c847f5a935283cbd77e02"

/**
 * The whole drawn tree (every element, in order, with every prop), from
 * flash-pos's copy rendered by flash-pos's own jest and svg stub. Static is
 * this app's card (chip-side arcs drawn in); animated is flash-pos's charge
 * card, which draws those arcs as its own overlays.
 */
const FLASH_POS_RENDER = {
  static: {
    digest: "9bab0b61f17e0580e5cebcb21a8d730792a2e20f91de9b13f2229a71d294d88c",
    paths: 10,
  },
  animated: {
    digest: "270a9876f3e6b61e7b5c70c5e3b5e4d8dbdea7e167786bf7adb1f91f734e6a7d",
    paths: 9,
  },
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")

type Node = ReactTestRendererJSON

const tree = (props: { staticArcs?: boolean } = {}) =>
  render(<CardArtV2 {...props} />).toJSON() as Node

function nodes(root: Node | null): Node[] {
  const out: Node[] = []
  const visit = (n: Node | string) => {
    if (typeof n === "string") return
    out.push(n)
    ;(n.children ?? []).forEach(visit)
  }
  if (root) visit(root)
  return out
}

const draw = (props: { staticArcs?: boolean } = {}) => nodes(tree(props))

/** Each element as [type, props sorted by name, children]: what flash-pos hashed. */
const canonical = (n: Node | string): unknown =>
  typeof n === "string"
    ? n
    : [
        n.type,
        Object.keys(n.props)
          .sort()
          .map((key) => [key, n.props[key]]),
        (n.children ?? []).map(canonical),
      ]

const countByType = (all: Node[]) =>
  all.reduce<Record<string, number>>((counts, n) => {
    counts[n.type] = (counts[n.type] ?? 0) + 1
    return counts
  }, {})

/** Every #rrggbb string in a value, recursively. */
function colours(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (/^#[0-9a-f]{6}$/i.test(value)) out.push(value.toLowerCase())
  } else if (Array.isArray(value)) {
    value.forEach((v) => colours(v, out))
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => colours(v, out))
  }
  return out
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

describe("Cashu card art: parity with flash-pos", () => {
  it("matches flash-pos's digest of the art's values", () => {
    expect(sha256(JSON.stringify(CARD_ART))).toBe(PARITY_DIGEST)
  })

  it("draws the very tree flash-pos draws, element for element", () => {
    expect(sha256(JSON.stringify(canonical(tree())))).toBe(FLASH_POS_RENDER.static.digest)
    expect(sha256(JSON.stringify(canonical(tree({ staticArcs: false }))))).toBe(
      FLASH_POS_RENDER.animated.digest,
    )
  })

  it("builds the grain as the reference generator does (mulberry32, seed 0x0C67F1A5)", () => {
    const [light, dark] = grainTile(0x0c67f1a5, 32, 40, 285)
    expect(light).toBe(CARD_ART.grain.light.d)
    expect(dark).toBe(CARD_ART.grain.dark.d)
    // flash-pos pins the same two hashes (build_preview.py's output).
    expect(sha256(light)).toBe(
      "24d9fc352deeaae932750e42854937c3294b895bba54ea6d1cfcd191399408a0",
    )
    expect(sha256(dark)).toBe(
      "afe57feec43a12a3dafeab90cb89f1059ce8958fadc4e6aa4c318a061c182ada",
    )
  })
})

describe("Cashu card art: structure", () => {
  it("is one <Svg> on the 320 x 202 artboard, filling its parent", () => {
    const svgs = draw().filter((n) => n.type === "RNSVGSvg")
    expect(svgs).toHaveLength(1)
    expect(svgs[0].props).toEqual({
      viewBox: "0 0 320 202",
      width: "100%",
      height: "100%",
      preserveAspectRatio: "none",
    })
    expect([CARD_ART.width, CARD_ART.height]).toEqual([320, 202])
  })

  it("draws 119 elements of the kinds flash-pos draws, and nothing else", () => {
    const all = draw()
    expect(all).toHaveLength(119)
    expect(countByType(all)).toEqual({
      RNSVGSvg: 1,
      RNSVGDefs: 1,
      RNSVGClipPath: 1,
      RNSVGLinearGradient: 2,
      RNSVGRadialGradient: 2,
      RNSVGStop: 16,
      RNSVGGroup: 6,
      RNSVGRect: 8,
      RNSVGCircle: 2,
      RNSVGPath: FLASH_POS_RENDER.static.paths,
      // The matte grain: one 32-unit tile, 10 x 7 times.
      RNSVGUse: 70,
    })
    // No Text, Image, Pattern or filter: nothing can fall back to another font
    // or decode late, and nothing draws differently on Android and iOS.
  })

  it("puts every gradient in user space, and opacity only on leaves", () => {
    const all = draw()
    const gradients = all.filter((n) => /Gradient$/.test(n.type))
    expect(gradients.map((g) => g.props.id).sort()).toEqual([
      "cardGold",
      "cardHalo",
      "cardLift",
      "cardSlash",
    ])
    gradients.forEach((g) => expect(g.props.gradientUnits).toBe("userSpaceOnUse"))
    all
      .filter((n) => n.type === "RNSVGGroup")
      .forEach((g) => expect(g.props.opacity).toBeUndefined())
  })

  it("clips the face to the ISO 7810 corner, base first and the edge hairline last", () => {
    const all = draw()
    const clip = all.find((n) => n.type === "RNSVGClipPath") as Node
    expect(clip.props.id).toBe("cardClip")
    expect((clip.children as Node[])[0].props).toMatchObject({
      width: 320,
      height: 202,
      rx: 11.9,
      ry: 11.9,
    })
    const face = all.find(
      (n) => n.type === "RNSVGGroup" && n.props.clipPath === "url(#cardClip)",
    ) as Node
    const layers = face.children as Node[]
    expect(layers[0]).toMatchObject({
      type: "RNSVGRect",
      props: { width: 320, height: 202, fill: CARD_PALETTE.base },
    })
    expect(layers[layers.length - 1]).toMatchObject({
      type: "RNSVGRect",
      props: { fill: "none", stroke: CARD_PALETTE.white, strokeOpacity: 0.02 },
    })
  })

  it("draws the key colours of the sheet: near-black, one orange, satin gold, white FLASH", () => {
    const all = draw()
    const fills = (type: string) =>
      all.filter((n) => n.type === type).map((n) => n.props.fill)
    // FLASH in pure white, BEARER CARD and the ₿ in the one orange.
    expect(fills("RNSVGPath")).toEqual(
      expect.arrayContaining([CARD_PALETTE.white, CARD_PALETTE.orange]),
    )
    expect(new Set(colours(all.map((n) => n.props)))).toEqual(
      new Set([
        "#080a0d",
        "#f97316",
        "#805711",
        "#a88232",
        "#bc933a",
        "#b6862f",
        "#a5761c",
        "#8a6524",
        "#d8b8ff",
        "#f5c96b",
        "#8b8f96",
        "#ffffff",
        "#000000",
      ]),
    )
  })

  it("has no green anywhere in the art: Flash green is the app's", () => {
    const all = [...colours(CARD_ART), ...colours(draw().map((n) => n.props))]
    expect(all.length).toBeGreaterThan(20)
    all.forEach((hex) => {
      const [r, g, b] = rgb(hex)
      expect([hex, g > r && g > b]).toEqual([hex, false])
    })
  })

  it("draws the chip-side contactless arcs into this app's still card at their resting 60 %", () => {
    const arcs = CARD_ART.chipArcs.d.join("")
    const find = (all: Node[]) =>
      all.find((n) => n.type === "RNSVGPath" && n.props.d === arcs)
    expect(find(draw())?.props).toMatchObject({
      stroke: CARD_PALETTE.orange,
      strokeOpacity: 0.6,
    })
    // flash-pos's charge card animates them instead.
    expect(find(draw({ staticArcs: false }))).toBeUndefined()
    expect(
      draw({ staticArcs: false }).filter((n) => n.type === "RNSVGPath"),
    ).toHaveLength(FLASH_POS_RENDER.animated.paths)
  })
})

describe("FlashcardV2Art", () => {
  it("is 320 dp wide where it fits, else keeps 24 dp either side, always at the card's aspect", () => {
    expect(flashcardV2ArtSize(393)).toEqual({ width: 320, height: 202 })
    expect(flashcardV2ArtSize(368)).toEqual({ width: 320, height: 202 })
    const narrow = flashcardV2ArtSize(360)
    expect(narrow.width).toBe(312)
    expect(narrow.height).toBeCloseTo((312 * 202) / 320, 9)
    expect(narrow.width / narrow.height).toBeCloseTo(320 / 202, 9)
  })

  // Full size, and a 360 dp phone's.
  const widths = [320, 312]
  widths.forEach((width) => {
    it(`frames the art at ${width} dp with the art's own corner, on its base, as one labelled image`, () => {
      const k = width / 320
      const view = render(
        <FlashcardV2Art
          width={width}
          accessibilityLabel="Flashcard ending ABAB"
          testID="art"
        />,
      )
      const card = view.getByTestId("art")
      expect(card.props.accessible).toBe(true)
      expect(card.props.accessibilityRole).toBe("image")
      expect(card.props.accessibilityLabel).toBe("Flashcard ending ABAB")
      const style = StyleSheet.flatten(card.props.style)
      expect(style.width).toBe(width)
      expect(style.height).toBeCloseTo(202 * k, 9)
      expect(style.borderRadius).toBeCloseTo(11.9 * k, 9)
      expect(style.backgroundColor).toBe("#080a0d")
      // The clip is an inner view, so iOS keeps the outer view's shadow.
      expect(style.overflow).toBeUndefined()
      const clips = view
        .UNSAFE_getAllByType(View)
        .filter((v) => StyleSheet.flatten(v.props.style)?.overflow === "hidden")
      expect(clips).toHaveLength(1)
      expect(StyleSheet.flatten(clips[0].props.style)).toMatchObject({
        borderRadius: style.borderRadius,
        backgroundColor: "#080a0d",
      })
      // Inside it, the one <Svg> of the still card, chip-side arcs drawn in.
      const inClip = (type: string) => clips[0].findAll((n) => String(n.type) === type)
      expect(inClip("RNSVGSvg")).toHaveLength(1)
      const arcs = inClip("RNSVGPath").filter(
        (n) => n.props.d === CARD_ART.chipArcs.d.join(""),
      )
      expect(arcs).toHaveLength(1)
      expect(arcs[0].props.strokeOpacity).toBe(0.6)
    })
  })
})
