import { gql } from "@apollo/client"

gql`
  mutation userLogout($input: UserLogoutInput!) {
    userLogout(input: $input) {
      success
      errors {
        code
        message
        __typename
      }
      __typename
    }
  }
`

gql`
  mutation userUpdateNpub($input: UserUpdateNpubInput!) {
    userUpdateNpub(input: $input) {
      errors {
        code
      }
      user {
        id
        npub
      }
    }
  }
`
