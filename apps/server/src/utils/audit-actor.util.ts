import type { Request } from 'express';
import type { AuditActor } from '../repositories/audit.repository.js';

/** Audit identity comes only from the verified JWT set by `authenticate`, never from the body. */
export function auditActorOf(req: Request): AuditActor | undefined {
  return req.user ? { id: req.user.sub, role: req.user.role } : undefined;
}
