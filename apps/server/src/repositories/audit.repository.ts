import { Prisma, Role } from '@prisma/client';
import prisma from '../utils/prisma.util.js';

/** Verified identity from the JWT (`req.user`), never from the request body. */
export interface AuditActor {
  id: string;
  role: Role;
}

export const AUDIT_ACTIONS = [
  'BOOKING_GUEST_CREATED',
  'BOOKING_PAYMENT_CONFIRMED',
  'BOOKING_CANCELLED_BY_ADMIN',
  'BOOKING_CHECKED_IN',
  'BOOKING_COMPLETED',
  'BOOKING_MARKED_NO_SHOW',
  'ROOM_STATUS_CHANGED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export const AUDIT_ENTITY_TYPES = ['BOOKING', 'ROOM'] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export interface AuditEventInput {
  actor: AuditActor;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

const toJson = (value: Record<string, unknown> | null | undefined) =>
  value ? (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue) : Prisma.DbNull;

/**
 * Appends an audit event with the caller's transaction client so the event commits or rolls
 * back together with the change it describes. Callers only record real state changes.
 */
export async function recordAuditEvent(
  tx: Prisma.TransactionClient,
  event: AuditEventInput,
): Promise<void> {
  await tx.auditEvent.create({
    data: {
      actorId: event.actor.id,
      actorRole: event.actor.role,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      before: toJson(event.before),
      after: toJson(event.after),
    },
  });
}

export interface AuditEventFilter {
  page: number;
  limit: number;
  entityType?: AuditEntityType;
  entityId?: string;
  action?: AuditAction;
}

export async function listAuditEvents(filter: AuditEventFilter) {
  const where: Prisma.AuditEventWhereInput = {
    ...(filter.entityType ? { entityType: filter.entityType } : {}),
    ...(filter.entityId ? { entityId: filter.entityId } : {}),
    ...(filter.action ? { action: filter.action } : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({
      where,
      orderBy: { sequence: 'desc' },
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    }),
  ]);
  return {
    items,
    pagination: {
      page: filter.page,
      limit: filter.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / filter.limit)),
    },
  };
}
