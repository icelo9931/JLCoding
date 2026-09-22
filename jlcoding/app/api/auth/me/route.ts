import { getSessionUser } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const user = await getSessionUser(req)
  return Response.json({ user })
}
