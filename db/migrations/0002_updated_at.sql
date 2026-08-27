-- Keep updated_at honest without relying on application discipline.
CREATE OR REPLACE FUNCTION vatproof.set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_set_updated_at ON vatproof.orders;
CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON vatproof.orders
  FOR EACH ROW EXECUTE FUNCTION vatproof.set_updated_at();

DROP TRIGGER IF EXISTS order_items_set_updated_at ON vatproof.order_items;
CREATE TRIGGER order_items_set_updated_at
  BEFORE UPDATE ON vatproof.order_items
  FOR EACH ROW EXECUTE FUNCTION vatproof.set_updated_at();
