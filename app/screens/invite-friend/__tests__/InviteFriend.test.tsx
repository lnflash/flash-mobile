import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { MockedProvider } from "@apollo/client/testing"
import { Alert } from "react-native"
import InviteFriend from "../InviteFriend"
import { CREATE_INVITE_MUTATION } from "@app/graphql/mutations"
import { InviteMethod } from "@app/graphql/generated"

// Mock navigation
const mockNavigate = jest.fn()
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}))

// Mock i18n
jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({
    LL: {
      InviteFriend: {
        title: () => "Invite a Friend",
        subtitle: () => "Send an invitation via email or SMS",
        phoneNumber: () => "Phone Number",
        or: () => "OR",
        email: () => "Email",
        invite: () => "Send Invite",
        error: () => "Error",
      },
    },
  }),
}))

// Mock Alert
jest.spyOn(Alert, "alert")

describe("InviteFriend Screen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("Email Invitations", () => {
    it("should send email invitation successfully", async () => {
      const mocks = [
        {
          request: {
            query: CREATE_INVITE_MUTATION,
            variables: {
              input: {
                contact: "test@example.com",
                method: InviteMethod.Email,
              },
            },
          },
          result: {
            data: {
              createInvite: {
                invite: {
                  id: "invite-1",
                  contact: "test@example.com",
                  method: InviteMethod.Email,
                  status: "PENDING",
                  createdAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                },
                errors: null,
              },
            },
          },
        },
      ]

      const { getByTestId, getByPlaceholderText } = render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <InviteFriend navigation={{ navigate: mockNavigate } as any} route={{} as any} />
        </MockedProvider>
      )

      // Enter email
      const emailInput = getByPlaceholderText("email@example.com")
      fireEvent.changeText(emailInput, "test@example.com")

      // Click send invite button
      const sendButton = getByTestId("send-invite-button")
      fireEvent.press(sendButton)

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("InviteFriendSuccess", {
          contact: "test@example.com",
          method: InviteMethod.Email,
        })
      })
    })

    it("should validate email format", async () => {
      const { getByTestId, getByPlaceholderText } = render(
        <MockedProvider mocks={[]} addTypename={false}>
          <InviteFriend navigation={{ navigate: mockNavigate } as any} route={{} as any} />
        </MockedProvider>
      )

      // Enter invalid email
      const emailInput = getByPlaceholderText("email@example.com")
      fireEvent.changeText(emailInput, "invalid-email")

      // Try to send invite
      const sendButton = getByTestId("send-invite-button")
      fireEvent.press(sendButton)

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          "Error",
          "Please enter a valid email address"
        )
      })
    })

    it("should handle duplicate email error", async () => {
      const mocks = [
        {
          request: {
            query: CREATE_INVITE_MUTATION,
            variables: {
              input: {
                contact: "duplicate@example.com",
                method: InviteMethod.Email,
              },
            },
          },
          result: {
            data: {
              createInvite: {
                invite: null,
                errors: ["This person has already been invited"],
              },
            },
          },
        },
      ]

      const { getByTestId, getByPlaceholderText } = render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <InviteFriend navigation={{ navigate: mockNavigate } as any} route={{} as any} />
        </MockedProvider>
      )

      const emailInput = getByPlaceholderText("email@example.com")
      fireEvent.changeText(emailInput, "duplicate@example.com")

      const sendButton = getByTestId("send-invite-button")
      fireEvent.press(sendButton)

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          "Error",
          "This person has already been invited"
        )
      })
    })
  })

  describe("SMS Invitations", () => {
    it("should send SMS invitation successfully", async () => {
      const mocks = [
        {
          request: {
            query: CREATE_INVITE_MUTATION,
            variables: {
              input: {
                contact: "+12345678900",
                method: InviteMethod.Sms,
              },
            },
          },
          result: {
            data: {
              createInvite: {
                invite: {
                  id: "invite-2",
                  contact: "+12345678900",
                  method: InviteMethod.Sms,
                  status: "PENDING",
                  createdAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                },
                errors: null,
              },
            },
          },
        },
      ]

      const { getByTestId } = render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <InviteFriend navigation={{ navigate: mockNavigate } as any} route={{} as any} />
        </MockedProvider>
      )

      // Select country code
      const countryPicker = getByTestId("country-picker")
      fireEvent.press(countryPicker)
      // Select US (+1)
      const usOption = getByTestId("country-US")
      fireEvent.press(usOption)

      // Enter phone number
      const phoneInput = getByTestId("phone-input")
      fireEvent.changeText(phoneInput, "2345678900")

      // Send invite
      const sendButton = getByTestId("send-invite-button")
      fireEvent.press(sendButton)

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("InviteFriendSuccess", {
          contact: "+12345678900",
          method: InviteMethod.Sms,
        })
      })
    })

    it("should validate phone number format", async () => {
      const { getByTestId } = render(
        <MockedProvider mocks={[]} addTypename={false}>
          <InviteFriend navigation={{ navigate: mockNavigate } as any} route={{} as any} />
        </MockedProvider>
      )

      // Enter invalid phone number
      const phoneInput = getByTestId("phone-input")
      fireEvent.changeText(phoneInput, "123") // Too short

      const sendButton = getByTestId("send-invite-button")
      fireEvent.press(sendButton)

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          "Error",
          "Please enter a valid phone number"
        )
      })
    })
  })

  describe("UI State Management", () => {
    it("should disable send button when no input is provided", () => {
      const { getByTestId } = render(
        <MockedProvider mocks={[]} addTypename={false}>
          <InviteFriend navigation={{ navigate: mockNavigate } as any} route={{} as any} />
        </MockedProvider>
      )

      const sendButton = getByTestId("send-invite-button")
      expect(sendButton.props.accessibilityState.disabled).toBe(true)
    })

    it("should enable send button when email is entered", () => {
      const { getByTestId, getByPlaceholderText } = render(
        <MockedProvider mocks={[]} addTypename={false}>
          <InviteFriend navigation={{ navigate: mockNavigate } as any} route={{} as any} />
        </MockedProvider>
      )

      const emailInput = getByPlaceholderText("email@example.com")
      fireEvent.changeText(emailInput, "test@example.com")

      const sendButton = getByTestId("send-invite-button")
      expect(sendButton.props.accessibilityState.disabled).toBe(false)
    })

    it("should show loading state while sending invite", async () => {
      const mocks = [
        {
          request: {
            query: CREATE_INVITE_MUTATION,
            variables: {
              input: {
                contact: "loading@example.com",
                method: InviteMethod.Email,
              },
            },
          },
          delay: 1000, // Simulate network delay
          result: {
            data: {
              createInvite: {
                invite: {
                  id: "invite-3",
                  contact: "loading@example.com",
                  method: InviteMethod.Email,
                  status: "PENDING",
                  createdAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                },
                errors: null,
              },
            },
          },
        },
      ]

      const { getByTestId, getByPlaceholderText, queryByTestId } = render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <InviteFriend navigation={{ navigate: mockNavigate } as any} route={{} as any} />
        </MockedProvider>
      )

      const emailInput = getByPlaceholderText("email@example.com")
      fireEvent.changeText(emailInput, "loading@example.com")

      const sendButton = getByTestId("send-invite-button")
      fireEvent.press(sendButton)

      // Check loading state
      await waitFor(() => {
        expect(queryByTestId("loading-indicator")).toBeTruthy()
      })

      // Wait for completion
      await waitFor(() => {
        expect(queryByTestId("loading-indicator")).toBeFalsy()
      })
    })
  })

  describe("Rate Limiting", () => {
    it("should handle rate limit error", async () => {
      const mocks = [
        {
          request: {
            query: CREATE_INVITE_MUTATION,
            variables: {
              input: {
                contact: "ratelimit@example.com",
                method: InviteMethod.Email,
              },
            },
          },
          result: {
            data: {
              createInvite: {
                invite: null,
                errors: ["You have reached the daily invitation limit"],
              },
            },
          },
        },
      ]

      const { getByTestId, getByPlaceholderText } = render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <InviteFriend navigation={{ navigate: mockNavigate } as any} route={{} as any} />
        </MockedProvider>
      )

      const emailInput = getByPlaceholderText("email@example.com")
      fireEvent.changeText(emailInput, "ratelimit@example.com")

      const sendButton = getByTestId("send-invite-button")
      fireEvent.press(sendButton)

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          "Error",
          "You have reached the daily invitation limit"
        )
      })
    })
  })

  describe("Network Errors", () => {
    it("should handle network errors gracefully", async () => {
      const mocks = [
        {
          request: {
            query: CREATE_INVITE_MUTATION,
            variables: {
              input: {
                contact: "network@example.com",
                method: InviteMethod.Email,
              },
            },
          },
          error: new Error("Network error"),
        },
      ]

      const { getByTestId, getByPlaceholderText } = render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <InviteFriend navigation={{ navigate: mockNavigate } as any} route={{} as any} />
        </MockedProvider>
      )

      const emailInput = getByPlaceholderText("email@example.com")
      fireEvent.changeText(emailInput, "network@example.com")

      const sendButton = getByTestId("send-invite-button")
      fireEvent.press(sendButton)

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          "Error",
          "Unable to send invitation. Please try again."
        )
      })
    })
  })
})