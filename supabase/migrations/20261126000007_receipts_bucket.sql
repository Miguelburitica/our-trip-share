-- Receipt photos ("soporte"). Private bucket: the server uploads with the service role and hands out
-- short-lived signed URLs to trip members; no storage policies, so clients can't list or read it directly.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
