import React from "react"
import { StyleProp, TouchableOpacity, View, ViewStyle } from "react-native"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import Icon from "react-native-vector-icons/Ionicons"
import { testProps } from "@app/utils/testProps"

type ButtonForButtonGroupProps = {
  id: string
  text: string
  icon?:
    | string
    | {
        selected: React.ReactElement
        normal: React.ReactElement
      }
}

const ButtonForButtonGroup: React.FC<
  ButtonForButtonGroupProps & {
    selected: boolean
    onPress: () => void
  }
> = ({ text, icon, selected, onPress }) => {
  const { colors } = useTheme().theme
  const styles = useStyles(Boolean(selected))
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.button,
        selected && {
          borderColor: colors.primary,
          backgroundColor: colors.primary + "10",
        },
      ]}
      activeOpacity={0.7}
    >
      {icon &&
        (typeof icon === "string" ? (
          <Icon style={styles.iconText} name={icon} />
        ) : selected ? (
          icon.selected
        ) : (
          icon.normal
        ))}
      <Text
        {...testProps(text)}
        type="p2"
        color={selected ? colors.primary : colors.black}
        style={{ marginLeft: 10 }}
      >
        {text}
      </Text>
    </TouchableOpacity>
  )
}

export type ButtonGroupProps = {
  selectedId: string
  buttons: ButtonForButtonGroupProps[]
  style?: StyleProp<ViewStyle>
  disabled?: boolean
  onPress: (id: string) => void
}

export const ButtonGroup: React.FC<ButtonGroupProps> = ({
  buttons,
  selectedId,
  onPress,
  style,
  disabled,
}) => {
  const styles = useStyles()
  const selectedButton = buttons.find(({ id }) => id === selectedId)

  return (
    <View style={[styles.buttonGroup, style]}>
      {!disabled &&
        buttons.map((props) => (
          <ButtonForButtonGroup
            key={props.id}
            {...props}
            onPress={() => {
              if (selectedId !== props.id) {
                onPress(props.id)
              }
            }}
            selected={selectedId === props.id}
          />
        ))}
      {disabled && selectedButton && (
        <ButtonForButtonGroup {...selectedButton} selected={true} onPress={() => {}} />
      )}
    </View>
  )
}

const useStyles = makeStyles(({ colors }, selected: boolean) => ({
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.grey4,
    backgroundColor: colors.grey5,
  },
  iconText: {
    fontSize: 16,
    color: selected ? colors.primary : colors.grey1,
    marginRight: 8,
  },
  buttonGroup: {
    flexDirection: "row",
    gap: 10,
  },
}))
