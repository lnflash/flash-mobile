/**
 * The Cashu card's art (Flash Card v2 "Bearer") is flash-pos's, shared
 * byte-for-byte: app/components/flashcard-v2-art/cardArtV2.tsx here,
 * src/components/cashu/charge/cardArtV2.tsx there. Neither repo's specs read
 * the other's file: each pins its own copy to the same digests (its bytes,
 * CARD_ART, and the tree it draws), so an edit to either copy fails that
 * repo's suite until its digests are bumped, which is the cue to copy the
 * file across and bump the other's. These specs also pin how this app frames
 * the art.
 */
import { createHash } from "crypto"
import { readFileSync } from "fs"
import { join } from "path"
import * as React from "react"
import { StyleSheet, View } from "react-native"
import { render } from "@testing-library/react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"
import type { ReactTestInstance, ReactTestRendererJSON } from "react-test-renderer"

import {
  CARD_ART,
  CARD_PALETTE,
  CardArtV2,
  FlashcardV2Art,
  flashcardV2ArtWidth,
} from "../../app/components/flashcard-v2-art"
import { grainTile } from "../../app/components/flashcard-v2-art/cardArtV2"
import appTheme from "../../app/rne-theme/theme"

jest.mock("react-native-svg", () => require("../helpers/svg-stub"))

/**
 * sha256 of cardArtV2.tsx itself, with LF line endings: comments, types and
 * formatting included, which neither digest below sees. flash-pos's
 * __tests__/components/cashu/cardArtV2.test.tsx pins the same value for its
 * copy.
 */
const ART_FILE_SHA256 = "355472b69813ca55b2965c50a31dc11430d0c92dfc3dfd896816edb45d901927"

/**
 * sha256 of JSON.stringify(CARD_ART): every coordinate, colour, opacity,
 * gradient, outlined glyph, the grain and the z-order. flash-pos pins the same
 * value.
 */
const PARITY_DIGEST = "88c4f9c1ca91a921cab0d09362c42d12647a155d0a6c847f5a935283cbd77e02"

/**
 * The whole drawn tree (every element, in order, with every prop) under the
 * svg stub, whose host names are flash-pos's; flash-pos pins the same two
 * digests for its copy, under its own jest and stub. Static is this app's
 * card (chip-side arcs drawn in); animated is flash-pos's charge card, which
 * draws those arcs as its own overlays.
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

/** Each element as [type, props sorted by name, children]: what both repos hash. */
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

describe("Cashu card art: the digests both repos pin", () => {
  it("pins the file's bytes, comments and formatting included", () => {
    const file = readFileSync(
      join(__dirname, "../../app/components/flashcard-v2-art/cardArtV2.tsx"),
      "utf8",
    )
    // A Windows checkout may hand the file over with CRLF line endings.
    expect(sha256(file.replace(/\r\n/g, "\n"))).toBe(ART_FILE_SHA256)
  })

  it("pins the art's values (CARD_ART)", () => {
    expect(sha256(JSON.stringify(CARD_ART))).toBe(PARITY_DIGEST)
  })

  it("pins the drawn tree, element for element", () => {
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

/** WCAG contrast ratio of two #rrggbb colours. */
const contrast = (a: string, b: string) => {
  const luminance = (hex: string) => {
    const [r, g, bl] = rgb(hex).map((c) => {
      const v = c / 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe("FlashcardV2Art", () => {
  const renderArt = (width: number, mode: "light" | "dark" = "light") =>
    render(
      <ThemeProvider
        theme={createTheme({
          mode,
          lightColors: appTheme.lightColors,
          darkColors: appTheme.darkColors,
        })}
      >
        <FlashcardV2Art
          width={width}
          accessibilityLabel="Flashcard ending A B A B"
          testID="art"
        />
      </ThemeProvider>,
    )

  /** What the card view holds, in drawing order. */
  const layers = (view: ReturnType<typeof renderArt>) =>
    view.getByTestId("art").children as ReactTestInstance[]

  it("is 320 dp wide where it fits, else keeps 24 dp either side", () => {
    expect(flashcardV2ArtWidth(393)).toBe(320)
    expect(flashcardV2ArtWidth(368)).toBe(320)
    expect(flashcardV2ArtWidth(360)).toBe(312)
  })

  // Full size, and a 360 dp phone's.
  const widths = [320, 312]
  widths.forEach((width) => {
    it(`frames the art at ${width} dp at the card's aspect, with the art's own corner, on its base, as one labelled image`, () => {
      const k = width / 320
      const view = renderArt(width)
      const card = view.getByTestId("art")
      expect(card.props.accessible).toBe(true)
      expect(card.props.accessibilityRole).toBe("image")
      expect(card.props.accessibilityLabel).toBe("Flashcard ending A B A B")
      const style = StyleSheet.flatten(card.props.style)
      expect(style.width).toBe(width)
      expect(style.height).toBeCloseTo(202 * k, 9)
      expect(style.width / style.height).toBeCloseTo(320 / 202, 9)
      expect(style.borderRadius).toBeCloseTo(11.9 * k, 9)
      expect(style.backgroundColor).toBe("#080a0d")
      // The shadow is on the outer view and the clip on an inner one: on iOS
      // a view that clips its content clips its own shadow too.
      expect(style).toMatchObject({
        shadowColor: "#000000",
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
      })
      expect(style.overflow).toBeUndefined()
      const clips = view
        .UNSAFE_getAllByType(View)
        .filter((v) => StyleSheet.flatten(v.props.style)?.overflow === "hidden")
      expect(clips).toHaveLength(1)
      // The clip fills the card: the art is 100 % of the clip, so a clip
      // sized by its content would draw no art at all.
      expect(StyleSheet.flatten(clips[0].props.style)).toMatchObject({
        ...StyleSheet.absoluteFillObject,
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
      // On the light theme's page the card stands out by itself: no outline.
      expect(layers(view)).toHaveLength(1)
      expect(layers(view)[0]).toBe(clips[0])
    })
  })

  it("outlines the card on the dark theme, where its near-black base and black shadow vanish into the black page", () => {
    const page = appTheme.darkColors?.background as string
    const grey4 = appTheme.darkColors?.grey4 as string
    // Why: the base is all but the page's colour.
    expect(contrast(CARD_PALETTE.base, page)).toBeLessThan(1.1)

    const view = renderArt(312, "dark")

    const style = StyleSheet.flatten(view.getByTestId("art").props.style)
    expect(layers(view)).toHaveLength(2)
    const [clip, outline] = layers(view)
    expect(StyleSheet.flatten(clip.props.style).overflow).toBe("hidden")
    // Drawn last, over the art, at the card's own corner. A border on either
    // view under it would inset the art by its width and squash it.
    expect(StyleSheet.flatten(outline.props.style)).toEqual({
      ...StyleSheet.absoluteFillObject,
      borderRadius: style.borderRadius,
      borderWidth: 1,
      borderColor: grey4,
    })
    expect(outline.props.pointerEvents).toBe("none")
    expect(grey4).toBe("#393939")
    expect(contrast(grey4, page)).toBeGreaterThan(1.75)
    // Neither view under it has a border.
    expect(style.borderWidth).toBeUndefined()
    expect(StyleSheet.flatten(clip.props.style).borderWidth).toBeUndefined()
  })
})
