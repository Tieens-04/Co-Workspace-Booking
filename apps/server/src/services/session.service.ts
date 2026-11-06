import { UserRepository, userRepository } from '../repositories/user.repository.js';

/**
 * Server-side session check for stateless JWTs (CWB-77). A token is current only while its `tv`
 * claim equals the account's stored token version; password change/reset and "log out everywhere"
 * bump that version, so every earlier token stops working at once. The lookup is a primary-key
 * read on every authenticated request and is deliberately not cached, so revocation takes effect
 * immediately on every server instance.
 */
export class SessionService {
  constructor(private readonly userRepo: UserRepository = userRepository) {}

  async isTokenCurrent(userId: string, tokenVersion: number): Promise<boolean> {
    const state = await this.userRepo.findSessionState(userId);
    // CWB-79: a locked account has no valid session even if a token slipped past the version bump.
    return state !== null && state.lockedAt === null && state.tokenVersion === tokenVersion;
  }
}

export const sessionService = new SessionService();
