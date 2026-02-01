import React, { useEffect, useRef, ReactNode } from "react"
import { Modal, ModalProps, View, StyleSheet, BackHandler, Platform } from "react-native"
import { useModalPortal } from "./ModalPortalProvider"

let nextPortalId = 0

type Props = ModalProps & {
  children: ReactNode
}

export const ModalPortal = ({ children, visible, onRequestClose, ...rest }: Props) => {
  const portalId = useRef(`modal-portal-${nextPortalId++}`).current
  const { register, unregister } = useModalPortal()

  useEffect(() => {
    if (Platform.OS !== "android") return

    if (visible) {
      register(
        portalId,
        <View style={styles.fullScreen} pointerEvents="box-none">
          {children}
        </View>,
      )
    } else {
      unregister(portalId)
    }

    return () => {
      unregister(portalId)
    }
  }, [visible, children, portalId, register, unregister])

  useEffect(() => {
    if (Platform.OS !== "android") return
    if (!visible || !onRequestClose) return

    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      onRequestClose(new CustomEvent("hardwareBackPress") as any)
      return true
    })

    return () => handler.remove()
  }, [visible, onRequestClose])

  if (Platform.OS === "android") {
    return null
  }

  return (
    <Modal visible={visible} onRequestClose={onRequestClose} {...rest}>
      {children}
    </Modal>
  )
}

const styles = StyleSheet.create({
  fullScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    elevation: 999,
    zIndex: 999,
  },
})
