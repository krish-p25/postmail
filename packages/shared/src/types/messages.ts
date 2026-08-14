export enum MessageStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DISCARDED = 'discarded',
  FAILED = 'failed',
}

export interface MessageRegistration {
  trackingToken: string;
  recipient: string;
  subject: string;
  status: MessageStatus;
}

export interface TrackingEvent {
  messageId: string;
  eventType: 'open_detected';
  occurredAt: string;
  userAgent?: string;
  ipAddress?: string;
}
