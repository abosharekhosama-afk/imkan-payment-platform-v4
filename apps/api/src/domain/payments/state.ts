export type PaymentStatus='CREATED'|'PENDING'|'SUCCEEDED'|'FAILED'|'PARTIALLY_REFUNDED'|'REFUNDED'|'DISPUTED'|'CANCELLED';
const allowed:Record<PaymentStatus,PaymentStatus[]>={CREATED:['PENDING','CANCELLED','FAILED'],PENDING:['SUCCEEDED','FAILED','CANCELLED'],SUCCEEDED:['PARTIALLY_REFUNDED','REFUNDED','DISPUTED'],FAILED:[],PARTIALLY_REFUNDED:['REFUNDED','DISPUTED'],REFUNDED:['DISPUTED'],DISPUTED:[],CANCELLED:[]};
export function transition(from:PaymentStatus,to:PaymentStatus){if(!allowed[from].includes(to)) throw new Error(`Invalid payment transition ${from} -> ${to}`);return to;}
