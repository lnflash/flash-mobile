import { TouchableOpacity, View } from "react-native"
import { testProps } from "@app/utils/testProps"
import { makeStyles, useTheme, Text, Divider } from "@rneui/themed"
import { useState } from "react"
import Svg, { Path } from "react-native-svg"

const ChevronDown = ({ color }: { color: string }) => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <Path
      d="M6 9L12 15L18 9"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
)

const ChevronRight = ({ color }: { color: string }) => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <Path
      d="M9 6L15 12L9 18"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
)

export const SettingsGroup: React.FC<{
  name?: string
  items: React.FC[]
  initiallyExpanded?: boolean
}> = ({ name, items, initiallyExpanded = true }) => {
  const styles = useStyles()
  const {
    theme: { colors },
  } = useTheme()
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded)

  const filteredItems = items.filter((x) => x({}) !== null)

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded)
  }

  return (
    <View style={styles.container}>
      {name && (
        <TouchableOpacity
          onPress={toggleExpanded}
          style={styles.headerContainer}
          {...testProps(name + "-group")}
        >
          <Text type="p2" bold style={styles.headerText}>
            {name}
          </Text>
          {isExpanded ? (
            <ChevronDown color={colors.grey1} />
          ) : (
            <ChevronRight color={colors.grey1} />
          )}
        </TouchableOpacity>
      )}
      {isExpanded && (
        <View style={styles.groupCard}>
          {filteredItems.map((Element, index) => (
            <View key={index}>
              <Element />
              {index < filteredItems.length - 1 && (
                <Divider color={colors.grey4} style={styles.divider} />
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    marginBottom: 5,
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
  },
  headerText: {
    flex: 1,
  },
  groupCard: {
    marginTop: 5,
    backgroundColor: colors.grey5,
    borderRadius: 12,
    overflow: "hidden",
  },
  divider: {
    marginHorizontal: 10,
  },
}))
