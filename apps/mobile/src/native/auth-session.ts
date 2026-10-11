import { NativeModules } from 'react-native';
import type { AuthResult } from '../api/client';

type AuthSessionModule = {
  save(session: string): Promise<void>;
  restore(): Promise<string | null>;
  clear(): Promise<void>;
};

function storage(): AuthSessionModule {
  const module = NativeModules.AuthSession as AuthSessionModule | undefined;
  if (!module) throw new Error('Không mở được bộ nhớ phiên đăng nhập');
  return module;
}

export const authSession = {
  async restore(): Promise<AuthResult | undefined> {
    const serialized = await storage().restore();
    if (!serialized) return undefined;
    try {
      const session = JSON.parse(serialized) as AuthResult;
      if (
        typeof session.accessToken !== 'string' ||
        !session.accessToken ||
        typeof session.user?.id !== 'string' ||
        typeof session.user?.email !== 'string' ||
        typeof session.user?.name !== 'string'
      )
        throw new Error('Invalid session');
      return session;
    } catch {
      await storage().clear();
      return undefined;
    }
  },
  save: (session: AuthResult) =>
    storage().save(
      JSON.stringify({
        accessToken: session.accessToken,
        user: session.user,
      }),
    ),
  clear: () => storage().clear(),
};
