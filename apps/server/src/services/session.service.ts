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
    const current = await this.userRepo.findTokenVersion(userId);
    return current !== null && current === tokenVersion;
  }
}

export const sessionService = new SessionService();
