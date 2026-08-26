-- =========================================================
-- Database Triggers Script
-- Automates background updates upon specific table events
-- =========================================================

-- =========================================================
-- 1. Trigger Function: Update stock balance on movement insert (Atomic UPSERT)
-- =========================================================

CREATE OR REPLACE FUNCTION fn_actualizar_stock_movimiento()
RETURNS TRIGGER AS $$
BEGIN
    -- Atomic UPSERT to avoid concurrent race conditions
    INSERT INTO stock (parte_id, cantidad)
    VALUES (NEW.parte_id, NEW.cantidad)
    ON CONFLICT (parte_id)
    DO UPDATE SET cantidad = stock.cantidad + EXCLUDED.cantidad;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it already exists to allow idempotent script execution
DROP TRIGGER IF EXISTS trg_actualizar_stock ON stock_movimientos;

-- Attach trigger to stock_movimientos table
CREATE TRIGGER trg_actualizar_stock
AFTER INSERT ON stock_movimientos
FOR EACH ROW
EXECUTE FUNCTION fn_actualizar_stock_movimiento();
