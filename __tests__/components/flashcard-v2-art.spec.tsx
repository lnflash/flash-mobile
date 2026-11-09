/**
 * The Cashu card's art (the Cashu Card face) is flash-pos's, shared
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
import appTheme from "../../app/rne-theme/theme"

jest.mock("react-native-svg", () => require("../helpers/svg-stub"))

/**
 * sha256 of cardArtV2.tsx itself, with LF line endings: comments, types and
 * formatting included, which neither digest below sees. flash-pos's
 * __tests__/components/cashu/cardArtV2.test.tsx pins the same value for its
 * copy.
 */
const ART_FILE_SHA256 = "6e0b76e7542270cf9a45de8e7a642143b13cbd3d2e91a4573364392cba42b0d6"

/**
 * sha256 of JSON.stringify(CARD_ART): every coordinate, colour, opacity,
 * gradient, flattened mark, outlined glyph and the z-order. flash-pos pins the
 * same value.
 */
const PARITY_DIGEST = "f7ce7004e269bd42be8fb11d7fea12bdc7e65e2e5a677a4cd85d3ebe93ba4ef1"

/**
 * The whole drawn tree (every element, in order, with every prop) under the
 * svg stub, whose host names are flash-pos's; flash-pos pins the same two
 * digests for its copy, under its own jest and stub. Static is this app's
 * card (chip-side arcs drawn in); animated is flash-pos's charge card, which
 * draws those arcs as its own overlays.
 */
const FLASH_POS_RENDER = {
  static: {
    digest: "a607fbd4e4ae3fe5cb1ef9edb672253b97582ff32b8c07b59c2eef1d2043d164",
    paths: 6,
  },
  animated: {
    digest: "5a2efcb2323249a3733be4fd60d550063a060e898463aa0f1e2b0a7d22b1126a",
    paths: 5,
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

  it("draws 22 elements of the kinds flash-pos draws, and nothing else", () => {
    const all = draw()
    expect(all).toHaveLength(22)
    expect(countByType(all)).toEqual({
      RNSVGSvg: 1,
      RNSVGDefs: 1,
      RNSVGClipPath: 1,
      RNSVGLinearGradient: 2,
      RNSVGStop: 7,
      RNSVGGroup: 1,
      RNSVGRect: 3,
      RNSVGPath: FLASH_POS_RENDER.static.paths,
    })
    // No Use, Mask, Text, Image, Pattern or filter: nothing can fall back to
    // another font or decode late, no offscreen layer, and nothing draws
    // differently on Android and iOS.
    const types = new Set(all.map((n) => n.type))
    ;["RNSVGUse", "RNSVGMask", "RNSVGText", "RNSVGImage", "RNSVGPattern"].forEach(
      (type) => expect(types.has(type)).toBe(false),
    )
  })

  it("puts every gradient in user space, and opacity only on leaves", () => {
    const all = draw()
    const gradients = all.filter((n) => /Gradient$/.test(n.type))
    expect(gradients.map((g) => g.props.id).sort()).toEqual(["cardBase", "cardGold"])
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
      props: { width: 320, height: 202, fill: "url(#cardBase)" },
    })
    expect(layers[layers.length - 1]).toMatchObject({
      type: "RNSVGRect",
      props: { fill: "none", stroke: CARD_PALETTE.white, strokeOpacity: 0.02 },
    })
  })

  it("draws the face's colours: the lime field, chip gold, the brand's greens", () => {
    const all = draw()
    const paths = all.filter((n) => n.type === "RNSVGPath")
    const byD = (d: string) => paths.find((n) => n.props.d === d)?.props
    // The mark, the lockup and the caption are outlined paths, never type.
    expect(byD(CARD_ART.mark.d)).toMatchObject({
      fill: CARD_PALETTE.markInk,
      fillOpacity: 57 / 255,
      fillRule: "evenodd",
    })
    expect(byD(CARD_ART.lockup.cashu)).toMatchObject({ fill: CARD_PALETTE.markInk })
    expect(byD(CARD_ART.lockup.card)).toMatchObject({ fill: CARD_PALETTE.inkSoft })
    expect(byD(CARD_ART.caption.d)).toMatchObject({ fill: CARD_PALETTE.ink })
    expect(byD(CARD_ART.plate.d)).toMatchObject({ fill: "url(#cardGold)" })
    expect(new Set(colours(all.map((n) => n.props)))).toEqual(
      new Set([
        "#ddf5a4",
        "#c7e698",
        "#85b879",
        "#558d66",
        "#10271e",
        "#1d3d29",
        "#557a62",
        "#f3e8ae",
        "#d2bb6a",
        "#a98b3d",
        "#ffffff",
      ]),
    )
  })

  it("runs the field and the chip gold light top-left to dark bottom-right", () => {
    const lum = (hex: string) => rgb(hex).reduce((sum, c) => sum + c, 0)
    ;[CARD_ART.base, CARD_ART.plate.gold].forEach((g) => {
      expect(g.x2).toBeGreaterThan(g.x1)
      expect(g.y2).toBeGreaterThan(g.y1)
      const tones = g.stops.map(([, colour]) => lum(colour))
      tones.slice(1).forEach((tone, i) => expect(tone).toBeLessThan(tones[i]))
    })
  })

  it("has no Flash colours or Flash bolt anywhere in the art", () => {
    const file = readFileSync(
      join(__dirname, "../../app/components/flashcard-v2-art/cardArtV2.tsx"),
      "utf8",
    )
    const all = [...colours(CARD_ART), ...colours(draw().map((n) => n.props))]
    expect(all.length).toBeGreaterThan(10)
    // Flash orange and the old near-black base.
    ;["#f97316", "#080a0d"].forEach((hex) => {
      expect(all).not.toContain(hex)
      expect(file.toLowerCase()).not.toContain(hex)
    })
    // The bolt's path, and every Flash-only layer.
    expect(file).not.toContain("M124.1,342.8")
    ;[
      "watermark",
      "flash",
      "bearer",
      "btc",
      "slash",
      "grain",
      "lift",
      "halo",
      "ring",
    ].forEach((layer) =>
      expect(CARD_ART.layers as readonly string[]).not.toContain(layer),
    )
  })

  it("draws the chip-side contactless arcs into this app's still card at their resting 60 %", () => {
    const arcs = CARD_ART.chipArcs.d.join("")
    const find = (all: Node[]) =>
      all.find((n) => n.type === "RNSVGPath" && n.props.d === arcs)
    expect(find(draw())?.props).toMatchObject({
      stroke: CARD_PALETTE.ink,
      strokeOpacity: 0.6,
    })
    // flash-pos's charge card animates them instead.
    expect(find(draw({ staticArcs: false }))).toBeUndefined()
    expect(
      draw({ staticArcs: false }).filter((n) => n.type === "RNSVGPath"),
    ).toHaveLength(FLASH_POS_RENDER.animated.paths)
  })
})

/** The x y pairs of a path of absolute M, L, C, Q and Z commands. */
const points = (d: string) => {
  const n = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number)
  return n.flatMap((_, i) => (i % 2 ? [] : [[n[i], n[i + 1]]]))
}

describe("Cashu card art: what flash-pos reads from it", () => {
  it("keeps the plate, the chip-side arcs and an id slot", () => {
    expect(Object.keys(CARD_ART)).toEqual(
      expect.arrayContaining(["plate", "chipArcs", "idSlot"]),
    )
    expect(CARD_ART.plate).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
      w: expect.any(Number),
      h: expect.any(Number),
      rx: expect.any(Number),
    })
    expect(CARD_ART.chipArcs.d).toHaveLength(3)
  })

  it("holds each arc, caps included, inside the arcs' box, right of the plate", () => {
    const { box, width } = CARD_ART.chipArcs
    const cap = width / 2
    CARD_ART.chipArcs.d.forEach((d) => {
      // "Mx y0 Ar r 0 0 1 x y1": a symmetric arc bulging right.
      const [x, y0, r, , , , , , y1] = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number)
      const half = (y1 - y0) / 2
      const apex = x + r - Math.sqrt(r * r - half * half)
      expect(x - cap).toBeGreaterThanOrEqual(box.x)
      expect(apex + cap).toBeLessThanOrEqual(box.x + box.w)
      expect(y0 - cap).toBeGreaterThanOrEqual(box.y)
      expect(y1 + cap).toBeLessThanOrEqual(box.y + box.h)
    })
    expect(box.x).toBeGreaterThan(CARD_ART.plate.x + CARD_ART.plate.w)
  })

  it("puts the id slot on the card, clear of the large mark and the caption", () => {
    const { right, centerY, capRef } = CARD_ART.idSlot
    expect(right).toBeLessThanOrEqual(CARD_ART.width - CARD_ART.radius)
    expect(centerY + capRef / 2).toBeLessThan(CARD_ART.height)
    const markBottom = Math.max(...points(CARD_ART.mark.d).map(([, y]) => y))
    expect(centerY - capRef / 2).toBeGreaterThan(markBottom)
    const captionRight = Math.max(...points(CARD_ART.caption.d).map(([x]) => x))
    expect(right - captionRight).toBeGreaterThan(100)
    // On the caption's mid-line, at its cap height.
    const captionYs = points(CARD_ART.caption.d).map(([, y]) => y)
    const mid = (Math.min(...captionYs) + Math.max(...captionYs)) / 2
    expect(Math.abs(centerY - mid)).toBeLessThan(0.5)
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
      expect(style.backgroundColor).toBe("#9fc985")
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
        backgroundColor: "#9fc985",
      })
      // Inside it, the one <Svg> of the still card, chip-side arcs drawn in.
      const inClip = (type: string) => clips[0].findAll((n) => String(n.type) === type)
      expect(inClip("RNSVGSvg")).toHaveLength(1)
      const arcs = inClip("RNSVGPath").filter(
        (n) => n.props.d === CARD_ART.chipArcs.d.join(""),
      )
      expect(arcs).toHaveLength(1)
      expect(arcs[0].props.strokeOpacity).toBe(0.6)
      // The art first, then (light theme) the outline over it.
      expect(layers(view)[0]).toBe(clips[0])
    })
  })

  it("outlines the card on the light theme, where the lime field fades into the white row", () => {
    const { layer, background } = appTheme.lightColors as {
      layer: string
      background: string
    }
    // Why: the field's light top-left is all but the row's and the page's
    // colour, so without an outline the card's top and left edges vanish.
    expect(contrast(CARD_PALETTE.lime, layer)).toBeLessThan(1.5)
    expect(contrast(CARD_PALETTE.lime, background)).toBeLessThan(1.5)
    expect(contrast(CARD_PALETTE.base, layer)).toBeLessThan(3)

    const width = 54
    const view = renderArt(width, "light")
    expect(layers(view)).toHaveLength(2)
    const [clip, outline] = layers(view)
    expect(StyleSheet.flatten(clip.props.style).overflow).toBe("hidden")
    expect(outline.props.pointerEvents).toBe("none")
    const style = StyleSheet.flatten(outline.props.style)
    expect(style).toMatchObject({
      ...StyleSheet.absoluteFillObject,
      borderWidth: 1,
      borderColor: CARD_PALETTE.greenDeep,
    })
    expect(style.borderRadius).toBeCloseTo((11.9 * width) / 320, 9)
    // The outline holds the 3:1 non-text contrast against the row, the page
    // and the field's lightest stop.
    ;[layer, background, CARD_PALETTE.lime].forEach((c) =>
      expect(contrast(CARD_PALETTE.greenDeep, c)).toBeGreaterThanOrEqual(3),
    )
    // Drawn over the art, never as a border that would inset it.
    expect(
      StyleSheet.flatten(view.getByTestId("art").props.style).borderWidth,
    ).toBeUndefined()
    expect(StyleSheet.flatten(clip.props.style).borderWidth).toBeUndefined()
  })

  it("draws no outline on the dark theme either: the lime face stands out from the black page", () => {
    const page = appTheme.darkColors?.background as string
    // Why: the base is far from the page's colour.
    expect(contrast(CARD_PALETTE.base, page)).toBeGreaterThan(3)

    const view = renderArt(312, "dark")

    const style = StyleSheet.flatten(view.getByTestId("art").props.style)
    expect(layers(view)).toHaveLength(1)
    const [clip] = layers(view)
    expect(StyleSheet.flatten(clip.props.style).overflow).toBe("hidden")
    expect(style.borderWidth).toBeUndefined()
    expect(StyleSheet.flatten(clip.props.style).borderWidth).toBeUndefined()
  })
})
