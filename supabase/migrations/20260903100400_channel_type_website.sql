-- ════════════════════════════════════════════════════════════════════════════
-- BOb v1 · Slice 1 · Migration 5 of 5
-- F-08 — `channel_type` has no value for a website.
--
-- RULING APPLIED — F-08, ruled (a): add it.
--
-- An ASA is any artificial agent providing service on the business side: a
-- chatbot, a voice bot, and also a website, an app, or a form. The Product
-- Document names a website explicitly. The CHECK admitted bot, whatsapp, voice,
-- app, forms, email, social, retail, google, tickets, chat and reddit — and
-- nothing for the single most common static surface a business has.
--
-- WHY NOT FOLD IT INTO `forms` OR `app`. FR-11 and UI-03 report per channel. A
-- website, a contact form and a Google business listing collapsed into one
-- bucket would be visible to a customer as three surfaces reporting as one, and
-- there is no way to separate them afterwards without a data migration.
--
-- The CHECK in `20260606120000_initial_schema.sql` is applied history and
-- cannot be edited, so it is replaced here.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_channel_type_check;

ALTER TABLE channels
  ADD CONSTRAINT channels_channel_type_check
  CHECK (channel_type IN (
    'bot','whatsapp','voice','app','forms','email',
    'social','retail','google','tickets','chat','reddit',
    'website'
  ));

COMMENT ON COLUMN channels.channel_type IS
  'The surface an interaction happened on. Static surfaces — website, app, '
  'forms, google, retail — carry an ASA whose service agent does not converse. '
  'It is still a service agent, which is what lets one set of five metrics '
  'apply identically to a checkout page and a phone call.';

COMMIT;
