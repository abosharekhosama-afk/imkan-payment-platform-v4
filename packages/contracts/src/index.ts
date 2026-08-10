export type Currency=string;
export type PaymentStatus='CREATED'|'PENDING'|'SUCCEEDED'|'FAILED'|'PARTIALLY_REFUNDED'|'REFUNDED'|'DISPUTED'|'CANCELLED';
export type PlatformEventType='payment.succeeded'|'payment.failed'|'payment.refund.succeeded'|'payment.disputed'|'settlement.created'|'payout.completed'|'customer.created'|'customer.updated'|'invoice.payment.requested';
export interface PlatformEvent<T=unknown>{event_id:string;event_type:PlatformEventType;event_version:1;tenant_id:string;aggregate_type:string;aggregate_id:string;occurred_at:string;idempotency_key:string;payload:T;metadata?:Record<string,string>;}
export interface PaymentSucceededPayload{payment_id:string;merchant_id:string;customer_id?:string;amount_minor:string;currency:Currency;fee_minor:string;net_amount_minor:string;processor:string;processor_transaction_id:string;external_invoice_id?:string;}
export interface RefundSucceededPayload{refund_id:string;payment_id:string;amount_minor:string;currency:Currency;processor_refund_id:string;external_invoice_id?:string;}
export interface SettlementPayload{settlement_id:string;merchant_id:string;gross_amount_minor:string;fees_minor:string;net_amount_minor:string;currency:Currency;provider_reference:string;}
export interface PayoutPayload{payout_id:string;merchant_id:string;amount_minor:string;currency:Currency;provider_reference:string;status:string;}
