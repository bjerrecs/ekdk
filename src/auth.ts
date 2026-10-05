import NextAuth from 'next-auth';
import { isVatsimCid, vatsimToken } from '@/lib/auth-policy';

const vatsimBase = process.env.VATSIM_USE_SANDBOX === 'true'
  ? 'https://auth-dev.vatsim.net'
  : 'https://auth.vatsim.net';

export const authConfigured = Boolean(process.env.AUTH_SECRET && process.env.VATSIM_CLIENT_ID && process.env.VATSIM_CLIENT_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: process.env.NODE_ENV === 'development',
  pages: { signIn: '/login', error: '/login' },
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  providers: [{
    id: 'vatsim',
    name: 'VATSIM',
    type: 'oauth',
    clientId: process.env.VATSIM_CLIENT_ID,
    clientSecret: process.env.VATSIM_CLIENT_SECRET,
    authorization: { url: `${vatsimBase}/oauth/authorize`, params: { scope: 'full_name vatsim_details' } },
    token: `${vatsimBase}/oauth/token`,
    userinfo: `${vatsimBase}/api/user`,
    checks: ['state'],
    profile(profile) {
      const member = profile.data;
      const cid = String(member?.cid ?? '');
      if (!/^\d+$/.test(cid)) throw new Error('VATSIM did not return a valid member CID');
      return { id: cid, name: member.personal?.name_full || `VATSIM ${cid}` };
    },
  }],
  callbacks: {
    async jwt({ token, account }) {
      return vatsimToken(token, account);
    },
    async session({ session, token }) {
      if (session.user) session.user.id = isVatsimCid(token.vatsimCid) ? String(token.vatsimCid) : '';
      return session;
    },
  },
});
