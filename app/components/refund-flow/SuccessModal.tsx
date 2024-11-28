import React from "react"
import { View } from "react-native"
import Modal from "react-native-modal"
import { GaloyIcon } from "../atomic/galoy-icon"
import { makeStyles, useTheme } from "@rneui/themed"
import { SuccessIconAnimation } from "../success-animation"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

type Props = {
  isVisible: boolean
}

const SuccessModal: React.FC<Props> = ({ isVisible }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()

  return (
    <Modal
      isVisible={isVisible}
      backdropOpacity={0.5}
      backdropColor={colors.black}
      animationIn={"bounceIn"}
      animationOut={"bounceOut"}
      onModalHide={() => navigation.pop(2)}
    >
      <View style={styles.container}>
        <SuccessIconAnimation>
          <GaloyIcon name={"payment-success"} size={128} />
        </SuccessIconAnimation>
      </View>
    </Modal>
  )
}

export default SuccessModal

const useStyles = makeStyles(({ colors }) => ({
  container: {
    height: "50%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    borderRadius: 20,
  },
}))
