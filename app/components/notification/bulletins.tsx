import React from "react"

import { useNotifications } from "."
import { NotificationCardUI } from "./notification-card-ui"

type Props = {
  loading: boolean
}

export const BulletinsCard: React.FC<Props> = ({ loading }) => {
  const { cardInfo } = useNotifications()

  if (loading) return null

  if (!cardInfo) {
    return null
  }

  return (
    <NotificationCardUI
      title={cardInfo.title}
      text={cardInfo.text}
      icon={cardInfo.icon}
      action={cardInfo.action}
      loading={cardInfo.loading}
      dismissAction={cardInfo.dismissAction}
    />
  )
}
