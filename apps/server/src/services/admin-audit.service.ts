import { AuditEventFilter, listAuditEvents } from '../repositories/audit.repository.js';

export interface AuditEventDto {
  id: string;
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: Date;
}

export interface AuditEventListResponseData {
  items: AuditEventDto[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export class AdminAuditService {
  constructor(private readonly list: typeof listAuditEvents = listAuditEvents) {}

  async getAuditEvents(filter: AuditEventFilter): Promise<AuditEventListResponseData> {
    const { items, pagination } = await this.list(filter);
    return {
      items: items.map((event) => ({
        id: event.id,
        actorId: event.actorId,
        actorRole: event.actorRole,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        before: event.before,
        after: event.after,
        createdAt: event.createdAt,
      })),
      pagination,
    };
  }
}

export const adminAuditService = new AdminAuditService();
