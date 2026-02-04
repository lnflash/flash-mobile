import React, { useRef } from "react"
import { Dimensions, TouchableOpacity, View } from "react-native"
import { StackNavigationProp } from "@react-navigation/stack"
import Carousel from "react-native-reanimated-carousel"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// assets (replace with your actual Nostr illustrations/icons)
import FeedIcon from "@app/assets/illustrations/social-chat.svg"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"
import { usePersistentStateContext } from "@app/store/persistent-state"

const width = Dimensions.get("window").width

type RenderItemProps = {
  item: {
    type: string
    title: string
    description: string
    image: any
    onPress: () => void
  }
  index: number
}

const NostrQuickStart = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { persistentState, updateState } = usePersistentStateContext()

  const ref = useRef(null)

  let nostrCarouselData = [
    {
      type: "writeYourFirstMessage",
      title: LL.NostrQuickStart.postHeading(),
      description: LL.NostrQuickStart.postDesc(),
      image: FeedIcon,
      onPress: () => navigation.navigate("makeNostrPost"),
    },
  ]

  // filter out closed cards
  nostrCarouselData = nostrCarouselData.filter(
    (el) => !persistentState?.closedQuickStartTypes?.includes(el.type),
  )

  const onHide = (type: string) => {
    updateState((state: any) => {
      if (state) {
        return {
          ...state,
          closedQuickStartTypes: state.closedQuickStartTypes
            ? [...state.closedQuickStartTypes, type]
            : [type],
        }
      }
      return undefined
    })
  }

  const renderItem = ({ item, index }: RenderItemProps) => {
    const Image = item.image
    return (
      <TouchableOpacity onPress={item.onPress} key={index} style={styles.itemContainer}>
        <Image height={width / 3} width={width / 3} />
        <View style={styles.texts}>
          <Text type="h1" bold style={styles.title}>
            {item.title}
          </Text>
          <Text type="bl">{item.description}</Text>
        </View>
        <TouchableOpacity style={styles.close} onPress={() => onHide(item.type)}>
          <Icon name={"close"} type="ionicon" color={colors.black} size={30} />
        </TouchableOpacity>
      </TouchableOpacity>
    )
  }

  if (nostrCarouselData.length > 0) {
    return (
      <View>
        <Carousel
          ref={ref}
          width={width}
          height={width / 2.5}
          data={nostrCarouselData}
          renderItem={renderItem}
          mode="parallax"
          loop={nostrCarouselData.length !== 1}
          containerStyle={{ marginTop: 10 }}
        />
      </View>
    )
  } else {
    return <View style={{ height: 20 }} />
  }
}

const useStyles = makeStyles(({ colors }) => ({
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 20,
    borderColor: colors.black,
    padding: 10,
  },
  texts: {
    flex: 1,
  },
  title: {
    marginBottom: 2,
    width: "85%",
  },
  close: {
    position: "absolute",
    top: 0,
    right: 0,
    padding: 5,
  },
}))

export default NostrQuickStart
