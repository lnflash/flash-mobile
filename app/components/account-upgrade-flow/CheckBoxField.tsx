import React, { useState } from "react"
import { View, TouchableOpacity } from "react-native"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"
import Tooltip from "react-native-walkthrough-tooltip"
import { useI18nContext } from "@app/i18n/i18n-react"

type Props = {
  isChecked?: boolean
  onCheck: () => void
}

const CheckBoxField: React.FC<Props> = ({ isChecked, onCheck }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()

  const [tooltipVisible, setTooltipVisible] = useState(false)

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.container} onPress={onCheck}>
        <Icon
          name={isChecked ? "checkbox" : "checkbox-outline"}
          size={30}
          color={isChecked ? colors.green : colors.grey2}
          type="ionicon"
          style={{ marginRight: 10 }}
        />
        <Text type="bl">{LL.AccountUpgrade.flashTerminal()}</Text>
      </TouchableOpacity>
      <Tooltip
        isVisible={tooltipVisible}
        content={<Text>{LL.AccountUpgrade.flashTerminalTooltip()}</Text>}
        placement="top"
        onClose={() => setTooltipVisible(false)}
      >
        <TouchableOpacity onPress={() => setTooltipVisible(true)}>
          <Icon
            name={"help-circle"}
            size={25}
            color={colors._lightBlue}
            type="ionicon"
            style={{ marginHorizontal: 5 }}
          />
        </TouchableOpacity>
      </Tooltip>
    </View>
  )
}

export default CheckBoxField

const useStyles = makeStyles(() => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
}))
