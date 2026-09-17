select
  count(*) as total_mentions,
  count(*) filter (
    where m.raw_text <> substring(
      e.extracted_text from m.span_start + 1 for m.span_end - m.span_start
    )
  ) as span_validation_failures,
  count(*) filter (where e.extraction_id is null) as broken_extraction_fk
from core.extraction_mentions m
left join core.document_extractions e on e.extraction_id = m.extraction_id
where m.mention_contract_version = 'mention-v1';

select mention_type,
       count(*) occurrence_count,
       count(distinct raw_text) distinct_raw_text_count,
       count(distinct extraction_id) extraction_count
from core.extraction_mentions
where mention_contract_version = 'mention-v1'
group by mention_type
order by mention_type;

select extractor_rule, count(*) occurrence_count
from core.extraction_mentions
where mention_contract_version = 'mention-v1'
group by extractor_rule
order by extractor_rule;
