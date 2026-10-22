# Universal Bilingual Video Subtitle — Development Plan

## 1. Mục tiêu

Tích hợp vào ứng dụng Android khả năng nhận **URL video từ nhiều nền tảng** và tự động tạo phụ đề song ngữ **English + Vietnamese**, bất kể ngôn ngữ gốc.

Ví dụ:

- Tiếng Trung → tiếng Anh + tiếng Việt.
- Tiếng Anh → giữ tiếng Anh gốc + dịch tiếng Việt.
- Tiếng Việt → dịch tiếng Anh + giữ tiếng Việt gốc.
- Tiếng Nhật, Hàn hoặc ngôn ngữ khác được model hỗ trợ → tiếng Anh + tiếng Việt.

Ngôn ngữ nguồn được phát hiện tự động. Với video có nhiều ngôn ngữ đan xen, cần phát hiện/xử lý ở cấp đoạn.

## 2. Tech stack dự kiến

| Thành phần | Công nghệ |
|---|---|
| Android | Kotlin + Media3 ExoPlayer |
| Backend API | NestJS |
| Background jobs | BullMQ + Redis |
| Video resolver | Adapter-based, yt-dlp + hỗ trợ MP4/HLS |
| Audio extraction | FFmpeg |
| Speech-to-Text | faster-whisper (self-host) |
| Translation | Gemini API |
| Subtitle format | JSON + SRT/VTT |
| Storage | Local / Object Storage |

**Định hướng:** ưu tiên giải pháp tiết kiệm, dễ tự host và có thể thay nhà cung cấp AI khi cần.

## 3. Workflow

```text
Android: Nhập/chia sẻ URL video
    ↓
NestJS: Validate URL, tạo job
    ↓
Video Resolver: Xác định nguồn và quyền truy cập
    ↓
yt-dlp / FFmpeg: Lấy và chuẩn hóa audio
    ↓
faster-whisper: Speech-to-Text + phát hiện ngôn ngữ + timestamp
    ↓
Gemini: Dịch theo ngữ cảnh sang tiếng Anh và tiếng Việt
    ↓
Backend: Xuất subtitle JSON / SRT / VTT, cache kết quả
    ↓
Android: Phát video + hiển thị song ngữ đồng bộ
```

> Không phải URL nào cũng có thể truy xuất được video/audio. Nguồn DRM, riêng tư hoặc hạn chế tải phải được xử lý bằng thông báo lỗi phù hợp; chỉ sử dụng nội dung có quyền truy cập và quyền xử lý hợp lệ.

## 4. Milestones

### M1 — Video Resolver

- [ ] Nhận URL từ nhiều nguồn và hỗ trợ Android Share Intent.
- [ ] Hỗ trợ nguồn MP4/HLS trực tiếp và các website tương thích yt-dlp.
- [ ] Thiết kế adapter cho từng nguồn để dễ mở rộng.
- [ ] Kiểm tra URL an toàn, quyền truy cập, xử lý nguồn không hỗ trợ.

**Deliverable:** URL hợp lệ → lấy được audio hoặc trả lỗi có ý nghĩa.

### M2 — Speech-to-Text

- [ ] Trích xuất/chuẩn hóa audio bằng FFmpeg.
- [ ] Tích hợp faster-whisper.
- [ ] Tự động phát hiện ngôn ngữ.
- [ ] Tạo transcript và timestamp theo từng segment.
- [ ] Kiểm thử video có nhiều ngôn ngữ.

**Deliverable:** Transcript gốc có timestamp.

### M3 — Bilingual Translation

- [ ] Tích hợp Gemini API.
- [ ] Sinh phụ đề tiếng Anh + tiếng Việt từ transcript.
- [ ] Giữ nguyên nội dung gốc khi nguồn là tiếng Anh hoặc tiếng Việt.
- [ ] Dịch theo nhóm câu, giữ nguyên timestamp và thứ tự segment.
- [ ] Xuất JSON và hai track SRT/VTT hoặc định dạng song ngữ tùy chỉnh.

**Deliverable:** Phụ đề song ngữ đồng bộ theo thời gian.

### M4 — Android Player

- [ ] Tích hợp Media3 ExoPlayer cho nguồn video được hỗ trợ.
- [ ] Hiển thị đồng thời hai dòng phụ đề Anh–Việt từ JSON hoặc track phù hợp.
- [ ] Cho phép bật/tắt từng ngôn ngữ, tùy chỉnh cỡ chữ.
- [ ] Đồng bộ khi tua, tạm dừng và tiếp tục video.

**Deliverable:** Người dùng xem video và đọc phụ đề song ngữ.

### M5 — Optimization

- [ ] Tạo background job với BullMQ + Redis.
- [ ] Theo dõi trạng thái: queued / processing / completed / failed.
- [ ] Cache theo video, ngôn ngữ đích và phiên bản pipeline/model.
- [ ] Tối ưu file tạm, tốc độ, chi phí và tài nguyên server.
- [ ] Thiết lập giới hạn dung lượng, độ dài video, thời gian xử lý và cleanup.

**Deliverable:** Pipeline đủ ổn định cho MVP.

## 5. API dự kiến

| Method | Endpoint | Chức năng |
|---|---|---|
| `POST` | `/subtitle/jobs` | Tạo job từ URL |
| `GET` | `/subtitle/jobs/:id` | Lấy tiến độ, trạng thái và ID kết quả |
| `GET` | `/subtitle/:id` | Lấy JSON phụ đề song ngữ |
| `GET` | `/subtitle/:id/export?format=vtt&lang=en` | Xuất track phụ đề |

Ví dụ response:

```json
{
  "sourceLanguage": "zh",
  "targetLanguages": ["en", "vi"],
  "segments": [
    {
      "id": 1,
      "startMs": 1200,
      "endMs": 3600,
      "original": "你好，你今天怎么样？",
      "en": "Hello, how are you today?",
      "vi": "Xin chào, hôm nay bạn thế nào?"
    }
  ]
}
```

## 6. Nguyên tắc kiến trúc

- Tách **Video Resolver**, **Transcription**, **Translation** và **Subtitle Rendering** thành module riêng.
- Không giả định có thể phát hay tải mọi URL; player và resolver có phạm vi hỗ trợ khác nhau.
- Phòng chống SSRF: xác thực URL, chặn địa chỉ nội bộ/metadata, kiểm tra redirect và giới hạn tải.
- Xử lý tác vụ dài ở background, không giữ HTTP request liên tục.
- Timestamp phải xuất phát từ speech recognition/alignment, không để model dịch tự tạo mốc thời gian.
- Có thể tái sử dụng transcript nếu cần dịch lại hoặc đổi nhà cung cấp dịch.
- MVP ưu tiên phụ đề chính xác cho video có sẵn, **chưa triển khai phụ đề real-time**.

## 7. Tiêu chí hoàn thành MVP

1. Người dùng dán/chia sẻ một URL video thuộc nguồn được hỗ trợ.
2. Backend có thể xử lý audio và phát hiện ngôn ngữ tự động.
3. Tạo phụ đề **English + Vietnamese** đúng thứ tự và gần khớp mốc phát.
4. Android phát được video tương thích và hiển thị đồng thời hai dòng phụ đề.
5. Có trạng thái job, báo lỗi, và lưu/cache kết quả để sử dụng lại.

## 8. Hướng mở rộng sau MVP

- Chạm phụ đề để phát lại đoạn hội thoại.
- Lưu từ vựng/cụm từ tiếng Anh và nghĩa tiếng Việt.
- Chọn một câu để luyện nghe hoặc luyện phát âm.
- Chế độ học tiếng Anh với bản dịch ẩn/hiện tùy nhu cầu.
