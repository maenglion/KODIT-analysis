select
  (select count(*) from core.labels where label_contract_version = 'label-v1') as labels,
  (select count(*) from core.extraction_mention_labels where label_contract_version = 'label-v1') as mention_links,
  (select count(*) from core.notice_department_residual_labels where label_contract_version = 'label-v1') as residual_links,
  (select count(*) from core.label_metrics where label_contract_version = 'label-v1' and first_seen_at > last_seen_at) as date_order_errors;

select resolved_label_type, count(*) as labels
from core.label_type_evidence
where label_contract_version = 'label-v1'
group by resolved_label_type
order by resolved_label_type;

select distinct_raw_variant_count, count(*) as labels
from core.label_metrics
where label_contract_version = 'label-v1'
group by distinct_raw_variant_count
order by distinct_raw_variant_count;
