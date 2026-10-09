-- =====================================================================
--  Debulgado's Coffee Shop POS  -  MySQL database
--
--  How to use this file
--    phpMyAdmin / XAMPP : create a database, open it, Import tab, choose this file.
--    MySQL console      : mysql -u USER -p DATABASE_NAME < debulgado_pos.sql
--    Online (Vercel)    : not needed. The app creates these tables by itself the
--                         first time it runs with an empty database.
--
--  Importing this file REPLACES the tables below (all their data is erased).
--  Money is in pesos (DECIMAL 10,2). Times in orders are the shop's local time.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP VIEW IF EXISTS product_sales;
DROP VIEW IF EXISTS daily_sales;
DROP TABLE IF EXISTS online_orders;
DROP TABLE IF EXISTS order_item_addons;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS addon_categories;
DROP TABLE IF EXISTS addons;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS shop_settings;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS app_settings;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
--  System tables
-- ---------------------------------------------------------------------

-- Server settings: the shop password (stored as a secure hash, never as plain text)
-- and the change counter that tells each device what is new since its last sync.
CREATE TABLE app_settings (
  setting_key   VARCHAR(64)  NOT NULL PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every laptop or phone signed in to the shop. Each gets its own receipt prefix
-- (L for "Laptop", P for "Phone"...) so receipt numbers never repeat.
CREATE TABLE devices (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(60) NOT NULL,
  prefix     VARCHAR(4)  NOT NULL UNIQUE,
  token_hash CHAR(64)    NOT NULL UNIQUE,
  created_at DATETIME    NOT NULL,
  last_seen  DATETIME    NULL,
  signed_out_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Shop details printed on receipts and shared by all devices (always one row, id = 1).
CREATE TABLE shop_settings (
  id              TINYINT      NOT NULL PRIMARY KEY,
  shop_name       VARCHAR(120) NOT NULL,
  shop_address    VARCHAR(200) NOT NULL DEFAULT '',
  receipt_footer  VARCHAR(200) NOT NULL DEFAULT '',
  senior_pwd_rate DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  manager_pin     VARCHAR(8)   NOT NULL DEFAULT '',
  updated_at      VARCHAR(30)  NOT NULL,
  seq             BIGINT       NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Menu
--  updated_at = when the row was last edited (the newest edit wins when syncing)
--  seq        = change number, so devices only download what changed
-- ---------------------------------------------------------------------

CREATE TABLE categories (
  id         VARCHAR(64)  NOT NULL PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  sort_order INT          NOT NULL DEFAULT 0,
  active     TINYINT(1)   NOT NULL DEFAULT 1,
  color      VARCHAR(16)  NULL,                -- edge color of its cards on the POS, e.g. #2a8a7a (empty: automatic)
  updated_at VARCHAR(30)  NOT NULL,
  seq        BIGINT       NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
  id          VARCHAR(64)   NOT NULL PRIMARY KEY,
  category_id VARCHAR(64)   NOT NULL,
  name        VARCHAR(120)  NOT NULL,
  price       DECIMAL(10,2) NOT NULL,
  sort_order  INT           NOT NULL DEFAULT 0,
  active      TINYINT(1)    NOT NULL DEFAULT 1,
  image       MEDIUMTEXT    NULL,          -- product photo as a small JPEG data URL (data:image/jpeg;base64,...)
  updated_at  VARCHAR(30)   NOT NULL,
  seq         BIGINT        NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add-ons such as Extra Shot and Oat Milk.
CREATE TABLE addons (
  id         VARCHAR(64)   NOT NULL PRIMARY KEY,
  name       VARCHAR(120)  NOT NULL,
  price      DECIMAL(10,2) NOT NULL,
  active     TINYINT(1)    NOT NULL DEFAULT 1,
  updated_at VARCHAR(30)   NOT NULL,
  seq        BIGINT        NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which categories each add-on is offered for (many-to-many).
CREATE TABLE addon_categories (
  addon_id    VARCHAR(64) NOT NULL,
  category_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (addon_id, category_id),
  FOREIGN KEY (addon_id)    REFERENCES addons (id)     ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Sales
-- ---------------------------------------------------------------------

CREATE TABLE orders (
  id              VARCHAR(64)   NOT NULL PRIMARY KEY,  -- made on the device, so offline orders never clash
  order_no        VARCHAR(20)   NOT NULL,              -- receipt number, e.g. L-0012
  device_name     VARCHAR(60)   NULL,
  cashier         VARCHAR(60)   NULL,
  created_at      DATETIME      NOT NULL,              -- shop local time
  order_date      DATE          NOT NULL,
  service         VARCHAR(10)   NOT NULL,              -- dine-in / take-out
  subtotal        DECIMAL(10,2) NOT NULL,
  discount        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  discount_label  VARCHAR(60)   NULL,                  -- e.g. Senior citizen 20%
  total           DECIMAL(10,2) NOT NULL,
  payment_method  VARCHAR(10)   NOT NULL,              -- cash / gcash
  amount_tendered DECIMAL(10,2) NULL,                  -- cash only
  change_due      DECIMAL(10,2) NULL,                  -- cash only
  gcash_ref       VARCHAR(60)   NULL,                  -- optional
  customer_name   VARCHAR(60)   NULL,                  -- online orders: the name the customer gave
  online_order_id VARCHAR(64)   NULL,                  -- online orders: the row in online_orders
  status          VARCHAR(10)   NOT NULL DEFAULT 'paid',  -- paid / void
  void_reason     VARCHAR(300)  NULL,
  voided_at       DATETIME      NULL,
  updated_at      VARCHAR(30)   NOT NULL,
  received_at     DATETIME      NOT NULL,              -- when the server received it
  seq             BIGINT        NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_orders_date ON orders (order_date);
CREATE INDEX idx_orders_seq  ON orders (seq);

CREATE TABLE order_items (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  order_id     VARCHAR(64)   NOT NULL,
  line_no      INT           NOT NULL,
  product_id   VARCHAR(64)   NULL,
  product_name VARCHAR(120)  NOT NULL,                 -- kept as sold, even if the menu changes later
  category     VARCHAR(120)  NULL,
  unit_price   DECIMAL(10,2) NOT NULL,                 -- price of the product alone
  qty          INT           NOT NULL,
  line_total   DECIMAL(10,2) NOT NULL,                 -- (product + add-ons) x qty
  FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_order_items_order ON order_items (order_id);

CREATE TABLE order_item_addons (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  order_item_id INT           NOT NULL,
  addon_id      VARCHAR(64)   NULL,
  addon_name    VARCHAR(120)  NOT NULL,
  price         DECIMAL(10,2) NOT NULL,                -- per item
  FOREIGN KEY (order_item_id) REFERENCES order_items (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Online orders
--  Customers scan the order QR, choose items on their phone, give their name,
--  then scan the counter QR to send the order. The cashier opens it on the POS
--  and takes payment; it then becomes a normal sale in the orders table.
-- ---------------------------------------------------------------------

CREATE TABLE online_orders (
  id             VARCHAR(64)   NOT NULL PRIMARY KEY,   -- made on the customer's phone
  secret         CHAR(32)      NOT NULL,               -- lets that phone check on its order
  customer_name  VARCHAR(60)   NOT NULL,
  service        VARCHAR(10)   NOT NULL,               -- dine-in / take-out
  items          TEXT          NOT NULL,               -- the items as JSON, priced by the server
  item_count     INT           NOT NULL,
  total          DECIMAL(10,2) NOT NULL,
  status         VARCHAR(10)   NOT NULL DEFAULT 'waiting',  -- waiting / paid / cancelled
  opened_by      INT           NULL,                   -- the device that has it open on the POS
  opened_by_name VARCHAR(60)   NULL,
  order_id       VARCHAR(64)   NULL,                   -- the sale it became (orders.id)
  created_at     VARCHAR(30)   NOT NULL,               -- UTC, e.g. 2026-10-09T05:12:00.000Z
  updated_at     VARCHAR(30)   NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_online_orders_status ON online_orders (status, created_at);

-- ---------------------------------------------------------------------
--  Ready-made reports (open them like tables)
-- ---------------------------------------------------------------------

CREATE VIEW daily_sales AS
  SELECT order_date,
         COUNT(*)                                                  AS orders,
         SUM(subtotal)                                             AS gross_sales,
         SUM(discount)                                             AS discounts,
         SUM(total)                                                AS net_sales,
         SUM(CASE WHEN payment_method = 'cash'  THEN total ELSE 0 END) AS cash,
         SUM(CASE WHEN payment_method = 'gcash' THEN total ELSE 0 END) AS gcash
  FROM orders
  WHERE status = 'paid'
  GROUP BY order_date;

CREATE VIEW product_sales AS
  SELECT i.product_name, i.category, SUM(i.qty) AS qty_sold, SUM(i.line_total) AS sales
  FROM order_items i
  JOIN orders o ON o.id = i.order_id
  WHERE o.status = 'paid'
  GROUP BY i.product_name, i.category;

-- =====================================================================
--  STARTING DATA (the menu board)
-- =====================================================================

INSERT INTO app_settings (setting_key, setting_value) VALUES
  ('seq', '32'),
  ('shop_password_hash', ''),
  ('online_open', '1');

INSERT INTO shop_settings (id, shop_name, shop_address, receipt_footer, senior_pwd_rate, manager_pin, updated_at, seq) VALUES
  (1, 'Debulgado''s Coffee Shop', '', 'Thank you. Come again.', 20.00, '', '2026-01-01T00:00:00.000Z', 32);

INSERT INTO categories (id, name, sort_order, active, updated_at, seq) VALUES
  ('c-iced-coffee', 'Iced Coffee', 0, 1, '2026-01-01T00:00:00.000Z', 1),
  ('c-non-coffee', 'Non-Coffee', 1, 1, '2026-01-01T00:00:00.000Z', 2),
  ('c-fruit-soda', 'Fruit Soda', 2, 1, '2026-01-01T00:00:00.000Z', 3),
  ('c-french-toast', 'French Toast', 3, 1, '2026-01-01T00:00:00.000Z', 4);

INSERT INTO products (id, category_id, name, price, sort_order, active, updated_at, seq) VALUES
  ('p-spanish-latte', 'c-iced-coffee', 'Spanish Latte', 70.00, 0, 1, '2026-01-01T00:00:00.000Z', 5),
  ('p-caramel-macchiato', 'c-iced-coffee', 'Caramel Macchiato', 70.00, 1, 1, '2026-01-01T00:00:00.000Z', 6),
  ('p-salted-caramel', 'c-iced-coffee', 'Salted Caramel', 70.00, 2, 1, '2026-01-01T00:00:00.000Z', 7),
  ('p-vanilla-latte', 'c-iced-coffee', 'Vanilla Latte', 70.00, 3, 1, '2026-01-01T00:00:00.000Z', 8),
  ('p-cold-brew', 'c-iced-coffee', 'Cold Brew', 70.00, 4, 1, '2026-01-01T00:00:00.000Z', 9),
  ('p-vietnamese-style', 'c-iced-coffee', 'Vietnamese Style', 70.00, 5, 1, '2026-01-01T00:00:00.000Z', 10),
  ('p-creme-brulee', 'c-iced-coffee', 'Crème Brûlée', 70.00, 6, 1, '2026-01-01T00:00:00.000Z', 11),
  ('p-tiramisu-latte', 'c-iced-coffee', 'Tiramisu Latte', 70.00, 7, 1, '2026-01-01T00:00:00.000Z', 12),
  ('p-iced-latte', 'c-iced-coffee', 'Iced Latte', 70.00, 8, 1, '2026-01-01T00:00:00.000Z', 13),
  ('p-barista-drink', 'c-iced-coffee', 'Barista Drink', 95.00, 9, 1, '2026-01-01T00:00:00.000Z', 14),
  ('p-irish-coffee', 'c-iced-coffee', 'Irish Coffee', 95.00, 10, 1, '2026-01-01T00:00:00.000Z', 15),
  ('p-matcha', 'c-non-coffee', 'Matcha', 99.00, 0, 1, '2026-01-01T00:00:00.000Z', 16),
  ('p-choco-lava', 'c-non-coffee', 'Choco Lava', 80.00, 1, 1, '2026-01-01T00:00:00.000Z', 17),
  ('p-green-apple', 'c-fruit-soda', 'Green Apple', 60.00, 0, 1, '2026-01-01T00:00:00.000Z', 18),
  ('p-lychee', 'c-fruit-soda', 'Lychee', 60.00, 1, 1, '2026-01-01T00:00:00.000Z', 19),
  ('p-strawberry', 'c-fruit-soda', 'Strawberry', 60.00, 2, 1, '2026-01-01T00:00:00.000Z', 20),
  ('p-blueberry', 'c-fruit-soda', 'Blueberry', 60.00, 3, 1, '2026-01-01T00:00:00.000Z', 21),
  ('p-peach-mango', 'c-fruit-soda', 'Peach Mango', 60.00, 4, 1, '2026-01-01T00:00:00.000Z', 22),
  ('p-passion-fruit', 'c-fruit-soda', 'Passion Fruit', 60.00, 5, 1, '2026-01-01T00:00:00.000Z', 23),
  ('p-lemon', 'c-fruit-soda', 'Lemon', 60.00, 6, 1, '2026-01-01T00:00:00.000Z', 24),
  ('p-mango', 'c-fruit-soda', 'Mango', 60.00, 7, 1, '2026-01-01T00:00:00.000Z', 25),
  ('p-nutella-toast', 'c-french-toast', 'Nutella Toast', 65.00, 0, 1, '2026-01-01T00:00:00.000Z', 26),
  ('p-biscoff-toast', 'c-french-toast', 'Biscoff Toast', 65.00, 1, 1, '2026-01-01T00:00:00.000Z', 27),
  ('p-tiramisu-toast', 'c-french-toast', 'Tiramisu Toast', 65.00, 2, 1, '2026-01-01T00:00:00.000Z', 28),
  ('p-pistachio-toast', 'c-french-toast', 'Pistachio Toast', 65.00, 3, 1, '2026-01-01T00:00:00.000Z', 29);

INSERT INTO addons (id, name, price, active, updated_at, seq) VALUES
  ('a-extra-shot', 'Extra Shot', 30.00, 1, '2026-01-01T00:00:00.000Z', 30),
  ('a-oat-milk', 'Oat Milk', 35.00, 1, '2026-01-01T00:00:00.000Z', 31);

INSERT INTO addon_categories (addon_id, category_id) VALUES
  ('a-extra-shot', 'c-iced-coffee'),
  ('a-extra-shot', 'c-non-coffee'),
  ('a-oat-milk', 'c-iced-coffee'),
  ('a-oat-milk', 'c-non-coffee');

-- next change number for syncing
