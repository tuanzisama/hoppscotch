import { Strategy } from 'passport-openidconnect';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { UserService } from 'src/user/user.service';
import * as O from 'fp-ts/Option';
import * as E from 'fp-ts/Either';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { validateEmail } from 'src/utils';
import { AUTH_EMAIL_NOT_PROVIDED_BY_OAUTH } from 'src/errors';
import { OIDCProviderProfile } from 'src/types/AuthUser';
import { StatelessStateStore } from '../stateless-state-store';

@Injectable()
export class GitlabStrategy extends PassportStrategy(Strategy, 'gitlab') {
  constructor(
    private authService: AuthService,
    private usersService: UserService,
    private configService: ConfigService,
  ) {
    super({
      name: 'gitlab',
      issuer: configService.get<string>('INFRA.GITLAB_ISSUER'),
      authorizationURL: configService.get<string>(
        'INFRA.GITLAB_AUTHORIZATION_URL',
      ),
      tokenURL: configService.get<string>('INFRA.GITLAB_TOKEN_URL'),
      userInfoURL: configService.get<string>('INFRA.GITLAB_USERINFO_URL'),
      clientID: configService.get<string>('INFRA.GITLAB_CLIENT_ID'),
      clientSecret: configService.get<string>('INFRA.GITLAB_CLIENT_SECRET'),
      callbackURL: configService.get<string>('INFRA.GITLAB_CALLBACK_URL'),
      scope: configService.get<string>('INFRA.GITLAB_SCOPE').split(','),
      passReqToCallback: true,
      // Reuse StatelessStateStore so the OIDC `state` parameter is signed,
      // browser-bound (cookie nonce), and works across load-balanced instances
      // — same guarantees as the existing OAuth2 providers.
      store: new StatelessStateStore(
        configService.get<string>('INFRA.SESSION_SECRET'),
        undefined,
        (configService.get<string>('INFRA.SESSION_COOKIE_NAME') ||
          '__oauth_nonce') + '_gitlab',
        configService.get<string>('INFRA.ALLOW_SECURE_COOKIES') === 'true',
      ),
    });
  }

  /**
   * passport-openidconnect verify signature (with passReqToCallback).
   * @nestjs/passport pops the `done` callback automatically and converts
   * return values / thrown errors into callback invocations — same as the
   * other OAuth strategies in this project.
   */
  async validate(
    req: Request,
    issuer: string,
    profile: OIDCProviderProfile,
    context: {
      idToken: string;
      accessToken: string;
      refreshToken: string;
      params: unknown;
    },
  ) {
    const { accessToken = '', refreshToken = '' } = context ?? {};

    profile.provider = 'gitlab';

    const email = profile?.emails?.[0]?.value;

    if (!validateEmail(email))
      throw new UnauthorizedException(AUTH_EMAIL_NOT_PROVIDED_BY_OAUTH);

    const user = await this.usersService.findUserByEmail(email);

    if (O.isNone(user)) {
      const createdUser = await this.usersService.createUserSSO(
        accessToken,
        refreshToken,
        profile,
      );
      return createdUser;
    }

    if (!user.value.displayName || !user.value.photoURL) {
      const updatedUser = await this.usersService.updateUserDetails(
        user.value,
        profile,
      );
      if (E.isLeft(updatedUser)) {
        throw new UnauthorizedException(updatedUser.left);
      }
    }

    const providerAccountExists =
      await this.authService.checkIfProviderAccountExists(user.value, profile);

    if (O.isNone(providerAccountExists))
      await this.usersService.createProviderAccount(
        user.value,
        accessToken,
        refreshToken,
        profile,
      );

    return user.value;
  }
}
