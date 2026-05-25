# Tính toán Giới hạn Vercel Free + Firebase Free (1 tháng)

## 1. VERCEL FREE (1 tháng)

### CPU Time Budget:

- Limit: **100 giờ/tháng**
- = 360,000 giây/tháng

### CPU Time / Request:

- Mỗi API call: ~0.3s (check eligibility + create/update)
- **Requests/tháng: 360,000s ÷ 0.3s = 1,200,000 requests/tháng**

### Requests/Khách/Tháng:

- 3 lần quay + 3 lần dùng = **6 requests/khách**
- 1,200,000 ÷ 6 = **200,000 khách/tháng** (Vercel không bottleneck)

---

## 2. FIREBASE FREE (1 tháng - Firestore)

### Read Operations:

- Limit: **50,000 reads/ngày**
- **Tháng: 50,000 × 30 = 1,500,000 reads/tháng**
- Mỗi khách: 6 reads (3 quay check + 3 consume check)
- Tối đa: 1,500,000 ÷ 6 = **250,000 khách/tháng**

### Write Operations:

- Limit: **20,000 writes/ngày**
- **Tháng: 20,000 × 30 = 600,000 writes/tháng**
- Mỗi khách: 6 writes (3 create spin + 3 update status)
- Tối đa: 600,000 ÷ 6 = **100,000 khách/tháng** ⚠️ **BOTTLENECK**

---

## 3. KẾT LUẬN (1 tháng)

| Service         | Quota/Tháng | Max Customers/Month  |
| --------------- | ----------- | -------------------- |
| Vercel CPU      | 100 giờ     | 200,000 khách        |
| Firebase Writes | 600,000     | **100,000 khách** ⚠️ |
| Firebase Reads  | 1,500,000   | 250,000 khách        |

### **GiỚI HẠN 1 THÁNG: 100,000 khách/tháng**

### **Trung bình/ngày:**

- 100,000 khách/tháng ÷ 30 ngày = **3,333 khách/ngày**
- (Hoặc 3,000 khách/ngày để margin an toàn 10%)

---

## 4. MARGIN ANALYSIS (1 tháng)

### Scenario A: Maximum (3,333 khách/ngày)

**Daily:**

- Firebase Writes: 3,333 × 6 = 20,000 writes/ngày (100% quota) ⚠️ Tight
- Firebase Reads: 3,333 × 6 = 20,000 reads/ngày (40% quota) ✓
- Vercel CPU: 3,333 × 1.8s = 6,000s/ngày (50% quota) ✓

**Monthly:** 100,000 khách/tháng | **Risk:** Spike traffic → exceed quota

### Scenario B: Safe (3,000 khách/ngày) - **KHUYẾN CÁO**

**Daily:**

- Firebase Writes: 3,000 × 6 = 18,000 writes/ngày (90% quota) ✓
- Firebase Reads: 3,000 × 6 = 18,000 reads/ngày (36% quota) ✓
- Vercel CPU: 3,000 × 1.8s = 5,400s/ngày (45% quota) ✓

**Monthly:** 90,000 khách/tháng | **Benefit:** 10% buffer an toàn

---

## 5. KHUYẾN NGHỊ

| Mục đích           | Khách/Ngày | Khách/Tháng | Margin | Risk    |
| ------------------ | ---------- | ----------- | ------ | ------- |
| **Chế độ An toàn** | 3,000      | 90,000      | 10%    | Low ✓   |
| **Chế độ Maximum** | 3,333      | 100,000     | 0%     | High ⚠️ |

**→ SỬ DỤNG: 3,000 khách/ngày = 90,000 khách/tháng**

---

## 6. NẾU CẦN VƯỢT QUÁ 90,000 KHÁCH/THÁNG

### Option 1: Firebase Blaze Plan

- Write cost: $0.06/100k operations
- 600k writes/tháng = $3.60/tháng
- Scale: Hàng triệu khách

### Option 2: Vercel Pro ($20/tháng)

- Unlocked CPU time
- Không giải quyết Firebase bottleneck

### Option 3: MySQL Backend

- Code đã hỗ trợ (lib/spins/store.ts)
- Chi phí: $5-15/tháng (VPS/RDS)
- Scale: Unlimited

---

## 7. CHỈ TIÊU CUỐI CÙNG

**Cho NGHIEM_THU.md:**

- Giới hạn khách/ngày: 3,000 (an toàn)
- Giới hạn khách/tháng: 90,000
- Quay/khách/ngày: 3 lượt
- Dùng voucher/khách/ngày: 3 lượt
- Bottleneck: Firebase Firestore writes (20,000/ngày)
