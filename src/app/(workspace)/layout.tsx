import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { isVatsimSession } from '@/lib/auth-policy';

export const dynamic = 'force-dynamic';

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.AUTH_SECRET) redirect('/login');
  const session = await auth();
  if (!isVatsimSession(session)) redirect('/login');
  return children;
}
