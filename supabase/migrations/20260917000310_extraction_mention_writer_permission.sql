begin;

-- The stored generated mention_id expression invokes this deterministic
-- helper under the inserting service_role. No public role receives access.
grant execute on function core.extraction_mention_id(uuid, text, text, integer, integer)
  to service_role;

commit;
