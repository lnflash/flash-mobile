import React from "react"
import { StyleSheet, View } from "react-native"
import Svg, { Defs, Ellipse, Mask, Rect } from "react-native-svg"

import type { IdentitySide } from "@app/store/redux/slices/accountUpgradeSlice"

type Props = {
  side: IdentitySide
  width: number
  height: number
}

/** ISO/IEC 7810 ID-1 card ratio (85.60 x 53.98 mm). */
const CARD_ASPECT = 1.586
/** Fraction of the view width the card guide occupies. */
const CARD_WIDTH_RATIO = 0.88
/** Selfie oval as a fraction of the view width / height. */
const OVAL_WIDTH_RATIO = 0.7
const OVAL_HEIGHT_RATIO = 0.48

const SCRIM = "rgba(0, 0, 0, 0.62)"
const GUIDE = "#FFFFFF"

/**
 * Dark scrim with a transparent window: a rounded card for the ID sides, an
 * oval for the selfie. Drawn with react-native-svg (already a dependency) so
 * the cut-out is a real hole in the scrim, not a drawn border.
 *
 * The window is a framing aid only; the still is the full camera frame and
 * is not cropped to it.
 */
const CaptureOverlay: React.FC<Props> = ({ side, width, height }) => {
  if (!width || !height) return null

  const cx = width / 2
  const cy = height / 2

  let hole: React.ReactElement
  let outline: React.ReactElement
  if (side === "selfie") {
    const rx = (width * OVAL_WIDTH_RATIO) / 2
    const ry = (height * OVAL_HEIGHT_RATIO) / 2
    hole = <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="black" />
    outline = (
      <Ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="none"
        stroke={GUIDE}
        strokeWidth={3}
      />
    )
  } else {
    const w = width * CARD_WIDTH_RATIO
    const h = w / CARD_ASPECT
    const x = cx - w / 2
    const y = cy - h / 2
    hole = <Rect x={x} y={y} width={w} height={h} rx={16} fill="black" />
    outline = (
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={16}
        fill="none"
        stroke={GUIDE}
        strokeWidth={3}
      />
    )
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="capture-overlay">
      <Svg width={width} height={height}>
        <Defs>
          <Mask id="window">
            <Rect x={0} y={0} width={width} height={height} fill="white" />
            {hole}
          </Mask>
        </Defs>
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill={SCRIM}
          mask="url(#window)"
        />
        {outline}
      </Svg>
    </View>
  )
}

export default CaptureOverlay
