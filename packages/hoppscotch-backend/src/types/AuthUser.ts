import { User } from 'src/generated/prisma/client';

export type AuthUser = User;

export interface SSOProviderProfile {
  provider: string;
  id: string;
}

/**
 * Profile shape produced by `passport-openidconnect`'s `Profile.parse`,
 * which merges ID token claims with the UserInfo response.
 * `provider` is injected by `@nestjs/passport`'s strategy wrapper.
 */
export interface OIDCProviderProfile {
  id: string;
  provider: string;
  displayName?: string;
  username?: string;
  name?: {
    familyName?: string;
    givenName?: string;
    middleName?: string;
  };
  emails?: { value: string }[];
  photos?: { value: string }[];
  _raw?: string;
  _json?: Record<string, unknown>;
}

export type IsAdmin = {
  isAdmin: boolean;
};
