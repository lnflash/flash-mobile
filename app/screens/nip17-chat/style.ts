import { makeStyles } from "@rneui/themed"
import { HistoryListItem } from "./historyListItem"

export const useStyles = makeStyles(({ colors }) => ({
  header: {
    backgroundColor: colors.white,
  },

  activityIndicatorContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },

  emptyListNoContacts: {
    marginHorizontal: 12,
    marginTop: 32,
  },

  emptyListNoMatching: {
    marginHorizontal: 26,
    marginTop: 8,
  },

  emptyListText: {
    fontSize: 18,
    marginTop: 30,
    textAlign: "center",
    color: colors.black,
  },

  emptyListTitle: {
    color: colors.black,
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
  },

  item: {
    marginHorizontal: 32,
    marginVertical: 4,
  },

  itemContainer: {
    borderRadius: 8,
    backgroundColor: colors.grey5,
  },

  listContainer: { flexGrow: 1 },

  searchBarContainer: {
    backgroundColor: colors.white,
    borderBottomColor: colors.white,
    borderTopColor: colors.white,
    marginHorizontal: 26,
    marginVertical: 8,
  },

  searchBarInputContainerStyle: {
    backgroundColor: colors.grey5,
  },

  searchBarRightIconStyle: {
    padding: 8,
  },

  searchBarText: {
    color: colors.black,
    textDecorationLine: "none",
  },

  itemText: { color: colors.black },

  icon: {
    color: colors.black,
  },
  profilePicture: {
    width: 50,
    height: 50,
    borderRadius: 50,
    backgroundColor: colors.black,
  },
}))
