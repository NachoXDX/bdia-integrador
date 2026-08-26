-- =========================================================
-- Database Roles Setup Script
-- Defines app_user (CRUD) and ai_agent (Read-Only) roles
-- =========================================================

-- 1. Create app_user role if it does not exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user WITH LOGIN PASSWORD 'app_password';
    END IF;
END $$;

-- 2. Create ai_agent role if it does not exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ai_agent') THEN
        CREATE ROLE ai_agent WITH LOGIN PASSWORD 'ai_agent_password';
    END IF;
END $$;

-- 3. Grant connection and schema privileges
GRANT CONNECT ON DATABASE postgres TO app_user, ai_agent;
GRANT USAGE ON SCHEMA public TO app_user, ai_agent;

-- 4. Grant table privileges for app_user (CRUD)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_user;

-- 5. Grant table privileges for ai_agent (Read-Only SELECT)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ai_agent;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT SELECT ON TABLES TO ai_agent;
