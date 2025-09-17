import { useState } from "react"
import { TouchableOpacity, View } from "react-native"
import { makeStyles, useTheme, Text, Divider, Icon } from "@rneui/themed"
import { testProps } from "@app/utils/testProps"

export const SettingsGroup: React.FC<{
  name?: string
  items: React.FC[]
  initiallyExpanded?: boolean
}> = ({ name, items, initiallyExpanded = false }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  const [isExpanded, setIsExpanded] = useState(initiallyExpanded)

  const filteredItems = items.filter((x) => x({}) !== null)

  return (
    <View style={styles.container}>
      {name && (
        <TouchableOpacity
          onPress={() => setIsExpanded(!isExpanded)}
          style={styles.headerContainer}
          {...testProps(name + "-group")}
        >
          <Text type="p2" bold style={styles.headerText}>
            {name}
          </Text>
          {isExpanded ? (
            <Icon name={"chevron-down"} type="ionicon" />
          ) : (
            <Icon name={"chevron-forward"} type="ionicon" />
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
