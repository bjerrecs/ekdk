import { auth, authConfigured, signIn } from '@/auth';
import { redirect } from 'next/navigation';
import { ArrowRight, ShieldCheck, ExternalLink } from 'lucide-react';
import Brand from '@/components/brand';
import { isVatsimSession } from '@/lib/auth-policy';

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (process.env.AUTH_SECRET) {
    const session = await auth();
    if (isVatsimSession(session)) redirect('/');
  }
  const { error } = await searchParams;
  async function login() {
    'use server';
    if (!authConfigured) redirect('/login?error=Configuration');
    await signIn('vatsim', { redirectTo: '/' });
  }
  return <main className="login-page">
    <div className="login-brand"><Brand /></div>
    <section className="login-panel">
      <div className="login-symbol"><ShieldCheck size={32} strokeWidth={1.6} /></div>
      <h1>Your Copenhagen FIR workspace.</h1>
      <p>Airport information, charts and controller references. One place to prepare. One place to control.</p>
      <form action={login}><button className="primary login-button" disabled={!authConfigured}>Continue with VATSIM <ArrowRight size={20} /></button></form>
      {error && <div className="login-notice" role="alert">{error === 'Configuration' ? 'VATSIM authentication is not configured yet.' : 'Sign-in could not be completed. Please try again with your VATSIM account.'}</div>}
      {!authConfigured && <div className="login-notice">VATSIM sign-in is not configured.<br />The site owner must add the OAuth client credentials and authentication secret. Workspace access remains locked.</div>}
      <div className="login-security"><ShieldCheck size={16} /> Secure VATSIM authentication · Members only</div>
      <a className="text-link" href="https://vatsim.net" target="_blank" rel="noreferrer">About VATSIM <ExternalLink size={13} /></a>
    </section>
    <footer>EKDK · VATSIM Denmark <span>For flight simulation only. Not for real-world navigation.</span></footer>
  </main>;
}
