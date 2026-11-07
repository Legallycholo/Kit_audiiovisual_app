-- Starter data. Service names, durations and hours are placeholders for the owner to edit.
insert into public.app_settings (key, value) values
  ('business_name', '"KIT audiovisual"'),
  ('timezone', '"America/Mexico_City"'),
  ('require_account_approval', 'false'),
  ('cancellation_window_hours', '24'),
  ('min_notice_hours', '12'),
  ('max_horizon_days', '90')
on conflict (key) do nothing;

insert into public.services (name, slug, description, duration_minutes, sort) values
  ('Sesión de consulta', 'consulta', 'Reunión inicial para definir tu evento o producción.', 60, 1),
  ('Sesión de producción', 'produccion', 'Sesión de trabajo de producción audiovisual.', 120, 2)
on conflict (slug) do nothing;

insert into public.availability_rules (weekday, start_time, end_time)
select d, time '09:00', time '18:00' from generate_series(1, 5) as d
where not exists (select 1 from public.availability_rules);
