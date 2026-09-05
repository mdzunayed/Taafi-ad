/**
 * Wire shapes for `/auth/*`.
 *
 * Field names are the server's, verbatim. The casing is mixed on purpose:
 * the top level of an auth response is camelCase (`refreshToken`,
 * `requiresReset`) while the nested `user` is snake_case, because `user` is
 * `Account.toJSON()` straight out of Mongo. If it looks wrong, it's because
 * the server does that. Do not "normalise" it — see lib/api/http.ts.
 */

export interface AccountWire {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  address?: string;
  photo_url?: string;
  profile_picture?: string;
  /** 'admin' | 'super_admin' | 'support_member' | 'doctor' | 'nurse' | 'user' */
  role: string;
  /** Explicit grants only — NOT the effective permission set. Empty today. */
  permissions?: string[];
  status: string;
  is_verified?: boolean;
  requires_password_reset?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface OnboardingWire {
  isProfileComplete?: boolean;
  nextStep?: string;
  profileCompletion?: number;
}

/** `POST /auth/login` and `POST /auth/verify-otp`. */
export interface LoginResponseWire {
  success: boolean;
  token: string;
  refreshToken: string;
  user: AccountWire;
  requiresReset: boolean;
  onboarding?: OnboardingWire;
}

/** `POST /auth/refresh` — no `user`, by design. */
export interface RefreshResponseWire {
  success: boolean;
  token: string;
  refreshToken: string;
  /**
   * The account as it is RIGHT NOW, re-read on every rotation.
   *
   * Optional because a backend older than this field simply omits it, and the
   * refresh route falls back to the identity in the session cookie. Once
   * present it wins: it is the only thing that lets a role change reach this
   * console without a full sign-out.
   */
  user?: AccountWire;
}

/** `GET /auth/me`. */
export interface MeResponseWire {
  success: boolean;
  user: AccountWire;
  requiresReset: boolean;
  onboarding?: OnboardingWire;
}

/**
 * The compact identity the portal keeps in a cookie and hands to the client.
 * Deliberately small — see lib/auth/cookies.ts on the 4 KB cliff.
 */
export interface SessionUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  permissions: string[];
}

export interface SessionPayload {
  user: SessionUser;
  /** Raw access JWT, for the browser's Authorization header. */
  token: string;
  /** Access-token expiry in epoch milliseconds, for proactive refresh. */
  expiresAt: number | null;
}
