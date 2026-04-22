/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react/display-name */
import React, { memo, useMemo } from "react"
import { useTheme } from "@rneui/themed"
import { Marker } from "react-native-maps"

type MarkerItem = {
  username: string
  source: "blink" | "flash"
  mapInfo: {
    title: string
    coordinates: {
      latitude: number
      longitude: number
    }
  }
  acceptsFlash?: boolean
  redeemTopup?: boolean
  hasRewards?: boolean
}

type Props = {
  blinkData: any
  flashData: any
  onMarkerPress: (item: MarkerItem) => void
}

const BusinessMarker: React.FC<{
  item: MarkerItem
  index: number
  pinColor: string
  onMarkerPress: (item: MarkerItem) => void
}> = memo(({ item, index, pinColor, onMarkerPress }) => {
  const key = `${item.username}-${item.mapInfo.title}-${index}`

  return (
    <Marker
      coordinate={item.mapInfo.coordinates}
      key={key}
      pinColor={pinColor}
      tracksViewChanges={false}
      onPress={() => onMarkerPress(item)}
    />
  )
})

export const CustomMarker: React.FC<Props> = memo(
  ({ blinkData, flashData, onMarkerPress }) => {
    const { colors } = useTheme().theme

    const markerData = useMemo(() => {
      const setServiceDefaults = (item: any) => ({
        ...item,
        acceptsFlash: item.acceptsFlash ?? true,
        redeemTopup: item.redeemTopup ?? false,
        hasRewards: item.hasRewards ?? false,
      })

      const blinkMarkers =
        blinkData?.businessMapMarkers?.map((item: any) =>
          setServiceDefaults({
            ...item,
            source: "blink" as const,
          }),
        ) ?? []

      const flashMarkers =
        flashData?.businessMapMarkers?.map((item: any) =>
          setServiceDefaults({
            ...item,
            source: "flash" as const,
          }),
        ) ?? []

      return [...blinkMarkers, ...flashMarkers].filter(Boolean)
    }, [blinkData, flashData])

    return (
      <>
        {useMemo(
          () =>
            markerData.map((item: MarkerItem, index: number) => (
              <BusinessMarker
                key={`${item.username}-${item.mapInfo.title}-${index}`}
                item={item}
                index={index}
                pinColor={colors._orange}
                onMarkerPress={onMarkerPress}
              />
            )),
          [markerData, colors, onMarkerPress],
        )}
      </>
    )
  },
  (prevProps, nextProps) => {
    return (
      prevProps.flashData === nextProps.flashData &&
      prevProps.blinkData === nextProps.blinkData &&
      prevProps.onMarkerPress === nextProps.onMarkerPress
    )
  },
)
