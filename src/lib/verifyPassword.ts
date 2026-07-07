/**
 * Verify a user's CURRENT password by attempting a password-grant token
 * exchange against Supabase Auth. The issued session is discarded — this is
 * only an "is this really them" check used before sensitive account changes
 * (email change, password change).
 */
export async function verifyCurrentPassword(
  email: string,
  password: string
): Promise<boolean> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      },
      body: JSON.stringify({ email, password }),
    }
  );
  return res.ok;
}
