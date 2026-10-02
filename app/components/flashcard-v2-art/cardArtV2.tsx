import React from 'react';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Use,
} from 'react-native-svg';

/**
 * FLASH CARD v2, Concept A "Bearer": the card face as vector.
 *
 * SHARED FILE. It is copied byte-for-byte into flash-pos and flash-mobile,
 * and each repo has a parity test that hashes CARD_ART against the same
 * expected digest. Change it in both repos (and both digests) or not at all.
 *
 * Geometry is measured off the chosen design sheet's front card
 * (flash-card-assets source/ecashNFC-v1.jpg); colours are the asset pack's
 * where the sheet agrees, and the lift and the chip gold are fitted to the
 * sheet itself. 1 unit = 1 dp on a 320 dp card, and 0.2675 mm of the
 * physical card.
 *
 * Rules that keep Android and iOS identical:
 * - one <Svg> for the art, never a nested <Svg x y>;
 * - every gradient in userSpaceOnUse;
 * - opacity on the fill or stroke of leaf elements, never <G opacity>
 *   (that is an offscreen layer on Android), and on a gradient stop only
 *   in whole steps of 1/255 where it is small (Android keeps 8 bits);
 * - no <Text>, <Pattern>, <Image> or filters. FeTurbulence is a no-op stub
 *   in react-native-svg 15 and Android's Pattern ignores the viewBox, so
 *   the matte "noise" is a seeded vector grain; type is outlined Inter 4.001
 *   (SIL OFL 1.1; see THIRD_PARTY_NOTICES.md), so no font can fall back.
 */

/** The card's palette. No green anywhere: Flash green belongs to the app. */
export const CARD_PALETTE = {
  /** Matte near-black: the sheet's unlit right edge reads (8, 9, 11). */
  base: '#080a0d',
  /** Bitcoin orange, the one accent. */
  orange: '#f97316',
  /**
   * Muted satin chip gold, in the order the plate's light runs: a deep
   * amber top-left corner, a light band across the middle, a darker
   * bottom-right.
   */
  goldShadow: '#805711',
  goldLow: '#a88232',
  goldLight: '#bc933a',
  goldMid: '#b6862f',
  goldDark: '#a5761c',
  chipLine: '#8a6524',
  /**
   * The lift's light: a cool violet-white. Over the base (whose green runs
   * 2 above its red) it lands the plateau on the sheet's blue-black, about
   * (17, 18, 23), never charcoal.
   */
  lift: '#d8b8ff',
  /** The brand bolt, as a warm-gold watermark. */
  watermark: '#f5c96b',
  nfcGrey: '#8b8f96',
  white: '#ffffff',
  black: '#000000',
} as const;

const P = CARD_PALETTE;

/** The Flash bolt's yellow face (flash-bolt-on-dark.svg, 0 0 236.5 366). */
const BOLT =
  'M124.1,342.8c-11.8-3.1-21.4-11.1-26.8-22-5.1-10.1-6-22.6-1.5-33.1l15.3-33,17.8-37.6c.3-.7-.1-1.6-.4-2.1s-1-.9-1.9-.9h-40.8c-9,0-17.4-2.6-24.7-7.9-5-3.6-9.1-8.1-12.3-13.4-5.6-9.4-7.3-21.3-4.3-31.8l4.3-14.8,32.1-112C85.2,13.5,102.6-.5,123.8,0c14.7.4,28.3,8.2,35.6,21,5.7,10,6.7,21.9,3.5,32.9l-6.6,22.7-15.4,51.9c-.2.8-.3,1.5.2,2.1s1,1.1,1.9,1.1h53.6c5.7,0,11,1.7,16,4,13.5,6.2,22.4,19.3,23.8,34,.8,8.4-.9,16.3-4.6,23.7l-8.2,17.8-50.5,108.9c-8.4,18.2-29.3,27.9-48.8,22.7Z';

/* eslint-disable no-bitwise -- mulberry32 is 32-bit integer arithmetic. */
/** mulberry32: a tiny seeded PRNG, so the grain is the same in every build. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* eslint-enable no-bitwise */

/**
 * The matte grain: one tile of `cells` x `cells` square specks, `perTone`
 * light and `perTone` dark, balanced so that EVERY row and column of the
 * tile holds floor(perTone / cells) or one more of each tone. A plain
 * shuffle left a row with 15 dark specks and 1 light one: a dark line that
 * repeated every tile down the card.
 *
 * The cells take the symbols of a seeded Latin square (row, column and
 * symbol orders each shuffled by Fisher-Yates on mulberry32): symbols below
 * `base` are light, the next `base` dark, and the spare specks go one per
 * row on the next symbol, in shuffled rows (light first, then dark), so
 * they spread over distinct rows and columns too. Returns one path per tone,
 * in row-major order.
 */
export function grainTile(
  seed: number,
  tile: number,
  cells: number,
  perTone: number,
): [string, string] {
  const rand = mulberry32(seed);
  const shuffled = () => {
    const order = Array.from({length: cells}, (_, i) => i);
    for (let i = cells - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  };
  const rows = shuffled();
  const cols = shuffled();
  const symbols = shuffled();
  const spareRows = shuffled();
  const base = Math.floor(perTone / cells);
  const spare = perTone - base * cells;
  if (2 * base >= cells || 2 * spare > cells) {
    throw new Error('grainTile: too many specks for one Latin square');
  }
  const spareRank: number[] = [];
  spareRows.forEach((row, rank) => {
    spareRank[row] = rank;
  });
  const light: number[] = [];
  const dark: number[] = [];
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      const symbol = symbols[(rows[r] + cols[c]) % cells];
      const cell = r * cells + c;
      if (symbol < base) {
        light.push(cell);
      } else if (symbol < 2 * base) {
        dark.push(cell);
      } else if (symbol === 2 * base && spareRank[r] < 2 * spare) {
        (spareRank[r] < spare ? light : dark).push(cell);
      }
    }
  }
  const side = tile / cells;
  // (n * tile) / cells, not n * side: an exact quotient prints as "2.4".
  const at = (n: number) => (n * tile) / cells;
  const path = (picked: number[]) =>
    picked
      .map(
        c =>
          `M${at(c % cells)} ${at(
            Math.floor(c / cells),
          )}h${side}v${side}h-${side}z`,
      )
      .join('');
  return [path(light), path(dark)];
}

const GRAIN_SEED = 0x0c67f1a5;
const [GRAIN_LIGHT, GRAIN_DARK] = grainTile(GRAIN_SEED, 32, 40, 285);

/**
 * Every value the card face is drawn from, layers bottom to top. The parity
 * tests hash this object, so the z-order is data: the art renders `layers`
 * in order.
 */
export const CARD_ART = {
  viewBox: '0 0 320 202',
  width: 320,
  height: 202,
  /** ISO/IEC 7810 ID-1 corner, 3.18 mm: the die-cut the real card has. */
  radius: 11.9,
  mmPerUnit: 0.2675,
  palette: P,
  layers: [
    'base',
    'lift',
    'watermark',
    'grain',
    'slash',
    'rule',
    'halo',
    'ring',
    'plate',
    'contacts',
    'chipArcs',
    'nfc',
    'btc',
    'flash',
    'bearer',
    'edge',
  ],
  /**
   * A soft cool lift, brightest around 45 % x / 47 % y, broad, and gone at
   * the right edge: [offset, opacity of palette.lift]. Fitted to the sheet's
   * field (803 samples; on the Pixel the mean error is under half a level
   * per channel, down from 1.1 red and 1.6 blue with a white lift). Each
   * opacity is a whole step of 1/255: Android keeps a stop's opacity in 8
   * bits, so any other value would draw differently there and on iOS.
   */
  lift: {
    cx: 145,
    cy: 95,
    r: 165,
    stops: [
      [0, 11 / 255],
      [0.35, 11 / 255],
      [0.6, 9 / 255],
      [0.8, 5 / 255],
      [1, 0],
    ],
  },
  /**
   * The bolt's ink box lands on x 129.6–190.4 (centred on 160), y 22–130.1.
   * 0.02, not the sheet-matched 0.028: the brand bolt is rounder and heavier
   * than the sheet's, and at 0.028 it read as a smudge on the phone.
   */
  watermark: {d: BOLT, x: 116.1, y: 22, scale: 0.314, opacity: 0.02},
  /**
   * One 32-unit tile of 0.8-unit specks (17.8 % light, 17.8 % dark, 7 or 8
   * of each in every row and column), instanced cols x rows times with
   * <Use>: about 3/255 of monochrome noise with no line in it.
   */
  grain: {
    seed: GRAIN_SEED,
    tile: 32,
    cells: 40,
    perTone: 285,
    cols: 10,
    rows: 7,
    light: {d: GRAIN_LIGHT, opacity: 0.024},
    dark: {d: GRAIN_DARK, opacity: 0.3},
  },
  /**
   * Burnt orange, 46 % in the corner brightening to 68 % at the tip, where
   * the hypotenuse meets the bottom edge (tipX).
   */
  slash: {
    d: 'M0 157 L112.9 202 L0 202 Z',
    tipX: 112.9,
    x1: 0,
    y1: 202,
    x2: 95.1,
    y2: 161,
    stops: [
      [0, 0.46],
      [1, 0.68],
    ],
  },
  /**
   * The thin orange rule on the left edge; the clip tapers it into the
   * corners. It splits where the slash meets the edge: full above, and
   * lighter over the slash, which it brightens by about a fifth as on the
   * sheet (not a bar of its own along the slash).
   */
  rule: {width: 1.8, split: 157, opacity: 0.5, slashOpacity: 0.25},
  /** The chip group: halo, ring, plate, contacts and arcs move together. */
  halo: {
    cx: 50.1,
    cy: 53,
    r: 32,
    stops: [
      [0, 0.14],
      [0.4, 0.12],
      [0.7, 0.07],
      [1, 0],
    ],
  },
  /** Perimeter 168.0: exactly 42 dash periods, so no seam. */
  ring: {
    x: 26.2,
    y: 30.1,
    w: 47.8,
    h: 39.3,
    rx: 3.6,
    strokeWidth: 0.7,
    opacity: 0.8,
    dash: [2, 2],
  },
  /**
   * The plate: one gradient across it at about 30 degrees, fitted to the
   * sheet's plate (1012 samples between the contact lines): deep at the
   * top-left corner, light through the middle, darker again bottom-right.
   * No outline: the sheet's plate keeps its full brightness to the edge.
   */
  plate: {
    x: 31.6,
    y: 35.2,
    w: 37,
    h: 28.8,
    rx: 2.4,
    gold: {
      x1: 30,
      y1: 38,
      x2: 70.2,
      y2: 61.2,
      stops: [
        [0, P.goldShadow],
        [0.3, P.goldLow],
        [0.55, P.goldLight],
        [0.8, P.goldMid],
        [1, P.goldDark],
      ],
    },
  },
  /** Two verticals at about 1/3 and 2/3, four horizontals in the lower two-thirds. */
  contacts: {
    d: 'M43.2 35.2V64M57 35.2V64M31.6 45.1H68.6M31.6 49.9H68.6M31.6 54.1H68.6M31.6 58.9H68.6',
    width: 0.55,
    opacity: 0.8,
  },
  /**
   * The chip-side contactless mark: three arcs, no dot, on the axis y = 47.
   * Static builds draw them at `restOpacity`; an animated build draws each
   * as an overlay viewed through `box`, which holds all three with caps.
   */
  chipArcs: {
    d: [
      'M76.2 41.8A6.83 6.83 0 0 1 76.2 52.2',
      'M80.9 40.55A7.95 7.95 0 0 1 80.9 53.45',
      'M85.4 39.65A8.53 8.53 0 0 1 85.4 54.35',
    ],
    width: 1.2,
    restOpacity: 0.6,
    box: {x: 75, y: 38, w: 16, h: 18},
  },
  /** The grey bottom mark: its right edge sits on the card's centre line. */
  nfc: {
    dot: {cx: 144.2, cy: 181.9, r: 1.5},
    d: [
      'M147.6 178A4.37 4.37 0 0 1 147.6 185.8',
      'M151 176.65A5.91 5.91 0 0 1 151 187.15',
      'M154.4 175.45A7.05 7.05 0 0 1 154.4 188.35',
    ],
    width: 1.2,
    opacity: 0.8,
  },
  /** ₿, Inter Bold, cap 5.2: tone-on-tone on the slash, on BEARER CARD's baseline. */
  btc: {
    x: 14.5,
    y: 183.6,
    opacity: 0.8,
    d: 'M0.95 6.45H1.37V5.8H1.92V6.45H2.34V5.79C3.39 5.73 3.94 5.15 3.94 4.37C3.94 3.59 3.39 3.13 2.8 3.11V3.05C3.34 2.93 3.74 2.55 3.74 1.94C3.74 1.24 3.27 0.71 2.34 0.62V-0.05H1.92V0.6H1.37V-0.05H0.95V0.6H-0.04V5.8H0.95ZM1.02 4.92V3.51H1.97C2.51 3.51 2.85 3.83 2.85 4.26C2.85 4.66 2.57 4.92 1.94 4.92ZM1.02 2.78V1.47H1.89C2.38 1.47 2.66 1.73 2.66 2.11C2.66 2.53 2.32 2.78 1.86 2.78Z',
  },
  /**
   * FLASH, Inter Black at -0.02 em, cap 11.35: ink x 249.6–298.9, cap top
   * 169, baseline 180.3.
   */
  flash: {
    x: 249.6,
    y: 169,
    inkRight: 298.9,
    d: 'M0 11.3H3.1V7.4H7.5V5H3.1V2.4H8V-0H0ZM8.8 11.3H16.5V8.8H11.9V-0H8.8ZM17 11.3H20.4L21 9.1H24.5L25.2 11.3H28.7L24.8 -0H20.6ZM21.7 6.8C22.1 5.4 22.4 4 22.7 2.5C23 4 23.4 5.4 23.8 6.8ZM33.6 11.4C36.5 11.4 38.2 10.2 38.2 7.9C38.2 6.2 37.2 5 34.7 4.5L33.7 4.3C32.6 4 32.2 3.7 32.2 3.2C32.2 2.7 32.6 2.3 33.6 2.3C34.6 2.3 35 2.8 35.1 3.5H38C38 1.3 36.3 -0.2 33.6 -0.2C30.9 -0.2 29 1.3 29 3.4C29 5.2 30.2 6.2 32.2 6.6L33.4 6.9C34.6 7.1 35.1 7.4 35.1 7.9C35.1 8.5 34.5 8.9 33.6 8.9C32.4 8.9 31.7 8.4 31.6 7.3H28.7C28.7 10.2 30.6 11.4 33.6 11.4ZM39.1 11.3H42.1V6.7H46.2V11.3H49.3V-0H46.2V4.3H42.1V-0H39.1Z',
  },
  /** BEARER CARD, Inter SemiBold caps at +0.27 em, cap 3.9: ink x 246.3–297.5. */
  bearer: {
    x: 246.3,
    y: 185.5,
    opacity: 0.9,
    d: 'M0.04 3.9H1.61C2.5 3.9 2.94 3.44 2.94 2.84C2.94 2.25 2.52 1.9 2.11 1.88V1.84C2.49 1.75 2.79 1.49 2.79 1.01C2.79 0.43 2.37 0 1.53 0H0.04ZM0.74 3.32V2.17H1.52C1.96 2.17 2.23 2.44 2.23 2.78C2.23 3.09 2.02 3.32 1.5 3.32ZM0.74 1.66V0.58H1.46C1.88 0.58 2.09 0.8 2.09 1.1C2.09 1.45 1.81 1.66 1.44 1.66ZM5.02 3.9H7.56V3.31H5.72V2.22H7.42V1.64H5.72V0.59H7.55V0H5.02ZM9.45 3.9H10.21L10.53 2.93H11.99L12.32 3.9H13.09L11.7 0H10.81ZM10.72 2.37 10.88 1.87C10.99 1.53 11.11 1.09 11.25 0.54C11.39 1.08 11.52 1.52 11.63 1.87L11.8 2.37ZM15.06 3.9H15.76V2.47H16.49L17.25 3.9H18.04L17.19 2.35C17.65 2.17 17.89 1.78 17.89 1.25C17.89 0.51 17.41 0 16.52 0H15.06ZM15.76 1.89V0.59H16.41C16.94 0.59 17.18 0.83 17.18 1.25C17.18 1.66 16.94 1.89 16.41 1.89ZM20 3.9H22.55V3.31H20.7V2.22H22.4V1.64H20.7V0.59H22.54V0H20ZM24.7 3.9H25.4V2.47H26.12L26.89 3.9H27.67L26.83 2.35C27.29 2.17 27.53 1.78 27.53 1.25C27.53 0.51 27.05 0 26.15 0H24.7ZM25.4 1.89V0.59H26.05C26.58 0.59 26.81 0.83 26.81 1.25C26.81 1.66 26.58 1.89 26.05 1.89ZM34.1 3.95C35.02 3.95 35.64 3.35 35.75 2.6H35.04C34.95 3.06 34.57 3.33 34.11 3.33C33.47 3.33 33.02 2.85 33.02 1.95C33.02 1.07 33.47 0.57 34.11 0.57C34.58 0.57 34.95 0.84 35.04 1.3H35.74C35.62 0.44 34.96 -0.05 34.1 -0.05C33.08 -0.05 32.32 0.69 32.32 1.95C32.32 3.21 33.07 3.95 34.1 3.95ZM37.44 3.9H38.2L38.52 2.93H39.98L40.31 3.9H41.08L39.69 0H38.8ZM38.71 2.37 38.87 1.87C38.98 1.53 39.1 1.09 39.24 0.54C39.38 1.08 39.51 1.52 39.62 1.87L39.79 2.37ZM43.05 3.9H43.75V2.47H44.48L45.24 3.9H46.03L45.18 2.35C45.64 2.17 45.88 1.78 45.88 1.25C45.88 0.51 45.41 0 44.51 0H43.05ZM43.75 1.89V0.59H44.4C44.93 0.59 45.17 0.83 45.17 1.25C45.17 1.66 44.93 1.89 44.41 1.89ZM49.31 3.9C50.5 3.9 51.2 3.16 51.2 1.94C51.2 0.73 50.5 0 49.34 0H47.99V3.9ZM48.69 3.3V0.6H49.3C50.1 0.6 50.51 1.05 50.51 1.94C50.51 2.85 50.1 3.3 49.28 3.3Z',
  },
  /** A faint hairline just inside the edge. */
  edge: {inset: 0.3, width: 0.6, opacity: 0.02},
} as const;

export type CardLayer = (typeof CARD_ART.layers)[number];

const A = CARD_ART;
const W = A.width;
const H = A.height;

const stops = (list: ReadonlyArray<readonly [number, number]>, color: string) =>
  list.map(([offset, opacity]) => (
    <Stop
      key={offset}
      offset={offset}
      stopColor={color}
      stopOpacity={opacity}
    />
  ));

const GRAIN_USES = Array.from({length: A.grain.cols * A.grain.rows}, (_, i) => (
  <Use
    key={i}
    href="#cardGrain"
    x={(i % A.grain.cols) * A.grain.tile}
    y={Math.floor(i / A.grain.cols) * A.grain.tile}
  />
));

/** Each layer of the face; the chip-side arcs only in a static build. */
const LAYER: Record<CardLayer, (staticArcs: boolean) => React.ReactNode> = {
  base: () => <Rect x={0} y={0} width={W} height={H} fill={P.base} />,
  lift: () => <Rect x={0} y={0} width={W} height={H} fill="url(#cardLift)" />,
  watermark: () => (
    <G
      transform={`translate(${A.watermark.x} ${A.watermark.y}) scale(${A.watermark.scale})`}>
      <Path
        d={A.watermark.d}
        fill={P.watermark}
        fillOpacity={A.watermark.opacity}
      />
    </G>
  ),
  grain: () => GRAIN_USES,
  slash: () => <Path d={A.slash.d} fill="url(#cardSlash)" />,
  rule: () => (
    <>
      <Rect
        x={0}
        y={0}
        width={A.rule.width}
        height={A.rule.split}
        fill={P.orange}
        fillOpacity={A.rule.opacity}
      />
      <Rect
        x={0}
        y={A.rule.split}
        width={A.rule.width}
        height={H - A.rule.split}
        fill={P.orange}
        fillOpacity={A.rule.slashOpacity}
      />
    </>
  ),
  halo: () => (
    <Circle cx={A.halo.cx} cy={A.halo.cy} r={A.halo.r} fill="url(#cardHalo)" />
  ),
  ring: () => (
    <Rect
      x={A.ring.x}
      y={A.ring.y}
      width={A.ring.w}
      height={A.ring.h}
      rx={A.ring.rx}
      ry={A.ring.rx}
      fill="none"
      stroke={P.orange}
      strokeWidth={A.ring.strokeWidth}
      strokeOpacity={A.ring.opacity}
      strokeDasharray={A.ring.dash}
    />
  ),
  plate: () => (
    <Rect
      x={A.plate.x}
      y={A.plate.y}
      width={A.plate.w}
      height={A.plate.h}
      rx={A.plate.rx}
      ry={A.plate.rx}
      fill="url(#cardGold)"
    />
  ),
  contacts: () => (
    <Path
      d={A.contacts.d}
      fill="none"
      stroke={P.chipLine}
      strokeWidth={A.contacts.width}
      strokeOpacity={A.contacts.opacity}
    />
  ),
  chipArcs: staticArcs =>
    staticArcs ? (
      <Path
        d={A.chipArcs.d.join('')}
        fill="none"
        stroke={P.orange}
        strokeWidth={A.chipArcs.width}
        strokeOpacity={A.chipArcs.restOpacity}
        strokeLinecap="round"
      />
    ) : null,
  nfc: () => (
    <>
      <Circle
        cx={A.nfc.dot.cx}
        cy={A.nfc.dot.cy}
        r={A.nfc.dot.r}
        fill={P.nfcGrey}
        fillOpacity={A.nfc.opacity}
      />
      <Path
        d={A.nfc.d.join('')}
        fill="none"
        stroke={P.nfcGrey}
        strokeWidth={A.nfc.width}
        strokeOpacity={A.nfc.opacity}
        strokeLinecap="round"
      />
    </>
  ),
  btc: () => (
    <G transform={`translate(${A.btc.x} ${A.btc.y})`}>
      <Path d={A.btc.d} fill={P.orange} fillOpacity={A.btc.opacity} />
    </G>
  ),
  flash: () => (
    <G transform={`translate(${A.flash.x} ${A.flash.y})`}>
      <Path d={A.flash.d} fill={P.white} />
    </G>
  ),
  bearer: () => (
    <G transform={`translate(${A.bearer.x} ${A.bearer.y})`}>
      <Path d={A.bearer.d} fill={P.orange} fillOpacity={A.bearer.opacity} />
    </G>
  ),
  edge: () => (
    <Rect
      x={A.edge.inset}
      y={A.edge.inset}
      width={W - 2 * A.edge.inset}
      height={H - 2 * A.edge.inset}
      rx={A.radius - A.edge.inset}
      ry={A.radius - A.edge.inset}
      fill="none"
      stroke={P.white}
      strokeWidth={A.edge.width}
      strokeOpacity={A.edge.opacity}
    />
  ),
};

export interface CardArtV2Props {
  /**
   * Draw the chip-side contactless arcs into the art at their resting 60 %
   * (the printed card, flash-mobile). An animated build passes false and
   * draws them as its own overlays.
   */
  staticArcs?: boolean;
}

/**
 * The card face. It fills its parent, which gives it the card's size
 * (aspect 320:202) and clips it to CARD_ART.radius over CARD_PALETTE.base:
 * react-native-svg truncates a numeric <Svg> width or height to whole dp,
 * which left a strip of the container showing along two edges. It is drawn
 * once into the SVG view's bitmap; ancestor transforms (a scale or a move)
 * never re-render it.
 */
export const CardArtV2 = React.memo(function CardArtV2({
  staticArcs = true,
}: CardArtV2Props) {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={A.viewBox}
      preserveAspectRatio="none">
      <Defs>
        <ClipPath id="cardClip">
          <Rect x={0} y={0} width={W} height={H} rx={A.radius} ry={A.radius} />
        </ClipPath>
        <RadialGradient
          id="cardLift"
          gradientUnits="userSpaceOnUse"
          cx={A.lift.cx}
          cy={A.lift.cy}
          fx={A.lift.cx}
          fy={A.lift.cy}
          r={A.lift.r}>
          {stops(A.lift.stops, P.lift)}
        </RadialGradient>
        <LinearGradient
          id="cardSlash"
          gradientUnits="userSpaceOnUse"
          x1={A.slash.x1}
          y1={A.slash.y1}
          x2={A.slash.x2}
          y2={A.slash.y2}>
          {stops(A.slash.stops, P.orange)}
        </LinearGradient>
        <RadialGradient
          id="cardHalo"
          gradientUnits="userSpaceOnUse"
          cx={A.halo.cx}
          cy={A.halo.cy}
          fx={A.halo.cx}
          fy={A.halo.cy}
          r={A.halo.r}>
          {stops(A.halo.stops, P.orange)}
        </RadialGradient>
        <LinearGradient
          id="cardGold"
          gradientUnits="userSpaceOnUse"
          x1={A.plate.gold.x1}
          y1={A.plate.gold.y1}
          x2={A.plate.gold.x2}
          y2={A.plate.gold.y2}>
          {A.plate.gold.stops.map(([offset, color]) => (
            <Stop key={offset} offset={offset} stopColor={color} />
          ))}
        </LinearGradient>
        <G id="cardGrain">
          <Path
            d={A.grain.light.d}
            fill={P.white}
            fillOpacity={A.grain.light.opacity}
          />
          <Path
            d={A.grain.dark.d}
            fill={P.black}
            fillOpacity={A.grain.dark.opacity}
          />
        </G>
      </Defs>
      <G clipPath="url(#cardClip)">
        {A.layers.map(id => (
          <React.Fragment key={id}>{LAYER[id](staticArcs)}</React.Fragment>
        ))}
      </G>
    </Svg>
  );
});
