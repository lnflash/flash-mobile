import { createClient } from "@supabase/supabase-js"

// env
import { SUPABASE_URL, SUPABASE_KEY } from "@env"

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

type User = {
  account_type?: string
  name?: string
  phone?: string
  email?: string
  business_name?: string
  business_address?: string
  latitude?: number
  longitude?: number
  bank_name?: string
  bank_branch?: string
  bank_account_type?: string
  account_currency?: string
  bank_account_number?: string
  id_image_url?: string
  terms_accepted?: boolean
  terminal_requested?: boolean
  client_version?: string
  device_info?: string
  signup_completed?: boolean
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

    const { data, error } = await supabase.storage
      .from("id_uploads")
      .upload(filePath, file)
    if (error) {
      // Handle error
      console.log("UPLOAD ERROR>>>>>>>", error)
      return undefined
    } else {
      // Handle success
      console.log("UPLOAD SUCCESS>>>>>>>", data)
      const res = supabase.storage.from("id_uploads").getPublicUrl(data.path)
      return res.data.publicUrl
    }
    return
  } catch (err) {
    console.log("Upload File Err", err)
  }
}

export async function insertUser(userData: User) {
  try {
    const { data, error } = await supabase
      .from("signups")
      .insert([{ ...userData, terms_accepted: true }])
    if (error) {
      console.error("Insert error:", error)
      return false
    } else {
      console.log("Insert success:", data)
      return true
    }
  } catch (err) {
    console.log("SUPABASE INSERT USER CATCH ERR: ", err)
  }
}

export async function updateUser(id: string, userData: User) {
  try {
    const { data, error } = await supabase.from("signups").update(userData).eq("id", id)
    if (error) {
      console.error("Update error:", error)
      return false
    } else {
      console.log("Updated user:", data)
      return true
    }
  } catch (err) {
    console.log("SUPABASE UPDATE USER CATCH ERR: ", err)
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
    return undefined
  } else {
    console.log("User data:", data)
    return data
  }
}

export async function deleteUser(phone: string) {
  const { data, error } = await supabase
    .from("signups") // your table name
    .delete()
    .eq("phone", phone) // filter to match the row

  if (error) {
    console.error("Delete error:", error)
    return false
  } else {
    console.log("Deleted row:", data)
    return true
  }
}
