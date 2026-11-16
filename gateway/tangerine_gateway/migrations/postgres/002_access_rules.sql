-- Declarative SSO access rules, baseline group, strict membership, and domain policy.
ALTER TABLE providers ADD COLUMN access_rules TEXT NOT NULL DEFAULT '[]';
ALTER TABLE providers ADD COLUMN baseline_group TEXT;
ALTER TABLE providers ADD COLUMN baseline_roles TEXT NOT NULL DEFAULT '[]';
ALTER TABLE providers ADD COLUMN strict_groups BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE providers ADD COLUMN allowed_email_domains TEXT NOT NULL DEFAULT '[]';
ALTER TABLE providers ADD COLUMN require_hosted_domain BOOLEAN NOT NULL DEFAULT FALSE;
