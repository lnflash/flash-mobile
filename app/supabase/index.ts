import { createClient } from "@supabase/supabase-js"

// env
import { SUPABASE_URL, SUPABASE_KEY } from "@env"

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

type User = {
  account_currency?: string
  account_type?: string
  attempt?: string
  bank_account_number?: string
  bank_account_type?: string
  bank_branch?: string
  bank_name?: string
  business_address?: string
  business_name?: string
  client_version?: string
  created_at?: string
  device_info?: string
  email?: string
  id?: string
  id_image_url?: string
  latitude?: string
  longitude?: string
  name: string
  phone: string
  signup_completed?: boolean
  submission_source?: null
  submitted_at?: string
  terminal_requested?: boolean
  terms_accepted?: boolean
  timestamp?: string
  user_agent?: string
}

// Upload file using standard upload
export async function uploadFile(file: any) {
  try {
    // Create a cryptographically secure unique file name using UUID v4 pattern
    const fileExt = file.fileName.split(".").pop()
    // Generate a UUID-like string with timestamp for better security
    const timestamp = Date.now().toString(36)
    const random1 = crypto
      .getRandomValues(new Uint8Array(8))
      .reduce((acc, val) => acc + val.toString(16).padStart(2, "0"), "")
    const random2 = crypto
      .getRandomValues(new Uint8Array(4))
      .reduce((acc, val) => acc + val.toString(16).padStart(2, "0"), "")
    const random3 = crypto
      .getRandomValues(new Uint8Array(4))
      .reduce((acc, val) => acc + val.toString(16).padStart(2, "0"), "")
    const random4 = crypto
      .getRandomValues(new Uint8Array(12))
      .reduce((acc, val) => acc + val.toString(16).padStart(2, "0"), "")
    const secureFileName = `${random1}-${random2}-${random3}-${random4}-${timestamp}`
    const fileName = `${secureFileName}.${fileExt}`
    const filePath = `${fileName}`

    console.log(">>>>>>>>>>", filePath)

    const { data, error } = await supabase.storage
      .from("id-documents")
      .upload(filePath, file)
    if (error) {
      // Handle error
      console.log("UPLOAD ERROR>>>>>>>", error)
    } else {
      // Handle success
      console.log("UPLOAD SUCCESS>>>>>>>", data)
    }
    return
  } catch (err) {
    console.log("Upload File Err", err)
  }
}

export async function insertUser(userData: any) {
  try {
    const { data, error } = await supabase.from("signups").insert([
      {
        ...userData,
        terms_accepted: true,
      },
    ])
    console.log(data, error)
    if (error) {
      console.error("Insert error:", error)
      return false
    } else {
      console.log("Insert success:", data)
      return true
    }
  } catch (err) {
    console.log("????????>>>>>>>", err)
  }
}

export async function updateUser() {
  try {
    const { data, error } = await supabase
      .from("signups")
      .update({ email: "new@email.com" })
      .eq("phone", "+1234567890")

    if (error) {
      console.error("Update error:", error)
    } else {
      console.log("Updated user:", data)
    }
    console.log(data, error)
    if (error) {
      console.error("Insert error:", error)
    } else {
      console.log("Insert success:", data)
    }
  } catch (err) {
    console.log("????????>>>>>>>", err)
  }
}

export async function fetchUser(phone: string) {
  const { data, error } = await supabase
    .from("signups") // your table name
    .select("*") // or specify fields: 'id, name, email'
    .eq("phone", phone) // phone number to match
    .single() // if expecting only one match

  if (error) {
    console.error("Fetch error:", error)
  } else {
    console.log("User data:", data)
    return data
  }
}
