<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/e60509fe-9ef0-403b-9eea-413c8b01b645

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## MySQL (Spin records + Admin)

This app now persists spin records to MySQL and displays them at `/admin`.

Setup:

1. Copy `.env.example` to `.env.local` and fill in your MySQL connection.
2. Run `database/mysql-schema.sql` on your MySQL server.
3. Run `npm run dev`.

Notes:
- `app/api/spin`, `app/api/spins`, `app/api/settings`, and `app/api/export` all use MySQL.
- Admin can set the voucher activation delay in minutes at `/admin`.
- Each voucher spin stores its own `voucher_usable_from`, so changing the admin setting only affects future spins.
- Client-side Firebase remains optional and is only used for analytics in `lib/firebase/client.ts`.

## Google Sheets anti-fraud backend

Spin anti-fraud flow now uses Google Sheets with Fingerprint `visitorId`.

Client vào trang gọi **một lần** `POST /api/spin/init` với `{ visitorId, sessionId?, locationId? }`: chỉ đọc sheet `users` để kiểm tra session/device; **chỉ khi có `locationId`** mới đọc thêm locations/campaigns/spin_logs (giảm đọc sheet và băng thông).

Sau khi deploy, nếu vẫn thấy request cũ (`device-status`, `check-eligibility`): đó là **cache JS/tab chưa reload** — hard refresh hoặc mở ẩn danh; production bundle mới chỉ gọi `/api/spin/init`.

Required env:
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` (default: `storage/permission/crawllinkedinapp-2e203d199c52.json`)

Optional (override tab names nếu cần; giá trị được trim trong code):
- `GOOGLE_SHEETS_TAB_LOCATIONS` (mặc định `locations`)
- `GOOGLE_SHEETS_TAB_CAMPAIGNS` (mặc định `campaigns`)
- `GOOGLE_SHEETS_TAB_USERS` (mặc định `users`)
- `GOOGLE_SHEETS_TAB_PRIZES` (mặc định `prizes`)
- `GOOGLE_SHEETS_TAB_SPIN_LOGS` (mặc định `spin_logs`)
- `GOOGLE_SHEETS_TAB_VOUCHERS` (mặc định `vouchers`)

Required sheet tabs and columns:
- `locations`: `location_id`, `location_name`, `active`
- `campaigns`: `campaign_id`, `location_id`, `campaign_name`, `spin_start`, `spin_end`, `active`
- `prizes`: `reward_id`, `location_id`, `campaign_id`, `weight`  
  (`reward_label/reward_type/reward_code` được khóa cứng theo `lib/rewards/rewards.ts`, không đọc từ sheet)
- `spin_logs`: `spin_log_id`, `visitor_id`, `location_id`, `campaign_id`, `reward_id`, `reward_label`, `reward_type`, `reward_code`, `customer_name`, `customer_phone`, `created_at`, `day_key`
- `vouchers`: `voucher_code`, `spin_log_id`, `location_id`, `campaign_id`, `visitor_id`, `reward_id`, `reward_label`, `reward_code`, `customer_name`, `customer_phone`, `status`, `issued_at`, `expire_at`, `used_at`
- `users`: **`session_id`** (cột A), **`visitor_id`** (B), **`customer_phone`** (C), **`customer_name`** (D), **`first_seen_at`** (E), **`last_seen_at`** (F) — `session_id` khóa phiên (ẩn danh ↔ tab thường không dùng chéo)
