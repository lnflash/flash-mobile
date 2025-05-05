import { createClient } from "@supabase/supabase-js"

// env
import { SUPABASE_URL, SUPABASE_KEY } from "@env"

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

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

export async function insertUser() {
  try {
    const { data, error } = await supabase.from("signups").insert([
      {
        name: "test",
        phone: "+821024734353",
        email: "test@example.com",
        account_type: "personal",
        terms_accepted: true,
      },
    ])
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
