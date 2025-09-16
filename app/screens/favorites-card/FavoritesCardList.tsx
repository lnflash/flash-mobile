import React from "react"
import { FlatList } from "react-native"
import { makeStyles } from "@rneui/themed"

// components
import { Screen } from "@app/components/screen"
import { Favorites } from "@app/components/cards"

const data = [
  {
    title: "Favorite card",
    description:
      "It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout. The point of using Lorem Ipsum is",
    starts: 1757211118472,
    ends: 1757711118472,
    type: "event",
  },
  {
    title: "Favorite card",
    description:
      "It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout. The point of using Lorem Ipsum is",
    starts: 1757711118472,
    ends: 1758711118472,
    type: "reward",
  },
  {
    title: "Favorite card",
    description:
      "It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout. The point of using Lorem Ipsum is",
    starts: 1758711118472,
    ends: 1759999118472,
    type: "discount",
  },
]

const FavoritesCardList = () => {
  return (
    <Screen>
      <FlatList
        data={data}
        renderItem={({ item }) => <Favorites {...item} />}
        contentContainerStyle={{ paddingHorizontal: 20 }}
      />
    </Screen>
  )
}

export default FavoritesCardList

const useStyles = makeStyles(() => ({}))
