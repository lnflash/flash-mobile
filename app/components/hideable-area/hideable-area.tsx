import React, { ReactNode } from "react"
import { Text } from "@rneui/themed"
import { TextStyle } from "react-native"

interface HideableAreaProps {
  children: ReactNode
  isContentVisible: boolean
  hiddenContent?: ReactNode
  style?: TextStyle
}

const HideableArea: React.FC<HideableAreaProps> = ({
  children,
  isContentVisible,
  hiddenContent,
  style = {},
}) => {
  if (isContentVisible) {
    return (
      <>
        {hiddenContent || (
          <Text type="h2" bold style={style}>
            ****
          </Text>
        )}
      </>
    )
  }

  return <>{children}</>
}

export default HideableArea
