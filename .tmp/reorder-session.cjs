const fs = require('fs');
const path = 'D:/code/englishdrive/apps/mobile/App.tsx';
let source = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const start = source.indexOf('      <ScrollView contentContainerStyle={styles.sessionContainer}>');
const end = source.indexOf('      </ScrollView>\n    </SafeAreaView>', start);
if (start < 0 || end < 0) throw new Error('Session markers missing');
const body = source.slice(start, end);
const settingsStart = body.indexOf('        <View style={styles.assistantPanel}>');
const statusStart = body.indexOf('        <View style={styles.statusPanel}>');
const pulseStart = body.indexOf('          <View\n            style={[\n              styles.pulse,', statusStart);
const contentStart = body.indexOf('        {isActive && realtime.filterBypassed');
const controlsStart = body.indexOf('        <View>\n          <Pressable\n            disabled={', contentStart);
const signOutStart = body.indexOf('          <Pressable\n            disabled={isActive || assistantStatus?.wakeArmed}', controlsStart);
const modesStart = body.indexOf('          <Text style={styles.modeTitle}>', statusStart);
if ([settingsStart, statusStart, pulseStart, contentStart, controlsStart, signOutStart, modesStart].some(n => n < 0)) throw new Error('Layout block missing');
const settings = body.slice(settingsStart, statusStart);
const modes = body.slice(modesStart, pulseStart);
const status = '        <View style={styles.statusPanel}>\n' + body.slice(pulseStart, contentStart);
let content = body.slice(contentStart, controlsStart);
const userCaption = `        <View style={[styles.captionPanel, styles.userCaptionPanel]}>
          <Text style={[styles.captionLabel, styles.userCaptionLabel]}>BẠN NÓI · GEMINI NGHE ĐƯỢC</Text>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.captionScroll}>
            <Text style={realtime.userTranscript ? styles.userCaptionText : styles.captionPlaceholder}>
              {realtime.userTranscript || 'Lời nói được Gemini nhận sẽ hiện ở đây.'}
            </Text>
          </ScrollView>
        </View>

`;
content = content.replace('        {isActive && realtime.assistantTranscript ? (', userCaption + '        {realtime.assistantTranscript ? (');
content = content.replace('<View key={line.id} style={styles.historyRow}>', '<View key={line.id} style={[styles.historyRow, line.role === \'user\' && styles.userHistoryRow]}>');
content = content.replace('<Text style={styles.historyRole}>', '<Text style={[styles.historyRole, line.role === \'user\' && styles.userCaptionLabel]}>');
content = content.replace('<Text style={styles.historyText}>{line.text}</Text>', '<Text style={[styles.historyText, line.role === \'user\' && styles.userHistoryText]}>{line.text}</Text>');
content = content.replace('{isActive && realtime.history.length > 0 ?', '{realtime.history.length > 0 ?');
const controls = body.slice(controlsStart, signOutStart) + '        </View>\n\n';
const account = body.slice(signOutStart).replace(/        <\/View>\s*$/, '');
const replacement = `      <ScrollView contentContainerStyle={styles.sessionContainer}>
        <View style={styles.sessionHeader}>
          <Text style={styles.panelTitle}>ENGLISH DRIVE</Text>
          <Text style={styles.sessionName}>{auth.user.name}</Text>
        </View>

${content}${status}${controls}        <View style={styles.settingsPanel}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cài đặt"
            accessibilityState={{ expanded: settingsOpen || isEnrolling, disabled: isEnrolling }}
            disabled={isEnrolling}
            onPress={() => setSettingsOpen(open => !open)}
            style={styles.settingsToggle}
          >
            <Text style={styles.panelTitle}>CÀI ĐẶT</Text>
            <Text style={styles.settingsSummary}>
              {conversationModes.find(mode => mode.value === conversationMode)?.label} · {currentVoiceProfileKind}
            </Text>
            <Text style={styles.settingsArrow}>{settingsOpen || isEnrolling ? '▴' : '▾'}</Text>
          </Pressable>
          <View style={[styles.settingsContent, !(settingsOpen || isEnrolling) && styles.hiddenSettings]}>
${settings}            <View style={styles.assistantPanel}>
${modes}            </View>
            <Text style={styles.panelText}>
              You can lock the screen after the conversation connects. Android keeps the microphone session visible in a notification.
            </Text>
${account}          </View>
        </View>
`;
source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(path, source, 'utf8');
