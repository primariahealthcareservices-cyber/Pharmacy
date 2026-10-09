CREATE DATABASE pharmacy_erp;
use pharmacy_erp;

CREATE TABLE `audit_logs` (
   `id` int NOT NULL AUTO_INCREMENT,
   `user_id` int DEFAULT NULL,
   `user_name` varchar(120) DEFAULT NULL,
   `action` varchar(40) DEFAULT NULL,
   `entity` varchar(60) DEFAULT NULL,
   `entity_id` int DEFAULT NULL,
   `old_value` text,
   `new_value` text,
   `ip` varchar(60) DEFAULT NULL,
   `created_at` datetime DEFAULT NULL,
   PRIMARY KEY (`id`),
   KEY `user_id` (`user_id`),
   KEY `ix_audit_logs_created_at` (`created_at`),
   CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
 ) ;
 
 CREATE TABLE `batches` (
   `id` int NOT NULL AUTO_INCREMENT,
   `medicine_id` int NOT NULL,
   `vendor_id` int DEFAULT NULL,
   `batch_no` varchar(80) NOT NULL,
   `mfg_date` date DEFAULT NULL,
   `exp_date` date DEFAULT NULL,
   `cost_price` float DEFAULT NULL,
   `mrp` float DEFAULT NULL,
   `selling_price` float DEFAULT NULL,
   `gst_rate` float DEFAULT NULL,
   `qty` int DEFAULT NULL,
   `initial_qty` int DEFAULT NULL,
   `free_qty` int DEFAULT NULL,
   `created_at` datetime DEFAULT NULL,
   `entry_qty` int DEFAULT '0',
   `entry_unit` varchar(20) DEFAULT 'tablet',
   PRIMARY KEY (`id`),
   KEY `medicine_id` (`medicine_id`),
   KEY `vendor_id` (`vendor_id`),
   KEY `ix_batches_exp_date` (`exp_date`),
   KEY `ix_batches_batch_no` (`batch_no`),
   CONSTRAINT `batches_ibfk_1` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`id`),
   CONSTRAINT `batches_ibfk_2` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`)
 ) ;
 
 CREATE TABLE `categories` (
   `id` int NOT NULL AUTO_INCREMENT,
   `name` varchar(120) NOT NULL,
   `description` varchar(255) DEFAULT NULL,
   PRIMARY KEY (`id`),
   UNIQUE KEY `name` (`name`)
 ) ;
 
 CREATE TABLE `customer_payments` (
   `id` int NOT NULL AUTO_INCREMENT,
   `customer_id` int NOT NULL,
   `sale_id` int DEFAULT NULL,
   `amount` float DEFAULT NULL,
   `mode` varchar(30) DEFAULT NULL,
   `payment_date` datetime DEFAULT NULL,
   `reference` varchar(120) DEFAULT NULL,
   `notes` varchar(255) DEFAULT NULL,
   `user_id` int DEFAULT NULL,
   PRIMARY KEY (`id`),
   KEY `customer_id` (`customer_id`),
   KEY `sale_id` (`sale_id`),
   KEY `user_id` (`user_id`),
   CONSTRAINT `customer_payments_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
   CONSTRAINT `customer_payments_ibfk_2` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`),
   CONSTRAINT `customer_payments_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
 ) ;
 
 CREATE TABLE `customers` (
   `id` int NOT NULL AUTO_INCREMENT,
   `name` varchar(150) NOT NULL,
   `phone` varchar(20) DEFAULT NULL,
   `email` varchar(150) DEFAULT NULL,
   `age` int DEFAULT NULL,
   `gender` varchar(15) DEFAULT NULL,
   `address` text,
   `customer_type` varchar(30) DEFAULT NULL,
   `doctor_name` varchar(150) DEFAULT NULL,
   `credit_limit` float DEFAULT NULL,
   `is_active` tinyint(1) DEFAULT NULL,
   `created_at` datetime DEFAULT NULL,
   PRIMARY KEY (`id`),
   KEY `ix_customers_phone` (`phone`)
 ) ;
 
 CREATE TABLE `expense_categories` (
   `id` int NOT NULL AUTO_INCREMENT,
   `name` varchar(120) NOT NULL,
   `description` varchar(255) DEFAULT NULL,
   PRIMARY KEY (`id`),
   UNIQUE KEY `name` (`name`)
 ) ;
 
 CREATE TABLE `expenses` (
   `id` int NOT NULL AUTO_INCREMENT,
   `category_id` int DEFAULT NULL,
   `amount` float DEFAULT NULL,
   `expense_date` date DEFAULT NULL,
   `payment_mode` varchar(30) DEFAULT NULL,
   `vendor_id` int DEFAULT NULL,
   `description` varchar(255) DEFAULT NULL,
   `reference` varchar(120) DEFAULT NULL,
   `user_id` int DEFAULT NULL,
   `created_at` datetime DEFAULT NULL,
   PRIMARY KEY (`id`),
   KEY `category_id` (`category_id`),
   KEY `vendor_id` (`vendor_id`),
   KEY `user_id` (`user_id`),
   KEY `ix_expenses_expense_date` (`expense_date`),
   CONSTRAINT `expenses_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `expense_categories` (`id`),
   CONSTRAINT `expenses_ibfk_2` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`),
   CONSTRAINT `expenses_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
 ) ;
 
 CREATE TABLE `manufacturer_payments` (
   `id` int NOT NULL AUTO_INCREMENT,
   `manufacturer_id` int NOT NULL,
   `amount` float DEFAULT NULL,
   `mode` varchar(30) DEFAULT NULL,
   `payment_date` datetime DEFAULT NULL,
   `reference` varchar(120) DEFAULT NULL,
   `notes` varchar(255) DEFAULT NULL,
   `user_id` int DEFAULT NULL,
   PRIMARY KEY (`id`),
   KEY `manufacturer_id` (`manufacturer_id`),
   KEY `user_id` (`user_id`),
   CONSTRAINT `manufacturer_payments_ibfk_1` FOREIGN KEY (`manufacturer_id`) REFERENCES `manufacturers` (`id`),
   CONSTRAINT `manufacturer_payments_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
 ) ;
 
 CREATE TABLE `manufacturers` (
   `id` int NOT NULL AUTO_INCREMENT,
   `name` varchar(150) NOT NULL,
   `code` varchar(40) DEFAULT NULL,
   `contact_person` varchar(120) DEFAULT NULL,
   `phone` varchar(20) DEFAULT NULL,
   `email` varchar(150) DEFAULT NULL,
   `address` text,
   `gst_number` varchar(20) DEFAULT NULL,
   `drug_license` varchar(60) DEFAULT NULL,
   `payment_terms` varchar(100) DEFAULT NULL,
   `credit_limit` float DEFAULT NULL,
   `bank_details` text,
   `created_at` datetime DEFAULT NULL,
   `opening_balance` float DEFAULT '0',
   PRIMARY KEY (`id`),
   UNIQUE KEY `name` (`name`)
 ) ;
 
 CREATE TABLE `medicines` (
   `id` int NOT NULL AUTO_INCREMENT,
   `sku` varchar(60) DEFAULT NULL,
   `barcode` varchar(80) DEFAULT NULL,
   `name` varchar(200) NOT NULL,
   `generic_name` varchar(200) DEFAULT NULL,
   `brand_name` varchar(150) DEFAULT NULL,
   `category_id` int DEFAULT NULL,
   `manufacturer_id` int DEFAULT NULL,
   `medicine_type` varchar(40) DEFAULT NULL,
   `dosage_form` varchar(60) DEFAULT NULL,
   `strength` varchar(60) DEFAULT NULL,
   `composition` text,
   `pack_type` varchar(60) DEFAULT NULL,
   `description` text,
   `hsn_code` varchar(20) DEFAULT NULL,
   `is_prescription` tinyint(1) DEFAULT NULL,
   `base_unit` varchar(20) DEFAULT NULL,
   `units_per_strip` int DEFAULT NULL,
   `strips_per_box` int DEFAULT NULL,
   `gst_rate` float DEFAULT NULL,
   `mrp` float DEFAULT NULL,
   `cost_price` float DEFAULT NULL,
   `selling_price` float DEFAULT NULL,
   `wholesale_price` float DEFAULT NULL,
   `min_selling_price` float DEFAULT NULL,
   `reorder_level` int DEFAULT NULL,
   `max_level` int DEFAULT NULL,
   `rack_location` varchar(60) DEFAULT NULL,
   `is_active` tinyint(1) DEFAULT NULL,
   `created_at` datetime DEFAULT NULL,
   PRIMARY KEY (`id`),
   UNIQUE KEY `ix_medicines_sku` (`sku`),
   KEY `category_id` (`category_id`),
   KEY `manufacturer_id` (`manufacturer_id`),
   KEY `ix_medicines_name` (`name`),
   KEY `ix_medicines_barcode` (`barcode`),
   CONSTRAINT `medicines_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`),
   CONSTRAINT `medicines_ibfk_2` FOREIGN KEY (`manufacturer_id`) REFERENCES `manufacturers` (`id`)
 ) ;
 
 CREATE TABLE `purchase_invoice_items` (
   `id` int NOT NULL AUTO_INCREMENT,
   `purchase_id` int DEFAULT NULL,
   `medicine_id` int DEFAULT NULL,
   `batch_id` int DEFAULT NULL,
   `batch_no` varchar(80) DEFAULT NULL,
   `mfg_date` date DEFAULT NULL,
   `exp_date` date DEFAULT NULL,
   `quantity` int DEFAULT NULL,
   `free_qty` int DEFAULT NULL,
   `cost_price` float DEFAULT NULL,
   `mrp` float DEFAULT NULL,
   `selling_price` float DEFAULT NULL,
   `gst_rate` float DEFAULT NULL,
   `discount_percent` float DEFAULT NULL,
   `line_total` float DEFAULT NULL,
   `returned_qty` int DEFAULT NULL,
   PRIMARY KEY (`id`),
   KEY `purchase_id` (`purchase_id`),
   KEY `medicine_id` (`medicine_id`),
   KEY `batch_id` (`batch_id`),
   CONSTRAINT `purchase_invoice_items_ibfk_1` FOREIGN KEY (`purchase_id`) REFERENCES `purchase_invoices` (`id`),
   CONSTRAINT `purchase_invoice_items_ibfk_2` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`id`),
   CONSTRAINT `purchase_invoice_items_ibfk_3` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`)
 ) ;
 
 CREATE TABLE `purchase_invoices` (
   `id` int NOT NULL AUTO_INCREMENT,
   `invoice_no` varchar(80) NOT NULL,
   `vendor_id` int NOT NULL,
   `invoice_date` date DEFAULT NULL,
   `received_date` date DEFAULT NULL,
   `sub_total` float DEFAULT NULL,
   `discount` float DEFAULT NULL,
   `tax_amount` float DEFAULT NULL,
   `total` float DEFAULT NULL,
   `paid_amount` float DEFAULT NULL,
   `due_amount` float DEFAULT NULL,
   `status` varchar(20) DEFAULT NULL,
   `notes` text,
   `user_id` int DEFAULT NULL,
   `created_at` datetime DEFAULT NULL,
   PRIMARY KEY (`id`),
   KEY `vendor_id` (`vendor_id`),
   KEY `user_id` (`user_id`),
   KEY `ix_purchase_invoices_invoice_no` (`invoice_no`),
   CONSTRAINT `purchase_invoices_ibfk_1` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`),
   CONSTRAINT `purchase_invoices_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
 );
 
 CREATE TABLE `purchase_return_items` (
   `id` int NOT NULL AUTO_INCREMENT,
   `purchase_return_id` int DEFAULT NULL,
   `medicine_id` int DEFAULT NULL,
   `batch_id` int DEFAULT NULL,
   `quantity` int DEFAULT NULL,
   `cost_price` float DEFAULT NULL,
   `line_total` float DEFAULT NULL,
   PRIMARY KEY (`id`),
   KEY `purchase_return_id` (`purchase_return_id`),
   KEY `medicine_id` (`medicine_id`),
   KEY `batch_id` (`batch_id`),
   CONSTRAINT `purchase_return_items_ibfk_1` FOREIGN KEY (`purchase_return_id`) REFERENCES `purchase_returns` (`id`),
   CONSTRAINT `purchase_return_items_ibfk_2` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`id`),
   CONSTRAINT `purchase_return_items_ibfk_3` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`)
 ) ;
 
 CREATE TABLE `purchase_returns` (
   `id` int NOT NULL AUTO_INCREMENT,
   `purchase_id` int DEFAULT NULL,
   `vendor_id` int DEFAULT NULL,
   `return_date` date DEFAULT NULL,
   `reason` varchar(255) DEFAULT NULL,
   `total` float DEFAULT NULL,
   `user_id` int DEFAULT NULL,
   PRIMARY KEY (`id`),
   KEY `purchase_id` (`purchase_id`),
   KEY `vendor_id` (`vendor_id`),
   KEY `user_id` (`user_id`),
   CONSTRAINT `purchase_returns_ibfk_1` FOREIGN KEY (`purchase_id`) REFERENCES `purchase_invoices` (`id`),
   CONSTRAINT `purchase_returns_ibfk_2` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`),
   CONSTRAINT `purchase_returns_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
 ) ;
 
 CREATE TABLE `sale_items` (
   `id` int NOT NULL AUTO_INCREMENT,
   `sale_id` int DEFAULT NULL,
   `medicine_id` int DEFAULT NULL,
   `batch_id` int DEFAULT NULL,
   `batch_no` varchar(80) DEFAULT NULL,
   `exp_date` date DEFAULT NULL,
   `quantity` int DEFAULT NULL,
   `unit_label` varchar(20) DEFAULT NULL,
   `mrp` float DEFAULT NULL,
   `selling_price` float DEFAULT NULL,
   `cost_price` float DEFAULT NULL,
   `discount_percent` float DEFAULT NULL,
   `gst_rate` float DEFAULT NULL,
   `tax_amount` float DEFAULT NULL,
   `line_total` float DEFAULT NULL,
   `profit` float DEFAULT NULL,
   `returned_qty` int DEFAULT NULL,
   PRIMARY KEY (`id`),
   KEY `sale_id` (`sale_id`),
   KEY `medicine_id` (`medicine_id`),
   KEY `batch_id` (`batch_id`),
   CONSTRAINT `sale_items_ibfk_1` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`),
   CONSTRAINT `sale_items_ibfk_2` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`id`),
   CONSTRAINT `sale_items_ibfk_3` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`)
 ) ;
 
 CREATE TABLE `sale_payments` (
   `id` int NOT NULL AUTO_INCREMENT,
   `sale_id` int DEFAULT NULL,
   `mode` varchar(30) DEFAULT NULL,
   `amount` float DEFAULT NULL,
   `reference` varchar(120) DEFAULT NULL,
   `paid_at` datetime DEFAULT NULL,
   PRIMARY KEY (`id`),
   KEY `sale_id` (`sale_id`),
   CONSTRAINT `sale_payments_ibfk_1` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`)
 );
 
 CREATE TABLE `sales_return_items` (
   `id` int NOT NULL AUTO_INCREMENT,
   `sales_return_id` int DEFAULT NULL,
   `medicine_id` int DEFAULT NULL,
   `batch_id` int DEFAULT NULL,
   `quantity` int DEFAULT NULL,
   `selling_price` float DEFAULT NULL,
   `line_total` float DEFAULT NULL,
   PRIMARY KEY (`id`),
   KEY `sales_return_id` (`sales_return_id`),
   KEY `medicine_id` (`medicine_id`),
   KEY `batch_id` (`batch_id`),
   CONSTRAINT `sales_return_items_ibfk_1` FOREIGN KEY (`sales_return_id`) REFERENCES `sales_returns` (`id`),
   CONSTRAINT `sales_return_items_ibfk_2` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`id`),
   CONSTRAINT `sales_return_items_ibfk_3` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`)
 ) ;
 
 CREATE TABLE `sales_return_items` (
   `id` int NOT NULL AUTO_INCREMENT,
   `sales_return_id` int DEFAULT NULL,
   `medicine_id` int DEFAULT NULL,
   `batch_id` int DEFAULT NULL,
   `quantity` int DEFAULT NULL,
   `selling_price` float DEFAULT NULL,
   `line_total` float DEFAULT NULL,
   PRIMARY KEY (`id`),
   KEY `sales_return_id` (`sales_return_id`),
   KEY `medicine_id` (`medicine_id`),
   KEY `batch_id` (`batch_id`),
   CONSTRAINT `sales_return_items_ibfk_1` FOREIGN KEY (`sales_return_id`) REFERENCES `sales_returns` (`id`),
   CONSTRAINT `sales_return_items_ibfk_2` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`id`),
   CONSTRAINT `sales_return_items_ibfk_3` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`)
 );
 
 CREATE TABLE `sales` (
   `id` int NOT NULL AUTO_INCREMENT,
   `invoice_no` varchar(60) DEFAULT NULL,
   `customer_id` int DEFAULT NULL,
   `sale_date` datetime DEFAULT NULL,
   `sub_total` float DEFAULT NULL,
   `discount` float DEFAULT NULL,
   `tax_amount` float DEFAULT NULL,
   `total` float DEFAULT NULL,
   `cogs` float DEFAULT NULL,
   `profit` float DEFAULT NULL,
   `paid_amount` float DEFAULT NULL,
   `due_amount` float DEFAULT NULL,
   `payment_status` varchar(20) DEFAULT NULL,
   `payment_mode` varchar(40) DEFAULT NULL,
   `prescription_no` varchar(80) DEFAULT NULL,
   `doctor_name` varchar(150) DEFAULT NULL,
   `notes` text,
   `user_id` int DEFAULT NULL,
   `is_returned` tinyint(1) DEFAULT NULL,
   PRIMARY KEY (`id`),
   UNIQUE KEY `ix_sales_invoice_no` (`invoice_no`),
   KEY `customer_id` (`customer_id`),
   KEY `user_id` (`user_id`),
   KEY `ix_sales_sale_date` (`sale_date`),
   CONSTRAINT `sales_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
   CONSTRAINT `sales_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
 ) ;
 
 CREATE TABLE `sales_returns` (
   `id` int NOT NULL AUTO_INCREMENT,
   `sale_id` int DEFAULT NULL,
   `customer_id` int DEFAULT NULL,
   `return_date` datetime DEFAULT NULL,
   `reason` varchar(255) DEFAULT NULL,
   `total` float DEFAULT NULL,
   `refund_mode` varchar(30) DEFAULT NULL,
   `user_id` int DEFAULT NULL,
   PRIMARY KEY (`id`),
   KEY `sale_id` (`sale_id`),
   KEY `customer_id` (`customer_id`),
   KEY `user_id` (`user_id`),
   CONSTRAINT `sales_returns_ibfk_1` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`),
   CONSTRAINT `sales_returns_ibfk_2` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
   CONSTRAINT `sales_returns_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
 ) ;
 CREATE TABLE `stock_adjustments` (
   `id` int NOT NULL AUTO_INCREMENT,
   `medicine_id` int DEFAULT NULL,
   `batch_id` int DEFAULT NULL,
   `qty_change` int DEFAULT NULL,
   `reason` varchar(80) DEFAULT NULL,
   `notes` varchar(255) DEFAULT NULL,
   `user_id` int DEFAULT NULL,
   `created_at` datetime DEFAULT NULL,
   PRIMARY KEY (`id`),
   KEY `medicine_id` (`medicine_id`),
   KEY `batch_id` (`batch_id`),
   KEY `user_id` (`user_id`),
   CONSTRAINT `stock_adjustments_ibfk_1` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`id`),
   CONSTRAINT `stock_adjustments_ibfk_2` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`),
   CONSTRAINT `stock_adjustments_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
 ) ;
 
 CREATE TABLE `users` (
   `id` int NOT NULL AUTO_INCREMENT,
   `name` varchar(120) NOT NULL,
   `email` varchar(150) NOT NULL,
   `password_hash` varchar(255) NOT NULL,
   `role` varchar(30) NOT NULL,
   `is_active` tinyint(1) DEFAULT NULL,
   `created_at` datetime DEFAULT NULL,
   PRIMARY KEY (`id`),
   UNIQUE KEY `ix_users_email` (`email`)
 ) ;
 
 CREATE TABLE `vendor_payments` (
   `id` int NOT NULL AUTO_INCREMENT,
   `vendor_id` int NOT NULL,
   `purchase_id` int DEFAULT NULL,
   `amount` float DEFAULT NULL,
   `mode` varchar(30) DEFAULT NULL,
   `payment_date` datetime DEFAULT NULL,
   `reference` varchar(120) DEFAULT NULL,
   `notes` varchar(255) DEFAULT NULL,
   `user_id` int DEFAULT NULL,
   PRIMARY KEY (`id`),
   KEY `vendor_id` (`vendor_id`),
   KEY `purchase_id` (`purchase_id`),
   KEY `user_id` (`user_id`),
   CONSTRAINT `vendor_payments_ibfk_1` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`),
   CONSTRAINT `vendor_payments_ibfk_2` FOREIGN KEY (`purchase_id`) REFERENCES `purchase_invoices` (`id`),
   CONSTRAINT `vendor_payments_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
 ) ;
 
 CREATE TABLE `vendors` (
   `id` int NOT NULL AUTO_INCREMENT,
   `name` varchar(150) NOT NULL,
   `contact_person` varchar(120) DEFAULT NULL,
   `phone` varchar(20) DEFAULT NULL,
   `email` varchar(150) DEFAULT NULL,
   `address` text,
   `gst_number` varchar(20) DEFAULT NULL,
   `license_number` varchar(60) DEFAULT NULL,
   `payment_terms` varchar(100) DEFAULT NULL,
   `credit_days` int DEFAULT NULL,
   `opening_balance` float DEFAULT NULL,
   `credit_limit` float DEFAULT NULL,
   `is_active` tinyint(1) DEFAULT NULL,
   `created_at` datetime DEFAULT NULL,
   PRIMARY KEY (`id`),
   UNIQUE KEY `name` (`name`)
 ) ;