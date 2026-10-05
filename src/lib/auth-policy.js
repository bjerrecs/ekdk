/** @param {unknown} value */
export function isVatsimCid(value) {
  return typeof value === 'string' && /^\d+$/.test(value);
}

/** @param {{ user?: { id?: string } } | null | undefined} session */
export function isVatsimSession(session) {
  return isVatsimCid(session?.user?.id);
}

/**
 * @param {import('next-auth/jwt').JWT} token
 * @param {{ provider: string, providerAccountId: string } | null | undefined} account
 */
export function vatsimToken(token, account) {
  if (account?.provider === 'vatsim') {
    if (!isVatsimCid(account.providerAccountId)) throw new Error('Invalid VATSIM member identity');
    token.vatsimCid = account.providerAccountId;
  }
  return token;
}
