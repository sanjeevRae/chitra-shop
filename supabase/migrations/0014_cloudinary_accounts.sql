-- 0014_cloudinary_accounts.sql
-- Add cloudinary_account column to tables that store image references.
-- This enables multi-account Cloudinary setup (products_1, products_2, general).
-- 
-- Run: supabase db reset or migrate up manually.
-- These columns are generated from the image URL to detect which Cloudinary account holds the asset.

-- Products table: track which Cloudinary account holds each product's main + gallery images
ALTER TABLE public.product
ADD COLUMN IF NOT EXISTS cloudinary_account TEXT
    GENERATED ALWAYS AS (
      CASE
        WHEN main_image_url LIKE 'https://res.cloudinary.com/%' THEN
          CASE
            WHEN main_image_url LIKE '%/gntooplg/%' THEN 'products_1'
            WHEN main_image_url LIKE '%/wd55wmrq/%' THEN 'products_2'
            ELSE 'general'
          END
        WHEN main_image_url LIKE 'https://%cloudinary%' THEN
          CASE
            WHEN main_image_url LIKE '%gntooplg%' THEN 'products_1'
            WHEN main_image_url LIKE '%wd55wmrq%' THEN 'products_2'
            ELSE 'general'
          END
        ELSE 'general'
      END
    ) STORED,
ADD CONSTRAINT product_cloudinary_account_check
CHECK (cloudinary_account IN ('products_1', 'products_2', 'general'));

-- Category table: image references
ALTER TABLE public.category
ADD COLUMN IF NOT EXISTS cloudinary_account TEXT
    GENERATED ALWAYS AS (
      CASE
        WHEN image LIKE 'https://res.cloudinary.com/%' THEN
          CASE
            WHEN image LIKE '%/gntooplg/%' THEN 'products_1'
            WHEN image LIKE '%/wd55wmrq/%' THEN 'products_2'
            ELSE 'general'
          END
        WHEN image LIKE 'https://%cloudinary%' THEN
          CASE
            WHEN image LIKE '%gntooplg%' THEN 'products_1'
            WHEN image LIKE '%wd55wmrq%' THEN 'products_2'
            ELSE 'general'
          END
        ELSE 'general'
      END
    ) STORED,
ADD CONSTRAINT category_cloudinary_account_check
CHECK (cloudinary_account IN ('products_1', 'products_2', 'general'));

-- Hero banner table
ALTER TABLE public.herobanner
ADD COLUMN IF NOT EXISTS cloudinary_account TEXT
    GENERATED ALWAYS AS (
      CASE
        WHEN image LIKE 'https://res.cloudinary.com/%' THEN
          CASE
            WHEN image LIKE '%/gntooplg/%' THEN 'products_1'
            WHEN image LIKE '%/wd55wmrq/%' THEN 'products_2'
            ELSE 'general'
          END
        WHEN image LIKE 'https://%cloudinary%' THEN
          CASE
            WHEN image LIKE '%gntooplg%' THEN 'products_1'
            WHEN image LIKE '%wd55wmrq%' THEN 'products_2'
            ELSE 'general'
          END
        ELSE 'general'
      END
    ) STORED,
ADD CONSTRAINT herobanner_cloudinary_account_check
CHECK (cloudinary_account IN ('products_1', 'products_2', 'general'));

-- Customers table: photo reference
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS cloudinary_account TEXT
    GENERATED ALWAYS AS (
      CASE
        WHEN photo LIKE 'https://res.cloudinary.com/%' THEN
          CASE
            WHEN photo LIKE '%/gntooplg/%' THEN 'products_1'
            WHEN photo LIKE '%/wd55wmrq/%' THEN 'products_2'
            ELSE 'general'
          END
        WHEN photo LIKE 'https://%cloudinary%' THEN
          CASE
            WHEN photo LIKE '%gntooplg%' THEN 'products_1'
            WHEN photo LIKE '%wd55wmrq%' THEN 'products_2'
            ELSE 'general'
          END
        ELSE 'general'
      END
    ) STORED,
ADD CONSTRAINT customers_cloudinary_account_check
CHECK (cloudinary_account IN ('products_1', 'products_2', 'general'));

-- Index for efficient lookups by account (optional but helpful for admin reports)
CREATE INDEX IF NOT EXISTS idx_product_cloudinary_account ON public.product (cloudinary_account);
CREATE INDEX IF NOT EXISTS idx_category_cloudinary_account ON public.category (cloudinary_account);
CREATE INDEX IF NOT EXISTS idx_herobanner_cloudinary_account ON public.herobanner (cloudinary_account);
CREATE INDEX IF NOT EXISTS idx_customers_cloudinary_account ON public.customers (cloudinary_account);

-- Comment: This migration adds account tracking columns. Existing rows get their account
-- auto-computed from the image URL pattern. New products/banners/etc. saved through the
-- updated admin UI will get the account assigned automatically (round-robin between
-- products_1 and products_2; general for everything else).