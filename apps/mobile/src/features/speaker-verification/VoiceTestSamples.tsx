import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const comparisonSentence =
  'Hôm nay tôi luyện nói tiếng Anh bằng giọng tự nhiên. Buổi sáng tôi chuẩn bị đi làm, còn buổi chiều tôi ghé chợ mua trái cây và trở về nhà.';

const samples = [
  {
    title: 'Câu dài',
    instruction:
      'Đọc liền mạch với giọng và âm lượng bình thường, khoảng 6–10 giây. Đây là mẫu chuẩn để xác nhận giọng trước khi thử các nhóm khác.',
    phrases: [comparisonSentence],
  },
  {
    title: 'Câu ngắn',
    instruction:
      'Sau khi mẫu dài được nhận, đọc từng câu dưới đây, mỗi lần chỉ một câu rồi chờ kết quả. Điểm câu ngắn là tham khảo; trạng thái kế thừa giọng không có điểm mới.',
    phrases: ['Xin chào.', 'Được rồi.', 'Cảm ơn bạn.', 'Bạn nói lại nhé.'],
  },
  {
    title: 'Giọng cao',
    instruction:
      'Đọc cùng câu mẫu với cao độ nhỉnh hơn giọng thường, trong khoảng thoải mái. Giữ âm lượng và tốc độ như mẫu chuẩn.',
    phrases: [comparisonSentence],
  },
  {
    title: 'Giọng trầm',
    instruction:
      'Đọc cùng câu mẫu với cao độ thấp hơn giọng thường, trong khoảng thoải mái. Giữ âm lượng và tốc độ như mẫu chuẩn.',
    phrases: [comparisonSentence],
  },
  {
    title: 'Nói to',
    instruction:
      'Đọc cùng câu mẫu to hơn bình thường, rõ tiếng, không hét. Giữ cao độ, tốc độ và khoảng cách đến mic như mẫu chuẩn.',
    phrases: [comparisonSentence],
  },
  {
    title: 'Nói nhỏ',
    instruction:
      'Đọc cùng câu mẫu nhỏ hơn bình thường nhưng vẫn thành tiếng, không thì thầm. Giữ cao độ, tốc độ và khoảng cách đến mic như mẫu chuẩn.',
    phrases: [comparisonSentence],
  },
];

export function VoiceTestSamples({ active }: { active: boolean }) {
  const [selected, setSelected] = useState(0);
  const sample = samples[selected];
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>CÂU MẪU KIỂM TRA GIỌNG</Text>
      <Text style={styles.hint}>
        {active
          ? 'Đợi trợ lý nói xong, đọc mẫu rồi xem điểm và độ dài mẫu ở phía trên.'
          : 'Chọn mẫu trước, rồi bấm Bắt đầu để đọc và xem điểm trong hội thoại.'}{' '}
        Đọc mỗi mẫu 3 lần. So sánh ở cùng mic, khoảng cách và ngưỡng; giữ phòng
        yên tĩnh và chỉ thay đổi một yếu tố mỗi lần.
      </Text>
      <View style={styles.choices}>
        {samples.map((item, index) => (
          <Pressable
            key={item.title}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === index }}
            onPress={() => setSelected(index)}
            style={[styles.choice, selected === index && styles.selectedChoice]}
          >
            <Text
              style={[
                styles.choiceText,
                selected === index && styles.selectedText,
              ]}
            >
              {item.title}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>
        {selected + 1}/6 · {sample.title}
      </Text>
      <Text style={styles.hint}>{sample.instruction}</Text>
      {sample.phrases.map(phrase => (
        <Text key={phrase} selectable style={styles.phrase}>
          {phrase}
        </Text>
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => setSelected(index => (index + 1) % samples.length)}
        style={styles.next}
      >
        <Text style={styles.nextText}>Mẫu tiếp theo →</Text>
      </Pressable>
      <Text style={styles.hint}>
        Bộ câu này giúp so sánh điều kiện đọc; điểm khớp không phải phần trăm
        chính xác. Khi ghi mẫu giọng để sử dụng hằng ngày, đọc các câu hướng dẫn
        bằng giọng tự nhiên của bạn.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#365069',
    paddingTop: 14,
  },
  title: { color: '#55ddb6', fontWeight: '800', fontSize: 12, marginBottom: 6 },
  hint: { color: '#a9b7ca', fontSize: 12, lineHeight: 19, marginTop: 5 },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 12,
  },
  choice: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#365069',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  selectedChoice: { borderColor: '#55ddb6', backgroundColor: '#12352f' },
  choiceText: { color: '#a9b7ca', fontSize: 13 },
  selectedText: { color: '#55ddb6', fontWeight: '700' },
  label: { color: '#f7fbff', fontSize: 14, fontWeight: '700' },
  phrase: {
    color: '#f7fbff',
    fontSize: 17,
    lineHeight: 27,
    backgroundColor: '#12243a',
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
  },
  next: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  nextText: { color: '#55ddb6', fontSize: 13 },
});
