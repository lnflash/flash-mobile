import React, { useState } from "react"
import { View, TouchableOpacity } from "react-native"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"
import Tooltip from "react-native-walkthrough-tooltip"

type Props = {
  isChecked?: boolean
  onCheck: () => void
}

const CheckBoxField: React.FC<Props> = ({ isChecked, onCheck }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

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
        <Text type="bl">Do you want a Flash terminal?</Text>
      </TouchableOpacity>
      <Tooltip
        isVisible={tooltipVisible}
        content={
          <Text>
            A Flash Terminal is a smart device that can accept payment via Flash for your
            business and print receipts. A customer service representative will contact
            you if you check this box.
          </Text>
        }
        placement="top"
        onClose={() => setTooltipVisible(false)}
      >
        <TouchableOpacity onPress={() => setTooltipVisible(true)}>
          <Icon
            name={"help-circle"}
            size={25}
            color={colors._lightBlue}
            type="ionicon"
            style={{ marginHorizontal: 10 }}
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
