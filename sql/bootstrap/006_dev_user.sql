-- Bootstrap 006: default dev user (match NEXT_PUBLIC_DEV_USER_ID in .env.local)
INSERT INTO auth.users (id, email)
VALUES ('0a80d616-ac29-4151-b43f-fd8985c7c8d5', 'dev@teto.local')
ON CONFLICT (id) DO NOTHING;
