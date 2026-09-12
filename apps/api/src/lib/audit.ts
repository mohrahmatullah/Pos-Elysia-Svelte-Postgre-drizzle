/** Audit log writer (PRD 11). Metadata must never contain secrets. */
import { db } from '../db';
import { auditLogs } from '../db/schema';
import type { Tx } from '../db';

export interface AuditEntry {
  storeId: string;
  userId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

const SENSITIVE_KEYS = /password|token|secret|authorization|card_number|cvv/i;

export const sanitizeMetadata = (metadata?: Record<string, unknown>): Record<string, unknown> | null => {
  if (!metadata) return null;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (SENSITIVE_KEYS.test(k)) {
      clean[k] = '[REDACTED]';
    } else if (v !== undefined) {
      clean[k] = v;
    }
  }
  return clean;
};

/** Write within the current transaction when a tx is passed, so audit + action are atomic. */
export async function writeAudit(entry: AuditEntry, tx?: Tx): Promise<void> {
  const conn = tx ?? db;
  await conn.insert(auditLogs).values({
    store_id: entry.storeId,
    user_id: entry.userId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    metadata: sanitizeMetadata(entry.metadata),
    ip_address: entry.ip ?? null,
    user_agent: entry.userAgent ?? null,
  });
}
