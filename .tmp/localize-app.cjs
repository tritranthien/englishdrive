const fs = require('fs');
const root = 'D:/code/englishdrive/';
function edit(path, pairs) {
  let s = fs.readFileSync(root + path, 'utf8').replace(/\r\n/g, '\n');
  for (const [a, b] of pairs) s = s.split(a).join(b);
  fs.writeFileSync(root + path, s, 'utf8');
}
edit('apps/mobile/App.tsx', [
  ["'Ready'", "'Sẵn sàng'"], ["'Connecting to Gemini…'", "'Đang kết nối…'"],
  ["'Listening'", "'Đang lắng nghe'"], ["'You are speaking'", "'Bạn đang nói'"],
  ["'Thinking…'", "'Đang suy nghĩ…'"], ["'EnglishDrive is speaking'", "'Trợ lý đang nói'"],
  ["'Reconnecting…'", "'Đang kết nối lại…'"], ["'Audio paused'", "'Âm thanh tạm dừng'"], ["'Connection error'", "'Lỗi kết nối'"],
  ["'Free talk'", "'Trò chuyện tự do'"], ["'Daily life'", "'Cuộc sống hằng ngày'"], ["'Work & software'", "'Công việc & phần mềm'"],
  ["'Vocabulary'", "'Từ vựng'"], ["'Grammar'", "'Ngữ pháp'"], ["'Role play'", "'Đóng vai'"], ["'Pronunciation'", "'Phát âm'"],
  ['AFTER TRIP REPORT', 'TỔNG KẾT HỘI THOẠI'], ['title="Main topics"', 'title="Chủ đề chính"'],
  ['title="Grammar"', 'title="Ngữ pháp"'], ['title="New vocabulary"', 'title="Từ vựng mới"'],
  ['title="What went well"', 'title="Điểm làm tốt"'], ['title="Next session"', 'title="Buổi học tiếp theo"'],
  ['Your realtime speaking companion', 'Trợ lý luyện nói cùng bạn'],
  ['Sign in once, then start a hands-free voice conversation.', 'Đăng nhập để bắt đầu trò chuyện bằng giọng nói.'],
  ['accessibilityLabel="Name"', 'accessibilityLabel="Tên"'], ['placeholder="Your name"', 'placeholder="Tên của bạn"'],
  ['accessibilityLabel="Email"', 'accessibilityLabel="Địa chỉ email"'], ['placeholder="Email"', 'placeholder="Địa chỉ email"'],
  ['accessibilityLabel="Password"', 'accessibilityLabel="Mật khẩu"'], ['placeholder="Password (8+ characters)"', 'placeholder="Mật khẩu (ít nhất 8 ký tự)"'],
  ["'Create account'", "'Tạo tài khoản'"], ["'Sign in'", "'Đăng nhập'"],
  ["'Already registered? Sign in'", "'Đã có tài khoản? Đăng nhập'"], ["'New here? Create account'", "'Chưa có tài khoản? Đăng ký'"],
  ['VOICE FILTER TURNED OFF', 'BỘ LỌC GIỌNG NÓI ĐÃ TẮT'],
  ['Your voice did not match the enrolled profile, so this session is\n              sending audio without the filter. Reset the profile and enroll\n              again somewhere quiet.', 'Giọng nói chưa khớp với mẫu đã ghi nên phiên này đang gửi âm thanh\n              mà không lọc giọng. Bạn có thể chỉnh ngưỡng trong Cài đặt để thử\n              lại từ câu tiếp theo, hoặc ghi lại mẫu ở nơi yên tĩnh.'],
  ['TUTOR SAID', 'TRỢ LÝ NÓI'], ['NEW WORD', 'TỪ VỰNG MỚI'],
  ["'HIDE EARLIER LINES'", "'ẨN LỊCH SỬ'"], ['SHOW EARLIER LINES (', 'XEM LỊCH SỬ ('],
  ["'YOU' : 'TUTOR'", "'BẠN' : 'TRỢ LÝ'"],
  ['Analyzing your conversation…', 'Đang phân tích hội thoại…'], ['REPORT UNAVAILABLE', 'CHƯA CÓ BÁO CÁO'], ['RETRY ANALYSIS', 'PHÂN TÍCH LẠI'],
  ["'Microphone starts only after you tap Start.'", "'Mic chỉ hoạt động sau khi bạn nhấn Bắt đầu.'"],
  ["'Another app or phone call is using audio'", "'Ứng dụng khác hoặc cuộc gọi đang sử dụng âm thanh'"],
  ["'Restoring this conversation without creating a new session'", "'Đang khôi phục hội thoại hiện tại'"],
  ['`Gemini Live active via ${realtime.audioRoute.name}`', '`Đang trò chuyện qua ${realtime.audioRoute.name}`'],
  ["'END SESSION' : 'START GEMINI LIVE'", "'Kết thúc' : 'Bắt đầu'"],
  ["'Requires Android 12+ and an available Android assistant role.'", "'Cần Android 12 trở lên và hỗ trợ chọn trợ lý mặc định.'"],
  ["'Armed. You can lock the screen and say the wake phrase.'", "'Đã bật. Bạn có thể khóa màn hình và nói “Hey English Drive”.'"],
  ["'Ready to arm on-device wake detection.'", "'Sẵn sàng bật nhận diện câu gọi trên thiết bị.'"],
  ["'On-device recognition is unavailable on this phone.'", "'Điện thoại này chưa hỗ trợ nhận diện câu gọi trên thiết bị.'"],
  ["'Select EnglishDrive as the Android assistant first.'", "'Trước tiên, chọn EnglishDrive làm trợ lý mặc định.'"],
  ['SET AS ASSISTANT', 'CHỌN LÀM TRỢ LÝ'], ["'DISARM WAKE PHRASE'", "'TẮT CÂU GỌI'"], ["'ARM WAKE PHRASE'", "'BẬT CÂU GỌI'"],
  ['MY VOICE FILTER', 'BỘ LỌC GIỌNG NÓI'], ["'Checking on-device speaker verification…'", "'Đang kiểm tra bộ lọc giọng nói…'"],
  ["'The bundled open-source speaker model is unavailable. Rebuild the app.'", "'Không tìm thấy mô hình giọng nói. Vui lòng cài lại ứng dụng.'"],
  ['`Enrolling ${\n                      speakerVerification.status.enrollingKind ?? \'voice\'\n                    } profile. Keep speaking naturally. ${\n                      speakerVerification.progress\n                    }% complete.`', '`Đang ghi mẫu giọng cho mic ${microphoneLabels[speakerVerification.status.enrollingKind ?? currentVoiceProfileKind]}. Hãy nói tự nhiên. Hoàn tất ${speakerVerification.progress}%.`'],
  ['`Active for ${currentVoiceProfileKind} microphone. Matching turns and nearby short replies are sent to Gemini.`', '`Đang lọc giọng qua mic ${microphoneLabels[currentVoiceProfileKind]}. Câu khớp giọng và câu trả lời ngắn kế tiếp được gửi đến Gemini.`'],
  ['`Voice filter off for ${currentVoiceProfileKind} microphone. Conversation remains available until this profile is enrolled.`', '`Chưa có mẫu giọng cho mic ${microphoneLabels[currentVoiceProfileKind]}. Bạn vẫn có thể trò chuyện khi bộ lọc tắt.`'],
  ['Trước khi enroll:', 'Trước khi ghi mẫu giọng:'],
  ['Your voice profile uses an older audio pipeline. Enroll it\n                  again.', 'Mẫu giọng cũ không còn phù hợp với bộ lọc hiện tại. Hãy ghi lại mẫu.'],
  ["'PHONE MICROPHONE'", "'MIC ĐIỆN THOẠI'"], ["'HEADSET MICROPHONE'", "'MIC TAI NGHE'"],
  ["'ENROLLED' : 'NOT ENROLLED'", "'ĐÃ GHI MẪU' : 'CHƯA GHI MẪU'"], ["' · CURRENT'", "' · ĐANG DÙNG'"],
  ["'RE-ENROLL' : 'ENROLL'", "'Ghi lại mẫu giọng' : 'Ghi mẫu giọng'"], ['{kind.toUpperCase()}', '{microphoneLabels[kind]}'],
  ['Reset {kind} profile', 'Xóa mẫu giọng {microphoneLabels[kind]}'], ['Cancel enrollment', 'Hủy ghi mẫu giọng'],
  ['CONVERSATION MODE', 'CHẾ ĐỘ HỘI THOẠI'], ['· {currentVoiceProfileKind}', '· {microphoneLabels[currentVoiceProfileKind]}'],
  ['You can lock the screen after the conversation connects. Android\n              keeps the microphone session visible in a notification.', 'Bạn có thể khóa màn hình sau khi kết nối. Android sẽ hiển thị\n              thông báo khi mic đang hoạt động.'], ['Sign out', 'Đăng xuất'],
  ["'Could not read assistant status'", "'Không đọc được trạng thái trợ lý'"], ["'Assistant selection failed'", "'Không chọn được trợ lý mặc định'"],
  ["'Could not start Realtime'", "'Không bắt đầu được hội thoại'"], ["'Microphone permission is required'", "'Vui lòng cấp quyền sử dụng mic'"],
  ["'Wake phrase action failed'", "'Không thay đổi được trạng thái câu gọi'"], ["'Sign in failed'", "'Không đăng nhập được'"],
]);
const app = root + 'apps/mobile/App.tsx';
let s = fs.readFileSync(app, 'utf8');
s = s.replace('const statusLabels = {', "const microphoneLabels = { phone: 'điện thoại', headset: 'tai nghe' } as const;\n\nconst statusLabels = {");
fs.writeFileSync(app, s);
edit('apps/mobile/android/app/src/main/res/values/strings.xml', [
  ['Active conversation', 'Hội thoại đang hoạt động'],
  ['Keeps an EnglishDrive voice conversation active with the screen locked.', 'Duy trì hội thoại EnglishDrive khi màn hình khóa.'],
  ['EnglishDrive conversation active', 'EnglishDrive đang trò chuyện'],
  ['Microphone and audio are active. Tap to return.', 'Mic và âm thanh đang hoạt động. Nhấn để quay lại.'],
  ['End audio', 'Kết thúc'], ['EnglishDrive wake phrase armed', 'EnglishDrive đã bật câu gọi'],
  ['Listening on-device for “Hey English Drive”.', 'Đang chờ câu gọi “Hey English Drive” trên thiết bị.'],
]);
for (const path of ['apps/mobile/src/features/speaker-verification/SpeakerMatchSettings.tsx', 'apps/mobile/src/features/speaker-verification/SpeakerMatchSettings.test.tsx']) {
  edit(path, [['ĐIỂM MATCH & NGƯỠNG', 'ĐỘ KHỚP & NGƯỠNG'], ['ngưỡng match', 'ngưỡng khớp'], ['Ngưỡng match giọng nói', 'Ngưỡng khớp giọng nói']]);
}
edit('apps/mobile/src/features/speaker-verification/useSpeakerVerification.ts', [["'Voice enrollment failed'", "'Không ghi được mẫu giọng'"], ["'Microphone permission is required'", "'Vui lòng cấp quyền sử dụng mic'"]]);
edit('apps/mobile/src/features/speaker-verification/speakerVerification.service.ts', [["'Native speaker verification is unavailable'", "'Bộ lọc giọng nói không khả dụng trên thiết bị'"]]);
edit('apps/mobile/src/features/live-conversation/hooks/useLiveConversation.ts', [["'Microphone permission is required'", "'Vui lòng cấp quyền sử dụng mic'"], ["'Unknown live conversation error'", "'Đã xảy ra lỗi hội thoại'"], ["'Logical session is unavailable'", "'Phiên hội thoại không khả dụng'"], ["'Network unavailable'", "'Không có kết nối mạng'"]]);
edit('apps/mobile/src/features/live-conversation/services/liveAudio.service.ts', [["'Native live audio is unavailable'", "'Âm thanh trực tiếp không khả dụng trên thiết bị'"], ["'Native audio error'", "'Lỗi âm thanh trên thiết bị'"]]);
edit('apps/mobile/src/api/client.ts', [['`Request failed with status ${response.status}`', '`Yêu cầu thất bại (mã ${response.status})`']]);
