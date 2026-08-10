-- V3.5 Phase 1: payment schema compatibility hardening
-- Purpose: protect runtime payment flow against partially upgraded V3.4.1 databases

ALTER TABLE payment_attempts
  ADD COLUMN payment_method_id CHAR(36) NULL;
ALTER TABLE payment_attempts
  ADD COLUMN authorization_status VARCHAR(32) NULL;
ALTER TABLE payment_attempts
  ADD COLUMN capture_status VARCHAR(32) NULL;
ALTER TABLE payment_attempts
  ADD COLUMN action_required_json JSON NULL;

ALTER TABLE payments
  ADD COLUMN payment_method_id CHAR(36) NULL;
ALTER TABLE payments
  ADD COLUMN capture_status VARCHAR(32) NOT NULL DEFAULT 'CAPTURED';

ALTER TABLE payment_methods
  ADD COLUMN provider_token_encrypted TEXT NULL;
ALTER TABLE payment_methods
  ADD COLUMN provider_payment_method_id VARCHAR(255) NULL;
ALTER TABLE payment_methods
  ADD COLUMN tokenization_status VARCHAR(32) NOT NULL DEFAULT 'READY';

ALTER TABLE payment_method_sessions
  ADD COLUMN provider_token_encrypted TEXT NULL;
ALTER TABLE payment_method_sessions
  ADD COLUMN provider_payment_method_id VARCHAR(255) NULL;

CREATE INDEX idx_payment_attempts_payment_method_id ON payment_attempts(payment_method_id);
CREATE INDEX idx_payments_payment_method_id ON payments(payment_method_id);
