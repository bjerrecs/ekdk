import { auth, signOut } from '@/auth';
import { redirect } from 'next/navigation';
import Workspace from '@/components/workspace';
import { isVatsimSession } from '@/lib/auth-policy';

export default async function Page() {
  const session = await auth();
  if (!session?.user?.id || !isVatsimSession(session)) redirect('/login');
  async function logout() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }
  return <Workspace member={{ name: session.user.name || 'Controller', cid: session.user.id }} logout={logout} />;
}
