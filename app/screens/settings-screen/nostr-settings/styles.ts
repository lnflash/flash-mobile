import { makeStyles } from "@rneui/themed"

export const useStyles = makeStyles(({ colors, mode }) => ({
  container: {
    flex: 1,
    padding: 16,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 20,
    marginBottom: 10,
  },
  profileIcon: {
    marginRight: 16,
  },
  profileInfo: {
    flex: 1,
  },
  menuContainer: {
    marginBottom: 10,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  advancedContainer: {
    backgroundColor: colors.white,
    borderRadius: 8,
    marginBottom: 16,
    overflow: "hidden",
  },
  advancedMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    color: colors.black,
  },
  menuSubtext: {
    fontSize: 12,
    color: colors.black,
  },
  nostrLearnCard: {
    backgroundColor:
      mode === "dark"
        ? `${colors.primary}25` // 15% opacity in dark mode
        : `${colors.primary}15`, // 10% opacity in light mode
  },
  nostrLearnIcon: {
    color: colors.primary,
  },
  profileCopyButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  profileText: {
    marginRight: 8,
  },
  profileCopyIcon: {
    color: colors.grey3,
  },
  generateButton: {
    backgroundColor: colors.grey5 + "40",
  },
  modalContainer: {
    backgroundColor: mode === "dark" ? "black" : "white",
    borderRadius: 12,
    padding: 20,
    maxHeight: "80%",
  },
  keyContainer: {
    backgroundColor: colors.grey5 + "30",
  },
  modalButton: {
    backgroundColor: colors.grey5 + "40",
  },
  modalButtonCancel: {
    backgroundColor: colors.grey5 + "60",
  },
  modalButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    columnGap: 10,
    marginTop: 20,
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
}))
