import React from "react"
import { ActivityIndicator, FlatList, View } from "react-native"
import { Text, makeStyles, useTheme } from "@rneui/themed"

import { Screen } from "@app/components/screen"
import { useI18nContext } from "@app/i18n/i18n-react"
import {
  useMyReferralsQuery,
  InviteStatus,
  MyReferralsQuery,
} from "@app/graphql/generated"
import { useReferralRewardFlag } from "@app/hooks"

// A user's own referral history: every invite they sent, what happened to it,
// and — only while referral rewards are enabled instance-wide — what they
// earned. Reward copy is gated on the same backend flag as the home-screen
// invite card so this screen can never promise money the backend won't pay.

const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`

type ReferralRow = NonNullable<MyReferralsQuery["myReferrals"]>["invites"][number]

export const MyReferrals: React.FC = () => {
  const styles = useStyles()
  const {
    theme: { colors },
  } = useTheme()
  const { LL } = useI18nContext()
  const { referralRewardEnabled } = useReferralRewardFlag()
  const { data, loading, error, refetch } = useMyReferralsQuery({
    fetchPolicy: "cache-and-network",
  })

  const referrals = data?.myReferrals

  const statusLine = (row: ReferralRow): { label: string; tone: "ok" | "muted" } => {
    if (row.status === InviteStatus.Accepted) {
      if (referralRewardEnabled && row.myRewardCents) {
        return {
          label: LL.MyReferrals.earned({ amount: formatCents(row.myRewardCents) }),
          tone: "ok",
        }
      }
      if (referralRewardEnabled && row.rewardPending) {
        return { label: LL.MyReferrals.joinedRewardPending(), tone: "ok" }
      }
      return { label: LL.MyReferrals.joined(), tone: "ok" }
    }
    if (row.status === InviteStatus.Expired) {
      return { label: LL.MyReferrals.expired(), tone: "muted" }
    }
    // SENT — and PENDING (created, delivery unconfirmed) reads as invited too:
    // the distinction is an ops concern, not the user's.
    return { label: LL.MyReferrals.invited(), tone: "muted" }
  }

  const renderRow = ({ item }: { item: ReferralRow }) => {
    const { label, tone } = statusLine(item)
    return (
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text type="p1" numberOfLines={1}>
            {item.contact}
          </Text>
          <Text type="p3" color={tone === "ok" ? colors.green : colors.grey3}>
            {label}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <Screen preset="fixed">
      <View style={styles.container}>
        {referrals && (
          <View style={styles.header}>
            {referralRewardEnabled ? (
              <>
                <Text type="caption" color={colors.grey3}>
                  {LL.MyReferrals.totalEarned()}
                </Text>
                <Text style={styles.headline} type="h1" bold>
                  {formatCents(referrals.totalEarnedCents)}
                </Text>
                {referrals.pendingRewardCount > 0 && (
                  <Text type="p3" color={colors.grey3}>
                    {LL.MyReferrals.pendingCount({
                      count: referrals.pendingRewardCount,
                    })}
                  </Text>
                )}
              </>
            ) : (
              <>
                <Text type="caption" color={colors.grey3}>
                  {LL.MyReferrals.friendsJoined()}
                </Text>
                <Text style={styles.headline} type="h1" bold>
                  {referrals.acceptedCount}
                </Text>
              </>
            )}
          </View>
        )}

        {loading && !referrals && <ActivityIndicator style={styles.spinner} />}
        {Boolean(error) && !referrals && (
          <Text type="p2" color={colors.grey3} style={styles.empty}>
            {LL.MyReferrals.loadFailed()}
          </Text>
        )}

        {referrals && referrals.invites.length === 0 && (
          <Text type="p2" color={colors.grey3} style={styles.empty}>
            {LL.MyReferrals.empty()}
          </Text>
        )}

        {referrals && referrals.invites.length > 0 && (
          <FlatList
            data={referrals.invites}
            keyExtractor={(item) => item.id}
            renderItem={renderRow}
            onRefresh={refetch}
            refreshing={false}
            contentContainerStyle={styles.list}
          />
        )}
      </View>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: "center",
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.grey5,
  },
  headline: {
    marginVertical: 4,
  },
  spinner: {
    marginTop: 32,
  },
  empty: {
    textAlign: "center",
    marginTop: 32,
  },
  list: {
    paddingVertical: 8,
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.grey5,
  },
  rowText: {
    gap: 2,
  },
}))
