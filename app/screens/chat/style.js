"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useStyles = void 0;
const themed_1 = require("@rneui/themed");
exports.useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    activityIndicatorContainer: {
        alignItems: "center",
        flex: 1,
        justifyContent: "center",
    },
    usernameContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginHorizontal: 20,
        marginVertical: 10,
    },
    usernameText: {
        fontSize: 16,
        color: colors.primary3,
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
        marginHorizontal: 20,
        marginVertical: 4,
    },
    unreadItem: {
        backgroundColor: "#f0f0f0", // or any color to indicate unread status
    },
    unreadIndicator: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: "green",
        position: "absolute",
        top: 10,
        right: 10,
    },
    itemContainer: {
        borderRadius: 8,
        backgroundColor: colors.grey5,
        // borderColor: colors.grey2,
        // borderWidth: 0.5,
        minHeight: 50,
        margin: 5,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 4,
    },
    listContainer: { flexGrow: 1 },
    searchBarContainer: {
        backgroundColor: colors.grey5,
        borderBottomColor: colors.grey5,
        borderTopColor: colors.grey5,
        marginHorizontal: 12,
        marginVertical: 8,
    },
    searchBarInputContainerStyle: {
        backgroundColor: colors.grey4,
    },
    searchBarRightIconStyle: {
        padding: 8,
    },
    searchBarText: {
        color: colors.primary3,
        textDecorationLine: "none",
    },
    itemText: { color: colors.primary3, flexWrap: "wrap" },
    icon: {
        color: colors.primary3,
    },
    verifiedIcon: {
        marginLeft: 7,
        color: colors.primary,
    },
    profilePicture: {
        width: 50,
        height: 50,
        borderRadius: 50,
        backgroundColor: colors.black,
    },
    selfNotePicture: {
        width: 50,
        height: 50,
        borderRadius: 50,
        backgroundColor: colors.primary,
    },
    communityPicture: {
        width: 50,
        height: 50,
        borderRadius: 50,
        backgroundColor: colors.primary,
        marginRight: 10,
        padding: 10,
        marginLeft: 15,
        margin: 10,
    },
}));
//# sourceMappingURL=style.js.map